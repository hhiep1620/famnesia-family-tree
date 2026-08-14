alter table public.workspace_invitations
  add column if not exists accepted_at timestamptz,
  add column if not exists revoked_at timestamptz;

create unique index if not exists workspace_invitations_token_hash_unique
  on public.workspace_invitations (token_hash)
  where token_hash is not null;

alter table public.draft_submissions
  add column if not exists terminal_at timestamptz;

create table public.draft_review_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  draft_submission_id uuid not null references public.draft_submissions(id) on delete cascade,
  draft_revision integer not null,
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  decision text not null,
  operation_ids text[] not null,
  note text,
  created_at timestamptz not null default now(),
  constraint draft_review_events_revision_positive check (draft_revision > 0),
  constraint draft_review_events_decision_allowed check (decision in ('approve', 'reject')),
  constraint draft_review_events_operations_nonempty check (cardinality(operation_ids) > 0),
  constraint draft_review_events_reject_note_required check (decision <> 'reject' or length(trim(coalesce(note, ''))) > 0),
  constraint draft_review_events_submission_workspace_fk foreign key (workspace_id, draft_submission_id)
    references public.draft_submissions(workspace_id, id) on delete cascade
);

create index draft_review_events_draft_idx
  on public.draft_review_events (draft_submission_id, created_at);

alter table public.draft_review_events enable row level security;
grant select on public.draft_review_events to authenticated;

create function public.can_read_workspace_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id = (select auth.uid()) or exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = target_user_id
  );
$$;

create policy user_profiles_select_workspace_peer on public.user_profiles
  for select to authenticated using (public.can_read_workspace_profile(id));

create policy draft_review_events_select_participant on public.draft_review_events
  for select to authenticated using (public.can_read_draft(draft_submission_id));

-- Submitted payloads are immutable through the table API. Contributors may
-- only edit an explicitly editable draft state; review mutations go through
-- the revision-checked RPC below.
drop policy if exists draft_submissions_update_own on public.draft_submissions;
create policy draft_submissions_update_own on public.draft_submissions
  for update to authenticated using (public.can_edit_own_draft(id))
  with check (
    contributor_user_id = (select auth.uid())
    and public.workspace_role(workspace_id) = 'contributor'
    and status in ('draft', 'needs_changes', 'partially_reviewed')
  );

drop policy if exists draft_submissions_update_reviewer on public.draft_submissions;
drop policy if exists draft_operations_update_own_or_reviewer on public.draft_operations;
create policy draft_operations_update_own on public.draft_operations
  for update to authenticated using (public.can_edit_own_draft(draft_submission_id))
  with check (public.can_edit_own_draft(draft_submission_id));

create function public.create_family_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  workspace_id uuid;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'WORKSPACE_NAME_INVALID';
  end if;
  insert into public.workspaces (owner_user_id, name)
  values (actor_id, trim(p_name))
  returning id into workspace_id;
  return workspace_id;
end;
$$;

create function public.create_workspace_invitation(
  p_workspace_id uuid,
  p_email text,
  p_role public.workspace_role,
  p_token_hash text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  normalized_email text := lower(trim(coalesce(p_email, '')));
  invitation_id uuid;
begin
  if actor_id is null or not public.can_manage_workspace(p_workspace_id) then
    raise exception using errcode = '42501', message = 'MEMBER_MANAGEMENT_FORBIDDEN';
  end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or p_role not in ('editor', 'contributor', 'viewer')
     or p_token_hash !~ '^[a-f0-9]{64}$'
     or p_expires_at <= now() or p_expires_at > now() + interval '30 days' then
    raise exception using errcode = '22023', message = 'INVITATION_INVALID';
  end if;
  if exists (
    select 1 from public.user_profiles profile
    join public.workspace_members member on member.user_id = profile.id
    where member.workspace_id = p_workspace_id and profile.email = normalized_email
  ) then
    raise exception using errcode = '23505', message = 'MEMBER_ALREADY_EXISTS';
  end if;
  update public.workspace_invitations set status = 'revoked', revoked_at = now(), updated_at = now()
    where workspace_id = p_workspace_id and email = normalized_email and status = 'pending';
  insert into public.workspace_invitations (
    workspace_id, email, role, status, token_hash, invited_by_user_id, expires_at
  ) values (
    p_workspace_id, normalized_email, p_role, 'pending', p_token_hash, actor_id, p_expires_at
  ) returning id into invitation_id;
  insert into public.activity_events (
    workspace_id, actor_user_id, actor_email, actor_name, action, entity_type, entity_id, summary, metadata
  )
  select p_workspace_id, actor_id, profile.email::text, nullif(profile.display_name, ''),
    'member.invited', 'invitation', invitation_id::text,
    format('Invited %s as %s', normalized_email, p_role),
    jsonb_build_object('role', p_role, 'expiresAt', p_expires_at)
  from public.user_profiles profile where profile.id = actor_id;
  return jsonb_build_object(
    'id', invitation_id,
    'email', normalized_email,
    'role', p_role,
    'expiresAt', p_expires_at
  );
end;
$$;

create function public.accept_workspace_invitation(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_email text;
  invitation public.workspace_invitations%rowtype;
begin
  if actor_id is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '42501', message = 'INVITATION_INVALID';
  end if;
  select lower(email) into actor_email from auth.users where id = actor_id;
  select * into invitation from public.workspace_invitations
    where token_hash = p_token_hash for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'INVITATION_NOT_FOUND';
  end if;
  if invitation.status = 'accepted' and invitation.accepted_by_user_id = actor_id then
    return invitation.workspace_id;
  end if;
  if invitation.status <> 'pending' then
    raise exception using errcode = '22023', message = 'INVITATION_NOT_PENDING';
  end if;
  if invitation.expires_at is null or invitation.expires_at <= now() then
    raise exception using errcode = '22023', message = 'INVITATION_EXPIRED';
  end if;
  if actor_email is null or actor_email <> lower(invitation.email::text) then
    raise exception using errcode = '42501', message = 'INVITATION_EMAIL_MISMATCH';
  end if;
  insert into public.workspace_members (workspace_id, user_id, role, invited_by_user_id)
  values (invitation.workspace_id, actor_id, invitation.role, invitation.invited_by_user_id)
  on conflict (workspace_id, user_id) do update set
    role = excluded.role, invited_by_user_id = excluded.invited_by_user_id, updated_at = now();
  update public.workspace_invitations set
    status = 'accepted', accepted_by_user_id = actor_id, accepted_at = now(), updated_at = now()
  where id = invitation.id;
  insert into public.activity_events (
    workspace_id, actor_user_id, actor_email, actor_name, action, entity_type, entity_id, summary, metadata
  )
  select invitation.workspace_id, actor_id, profile.email::text, nullif(profile.display_name, ''),
    'member.joined', 'member', actor_id::text,
    format('%s joined the workspace', coalesce(nullif(profile.display_name, ''), profile.email::text)),
    jsonb_build_object('role', invitation.role)
  from public.user_profiles profile where profile.id = actor_id;
  return invitation.workspace_id;
end;
$$;

create function public.revoke_workspace_invitation(p_workspace_id uuid, p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_workspace(p_workspace_id) then
    raise exception using errcode = '42501', message = 'MEMBER_MANAGEMENT_FORBIDDEN';
  end if;
  update public.workspace_invitations set status = 'revoked', revoked_at = now(), updated_at = now()
    where id = p_invitation_id and workspace_id = p_workspace_id and status = 'pending';
  if not found then
    raise exception using errcode = 'P0002', message = 'INVITATION_NOT_FOUND';
  end if;
end;
$$;

create function public.submit_family_draft(
  p_workspace_id uuid,
  p_base_data_version bigint,
  p_operations jsonb,
  p_checksum text,
  p_client_created_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  draft_id uuid;
  next_revision integer;
  operation jsonb;
  operation_index bigint;
  submitted timestamptz := now();
begin
  if actor_id is null or public.workspace_role(p_workspace_id) <> 'contributor' then
    raise exception using errcode = '42501', message = 'DRAFT_SUBMIT_FORBIDDEN';
  end if;
  if p_base_data_version is null or p_base_data_version < 0
     or jsonb_typeof(p_operations) <> 'array'
     or jsonb_array_length(p_operations) not between 1 and 1000
     or p_checksum !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'DRAFT_SUBMIT_INVALID';
  end if;
  select id, revision + 1 into draft_id, next_revision
    from public.draft_submissions
    where workspace_id = p_workspace_id and contributor_user_id = actor_id
      and status in ('draft', 'pending', 'partially_reviewed', 'needs_changes')
    for update;
  if draft_id is null then
    draft_id := gen_random_uuid();
    next_revision := 1;
    insert into public.draft_submissions (
      id, workspace_id, contributor_user_id, base_data_version, revision, checksum,
      status, submitted_at, created_at, updated_at
    ) values (
      draft_id, p_workspace_id, actor_id, p_base_data_version, next_revision, p_checksum,
      'pending', submitted, coalesce(p_client_created_at, submitted), submitted
    );
  else
    delete from public.draft_operations where draft_submission_id = draft_id;
    update public.draft_submissions set
      base_data_version = p_base_data_version, revision = next_revision, checksum = p_checksum,
      status = 'pending', review_note = null, reviewed_by_user_id = null,
      reviewed_at = null, terminal_at = null, submitted_at = submitted, updated_at = submitted
    where id = draft_id;
  end if;
  for operation, operation_index in
    select value, ordinality - 1 from jsonb_array_elements(p_operations) with ordinality
  loop
    if coalesce(operation ->> 'id', '') = '' or coalesce(operation ->> 'type', '') = '' then
      raise exception using errcode = '22023', message = 'DRAFT_OPERATION_INVALID';
    end if;
    insert into public.draft_operations (
      workspace_id, draft_submission_id, operation_id, sequence_number, operation_type,
      entity_id, profile_legacy_id, value, changes, base_values, status, created_at, updated_at
    ) values (
      p_workspace_id, draft_id, operation ->> 'id', operation_index::integer, operation ->> 'type',
      nullif(operation ->> 'entityId', ''), nullif(operation ->> 'profileId', ''),
      operation -> 'value', operation -> 'changes', operation -> 'baseValues', 'pending',
      coalesce((operation ->> 'createdAt')::timestamptz, submitted), submitted
    );
  end loop;
  insert into public.activity_events (
    workspace_id, actor_user_id, actor_email, actor_name, action, entity_type, entity_id, summary, metadata
  )
  select p_workspace_id, actor_id, profile.email::text, nullif(profile.display_name, ''),
    'draft.submitted', 'draft', draft_id::text,
    format('%s submitted %s changes for review', coalesce(nullif(profile.display_name, ''), profile.email::text), jsonb_array_length(p_operations)),
    jsonb_build_object('draftId', draft_id, 'revision', next_revision, 'operationCount', jsonb_array_length(p_operations))
  from public.user_profiles profile where profile.id = actor_id;
  return jsonb_build_object(
    'draftId', draft_id, 'revision', next_revision, 'status', 'pending',
    'submittedAt', submitted, 'operationCount', jsonb_array_length(p_operations)
  );
end;
$$;

create function public.finalize_family_draft_review(
  p_workspace_id uuid,
  p_draft_id uuid,
  p_expected_revision integer,
  p_decision text,
  p_operation_ids text[],
  p_note text,
  p_result_data_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  draft public.draft_submissions%rowtype;
  selected_count integer;
  pending_count integer;
  next_status public.draft_status;
  now_value timestamptz := now();
begin
  if actor_id is null or not public.can_review_workspace(p_workspace_id) then
    raise exception using errcode = '42501', message = 'DRAFT_REVIEW_FORBIDDEN';
  end if;
  if p_decision not in ('approve', 'reject') or coalesce(cardinality(p_operation_ids), 0) < 1
     or (p_decision = 'reject' and length(trim(coalesce(p_note, ''))) = 0) then
    raise exception using errcode = '22023', message = 'DRAFT_REVIEW_INVALID';
  end if;
  select * into draft from public.draft_submissions
    where id = p_draft_id and workspace_id = p_workspace_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'DRAFT_NOT_FOUND';
  end if;
  if draft.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'DRAFT_REVISION_CHANGED';
  end if;
  if draft.status not in ('pending', 'partially_reviewed', 'needs_changes') then
    raise exception using errcode = '22023', message = 'DRAFT_ALREADY_REVIEWED';
  end if;
  select count(*)::integer into selected_count from public.draft_operations
    where draft_submission_id = p_draft_id and status = 'pending'
      and operation_id = any(p_operation_ids);
  if selected_count <> cardinality(p_operation_ids) then
    raise exception using errcode = '22023', message = 'DRAFT_OPERATION_INVALID';
  end if;
  update public.draft_operations set
    status = case when p_decision = 'approve' then 'approved'::public.draft_operation_status else 'rejected'::public.draft_operation_status end,
    decision_note = nullif(trim(coalesce(p_note, '')), ''), updated_at = now_value
  where draft_submission_id = p_draft_id and status = 'pending'
    and operation_id = any(p_operation_ids);
  select count(*)::integer into pending_count from public.draft_operations
    where draft_submission_id = p_draft_id and status = 'pending';
  next_status := case
    when pending_count > 0 then 'partially_reviewed'::public.draft_status
    when p_decision = 'approve' then 'approved'::public.draft_status
    else 'rejected'::public.draft_status
  end;
  update public.draft_submissions set
    revision = revision + 1,
    base_data_version = case when p_result_data_version is not null and p_result_data_version >= 0 then p_result_data_version else base_data_version end,
    status = next_status,
    review_note = nullif(trim(coalesce(p_note, '')), ''),
    reviewed_by_user_id = actor_id, reviewed_at = now_value, updated_at = now_value,
    terminal_at = case when next_status in ('approved', 'rejected') then now_value else null end
  where id = p_draft_id;
  insert into public.draft_review_events (
    workspace_id, draft_submission_id, draft_revision, reviewer_user_id,
    decision, operation_ids, note, created_at
  ) values (
    p_workspace_id, p_draft_id, p_expected_revision, actor_id,
    p_decision, p_operation_ids, nullif(trim(coalesce(p_note, '')), ''), now_value
  );
  insert into public.activity_events (
    workspace_id, actor_user_id, actor_email, actor_name, action, entity_type, entity_id, summary, metadata
  )
  select p_workspace_id, actor_id, profile.email::text, nullif(profile.display_name, ''),
    case when p_decision = 'approve' then 'draft.approved' else 'draft.rejected' end,
    'draft', p_draft_id::text,
    format('%s %s %s draft changes', coalesce(nullif(profile.display_name, ''), profile.email::text),
      case when p_decision = 'approve' then 'approved' else 'rejected' end, selected_count),
    jsonb_build_object('draftId', p_draft_id, 'draftRevision', p_expected_revision, 'operationCount', selected_count, 'partial', pending_count > 0)
  from public.user_profiles profile where profile.id = actor_id;
  return jsonb_build_object(
    'revision', p_expected_revision + 1,
    'status', next_status,
    'remaining', pending_count,
    'updatedAt', now_value
  );
end;
$$;

create function public.cleanup_terminal_family_drafts(p_workspace_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  removed integer;
begin
  if actor_id is null or not public.can_read_workspace(p_workspace_id) then
    raise exception using errcode = '42501', message = 'WORKSPACE_NOT_FOUND';
  end if;
  delete from public.draft_submissions draft
    where draft.workspace_id = p_workspace_id
      and draft.status in ('approved', 'rejected', 'invalid')
      and coalesce(draft.terminal_at, draft.updated_at) < now() - interval '7 days'
      and (draft.contributor_user_id = actor_id or public.can_review_workspace(p_workspace_id));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

create function public.mark_family_draft_needs_changes(
  p_workspace_id uuid,
  p_draft_id uuid,
  p_expected_revision integer,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_review_workspace(p_workspace_id) then
    raise exception using errcode = '42501', message = 'DRAFT_REVIEW_FORBIDDEN';
  end if;
  update public.draft_submissions set status = 'needs_changes', review_note = left(trim(p_note), 2000), updated_at = now()
    where id = p_draft_id and workspace_id = p_workspace_id
      and revision = p_expected_revision and status in ('pending', 'partially_reviewed', 'needs_changes');
  if not found then
    raise exception using errcode = '40001', message = 'DRAFT_REVISION_CHANGED';
  end if;
end;
$$;

create function public.create_family_snapshot(p_workspace_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  workspace public.workspaces%rowtype;
  snapshot_id uuid;
  snapshot_reason text;
  created timestamptz := now();
begin
  if actor_id is null or not public.can_manage_workspace(p_workspace_id) then
    raise exception using errcode = '42501', message = 'BACKUP_FORBIDDEN';
  end if;
  select * into workspace from public.workspaces where id = p_workspace_id for update;
  snapshot_reason := left(coalesce(nullif(trim(p_reason), ''), 'manual'), 100) || ':' || to_char(created, 'YYYYMMDDHH24MISSMS');
  insert into public.workspace_snapshots (
    workspace_id, data_version, schema_version, reason, family_data, created_by_user_id, created_at
  ) values (
    p_workspace_id, workspace.data_version, workspace.schema_version, snapshot_reason,
    public._family_snapshot_json(p_workspace_id), actor_id, created
  ) returning id into snapshot_id;
  return jsonb_build_object('id', snapshot_id, 'reason', snapshot_reason, 'createdAt', created);
end;
$$;

create function public.replace_family_dataset(
  p_workspace_id uuid,
  p_expected_data_version bigint,
  p_family_data jsonb,
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_version bigint;
  next_version bigint;
  current_snapshot jsonb;
  candidate jsonb;
  actor_email text;
  actor_name text;
begin
  if actor_id is null or not public.can_manage_workspace(p_workspace_id) then
    raise exception using errcode = '42501', message = 'FAMILY_REPLACE_FORBIDDEN';
  end if;
  if p_mode not in ('replace', 'restore', 'merge') or jsonb_typeof(p_family_data) <> 'object' then
    raise exception using errcode = '22023', message = 'FAMILY_REPLACE_INVALID';
  end if;
  select data_version into current_version from public.workspaces
    where id = p_workspace_id for update;
  if current_version is null then
    raise exception using errcode = 'P0002', message = 'WORKSPACE_NOT_FOUND';
  end if;
  if p_expected_data_version is null or p_expected_data_version <> current_version then
    return jsonb_build_object(
      'status', 'conflict', 'dataVersion', current_version,
      'snapshot', public._family_snapshot_json(p_workspace_id)
    );
  end if;
  current_snapshot := public._family_snapshot_json(p_workspace_id);
  insert into public.workspace_snapshots (
    workspace_id, data_version, schema_version, reason, family_data, created_by_user_id
  ) values (
    p_workspace_id, current_version, (current_snapshot ->> 'schemaVersion')::integer,
    'before-' || p_mode || ':' || to_char(now(), 'YYYYMMDDHH24MISSMS'), current_snapshot, actor_id
  );
  candidate := public._resolve_family_media_uploads(p_workspace_id, p_family_data);
  perform public._replace_family_data(p_workspace_id, candidate);
  next_version := current_version + 1;
  update public.workspaces set data_version = next_version where id = p_workspace_id;
  select coalesce(profile.email::text, auth_user.email, 'unknown@example.invalid'), nullif(profile.display_name, '')
    into actor_email, actor_name
  from auth.users auth_user left join public.user_profiles profile on profile.id = auth_user.id
  where auth_user.id = actor_id;
  insert into public.activity_events (
    workspace_id, actor_user_id, actor_email, actor_name, action, entity_type, summary, metadata
  ) values (
    p_workspace_id, actor_id, actor_email, actor_name, 'family.' || p_mode, 'dataset',
    format('%s replaced the family dataset', coalesce(actor_name, actor_email)),
    jsonb_build_object('mode', p_mode, 'previousVersion', current_version, 'resultVersion', next_version)
  );
  return jsonb_build_object(
    'status', 'applied', 'dataVersion', next_version,
    'snapshot', public._family_snapshot_json(p_workspace_id)
  );
end;
$$;

-- A reviewer may discard rejected contributor uploads. Object deletion remains
-- constrained to the exact server-generated prefix belonging to that upload.
create or replace function public.can_write_media_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.media_uploads upload
    where upload.id = public.media_object_upload_id(object_name)
      and upload.workspace_id = public.media_object_workspace_id(object_name)
      and object_name like upload.object_prefix || '/%'
      and (
        (upload.created_by_user_id = (select auth.uid())
          and upload.status in ('staging', 'verified')
          and public.workspace_role(upload.workspace_id) in ('owner', 'editor', 'contributor'))
        or (upload.status in ('discarded', 'expired') and public.can_review_workspace(upload.workspace_id))
      )
  );
$$;

create function public.discard_reviewed_media_upload(p_workspace_id uuid, p_upload_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  upload public.media_uploads%rowtype;
begin
  if not public.can_review_workspace(p_workspace_id) then
    raise exception using errcode = '42501', message = 'MEDIA_UPLOAD_NOT_DISCARDABLE';
  end if;
  select * into upload from public.media_uploads
    where id = p_upload_id and workspace_id = p_workspace_id for update;
  if not found then return jsonb_build_object('status', 'missing', 'paths', '[]'::jsonb); end if;
  if upload.status = 'attached' then
    raise exception using errcode = '42501', message = 'MEDIA_UPLOAD_NOT_DISCARDABLE';
  end if;
  update public.media_uploads set status = 'discarded', updated_at = now() where id = p_upload_id;
  return jsonb_build_object('status', 'discarded', 'paths', jsonb_build_array(upload.original_path, upload.thumbnail_path));
end;
$$;

revoke all on function public.create_family_workspace(text) from public, anon;
revoke all on function public.can_read_workspace_profile(uuid) from public, anon;
revoke all on function public.create_workspace_invitation(uuid, text, public.workspace_role, text, timestamptz) from public, anon;
revoke all on function public.accept_workspace_invitation(text) from public, anon;
revoke all on function public.revoke_workspace_invitation(uuid, uuid) from public, anon;
revoke all on function public.submit_family_draft(uuid, bigint, jsonb, text, timestamptz) from public, anon;
revoke all on function public.finalize_family_draft_review(uuid, uuid, integer, text, text[], text, bigint) from public, anon;
revoke all on function public.mark_family_draft_needs_changes(uuid, uuid, integer, text) from public, anon;
revoke all on function public.cleanup_terminal_family_drafts(uuid) from public, anon;
revoke all on function public.create_family_snapshot(uuid, text) from public, anon;
revoke all on function public.replace_family_dataset(uuid, bigint, jsonb, text) from public, anon;
revoke all on function public.discard_reviewed_media_upload(uuid, uuid) from public, anon;

grant execute on function public.create_family_workspace(text) to authenticated;
grant execute on function public.can_read_workspace_profile(uuid) to authenticated;
grant execute on function public.create_workspace_invitation(uuid, text, public.workspace_role, text, timestamptz) to authenticated;
grant execute on function public.accept_workspace_invitation(text) to authenticated;
grant execute on function public.revoke_workspace_invitation(uuid, uuid) to authenticated;
grant execute on function public.submit_family_draft(uuid, bigint, jsonb, text, timestamptz) to authenticated;
grant execute on function public.finalize_family_draft_review(uuid, uuid, integer, text, text[], text, bigint) to authenticated;
grant execute on function public.mark_family_draft_needs_changes(uuid, uuid, integer, text) to authenticated;
grant execute on function public.cleanup_terminal_family_drafts(uuid) to authenticated;
grant execute on function public.create_family_snapshot(uuid, text) to authenticated;
grant execute on function public.replace_family_dataset(uuid, bigint, jsonb, text) to authenticated;
grant execute on function public.discard_reviewed_media_upload(uuid, uuid) to authenticated;

comment on table public.draft_review_events is 'Immutable reviewer decisions for contributor draft revisions';
comment on function public.accept_workspace_invitation(text) is 'Atomically validates invite token, expiry and authenticated email before adding membership';
