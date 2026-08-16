create extension if not exists citext with schema extensions;

create type public.workspace_role as enum ('owner', 'editor', 'contributor', 'viewer');
create type public.gender_type as enum ('male', 'female', 'other', 'unknown');
create type public.ancestral_role as enum ('none', 'founding_ancestor');
create type public.fact_confidence as enum ('confirmed', 'likely', 'estimated', 'unknown');
create type public.relationship_type as enum ('spouse', 'parent');
create type public.spouse_status as enum ('married', 'partner', 'separated', 'divorced', 'widowed', 'unknown');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.commit_status as enum ('pending', 'applied', 'conflict', 'failed');
create type public.draft_status as enum ('draft', 'pending', 'partially_reviewed', 'needs_changes', 'approved', 'rejected', 'invalid');
create type public.draft_operation_status as enum ('pending', 'approved', 'rejected', 'conflict');
create type public.migration_status as enum ('pending', 'running', 'completed', 'failed', 'cancelled');

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email extensions.citext not null,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_email_not_blank check (length(trim(email::text)) > 0)
);

create unique index user_profiles_email_unique on public.user_profiles (email);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  name text not null,
  schema_version integer not null default 3,
  data_version bigint not null default 0,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  locale text not null default 'vi-VN',
  duplicate_suppressions jsonb not null default '[]'::jsonb,
  legacy_drive_folder_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_name_not_blank check (length(trim(name)) > 0),
  constraint workspaces_schema_version_positive check (schema_version > 0),
  constraint workspaces_data_version_nonnegative check (data_version >= 0),
  constraint workspaces_duplicate_suppressions_array check (jsonb_typeof(duplicate_suppressions) = 'array')
);

create unique index workspaces_legacy_drive_folder_unique
  on public.workspaces (legacy_drive_folder_id)
  where legacy_drive_folder_id is not null;

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null,
  invited_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index workspace_members_user_id_idx on public.workspace_members (user_id, workspace_id);

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email extensions.citext not null,
  role public.workspace_role not null,
  status public.invitation_status not null default 'pending',
  token_hash text,
  invited_by_user_id uuid not null references auth.users(id) on delete restrict,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_invitations_email_not_blank check (length(trim(email::text)) > 0),
  constraint workspace_invitations_role_not_owner check (role <> 'owner')
);

create unique index workspace_invitations_one_pending_email
  on public.workspace_invitations (workspace_id, email)
  where status = 'pending';

create table public.family_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  legacy_id text not null,
  name text not null,
  lineage_surname text not null default '',
  description text not null default '',
  legacy_photo_file_id text,
  subject_person_id uuid,
  requires_secret boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_profiles_legacy_id_not_blank check (length(trim(legacy_id)) > 0),
  constraint family_profiles_name_not_blank check (length(trim(name)) > 0),
  unique (workspace_id, legacy_id),
  unique (workspace_id, id)
);

create table public.persons (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  family_profile_id uuid not null,
  legacy_id text not null,
  name text not null,
  nickname text,
  gender public.gender_type not null default 'unknown',
  birth_date date,
  is_deceased boolean not null default false,
  death_date date,
  death_lunar_day smallint,
  death_lunar_month smallint,
  death_lunar_leap_month boolean,
  phone1 text not null default '',
  phone2 text not null default '',
  address text not null default '',
  note text not null default '',
  ancestral_role public.ancestral_role not null default 'none',
  sort_order double precision,
  birth_date_confidence public.fact_confidence,
  death_date_confidence public.fact_confidence,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint persons_profile_fk foreign key (workspace_id, family_profile_id)
    references public.family_profiles(workspace_id, id) on delete cascade,
  constraint persons_legacy_id_not_blank check (length(trim(legacy_id)) > 0),
  constraint persons_name_not_blank check (length(trim(name)) > 0),
  constraint persons_lunar_day_range check (death_lunar_day is null or death_lunar_day between 1 and 30),
  constraint persons_lunar_month_range check (death_lunar_month is null or death_lunar_month between 1 and 12),
  constraint persons_lunar_complete check (
    (death_lunar_day is null and death_lunar_month is null and death_lunar_leap_month is null)
    or (death_lunar_day is not null and death_lunar_month is not null and death_lunar_leap_month is not null)
  ),
  unique (workspace_id, legacy_id),
  unique (workspace_id, family_profile_id, id)
);

alter table public.family_profiles
  add constraint family_profiles_subject_person_fk
  foreign key (workspace_id, id, subject_person_id)
  references public.persons(workspace_id, family_profile_id, id)
  on delete set null (subject_person_id)
  deferrable initially deferred;

create table public.relationships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  family_profile_id uuid not null,
  legacy_id text not null,
  person1_id uuid not null,
  person2_id uuid not null,
  type public.relationship_type not null,
  status public.spouse_status,
  start_date date,
  end_date date,
  sort_order double precision,
  confidence public.fact_confidence,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint relationships_profile_fk foreign key (workspace_id, family_profile_id)
    references public.family_profiles(workspace_id, id) on delete cascade,
  constraint relationships_person1_fk foreign key (workspace_id, family_profile_id, person1_id)
    references public.persons(workspace_id, family_profile_id, id) on delete cascade,
  constraint relationships_person2_fk foreign key (workspace_id, family_profile_id, person2_id)
    references public.persons(workspace_id, family_profile_id, id) on delete cascade,
  constraint relationships_legacy_id_not_blank check (length(trim(legacy_id)) > 0),
  constraint relationships_not_self check (person1_id <> person2_id),
  constraint relationships_parent_has_no_spouse_status check (type <> 'parent' or status is null),
  unique (workspace_id, legacy_id)
);

create unique index relationships_unique_parent
  on public.relationships (workspace_id, family_profile_id, person1_id, person2_id)
  where type = 'parent';

create unique index relationships_unique_spouse
  on public.relationships (workspace_id, family_profile_id, least(person1_id, person2_id), greatest(person1_id, person2_id))
  where type = 'spouse';

create table public.media (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  family_profile_id uuid not null,
  person_id uuid not null,
  legacy_id text not null,
  legacy_drive_file_id text,
  storage_bucket text,
  storage_path text,
  type text not null default 'photo',
  mime_type text,
  byte_size bigint,
  checksum text,
  is_primary boolean not null default false,
  caption text not null default '',
  taken_date date,
  sort_order double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_person_fk foreign key (workspace_id, family_profile_id, person_id)
    references public.persons(workspace_id, family_profile_id, id) on delete cascade,
  constraint media_legacy_id_not_blank check (length(trim(legacy_id)) > 0),
  constraint media_photo_only check (type = 'photo'),
  constraint media_location_present check (legacy_drive_file_id is not null or storage_path is not null),
  constraint media_storage_pair check ((storage_bucket is null) = (storage_path is null)),
  constraint media_byte_size_nonnegative check (byte_size is null or byte_size >= 0),
  unique (workspace_id, legacy_id),
  unique (workspace_id, id)
);

create unique index media_one_primary_per_person
  on public.media (workspace_id, person_id)
  where is_primary;

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  legacy_id text,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email extensions.citext not null,
  actor_name text,
  action text not null,
  entity_type text,
  entity_id text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint activity_events_action_not_blank check (length(trim(action)) > 0),
  constraint activity_events_summary_not_blank check (length(trim(summary)) > 0),
  constraint activity_events_metadata_object check (jsonb_typeof(metadata) = 'object'),
  unique (workspace_id, legacy_id)
);

create table public.commits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  commit_id text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  base_data_version bigint,
  result_data_version bigint,
  operation_count integer not null default 0,
  operation_counts jsonb not null default '{}'::jsonb,
  status public.commit_status not null default 'pending',
  error_code text,
  client_created_at timestamptz,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  constraint commits_commit_id_not_blank check (length(trim(commit_id)) > 0),
  constraint commits_operation_count_nonnegative check (operation_count >= 0),
  constraint commits_version_order check (
    result_data_version is null or base_data_version is null or result_data_version >= base_data_version
  ),
  unique (workspace_id, commit_id)
);

create table public.draft_submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contributor_user_id uuid not null references auth.users(id) on delete cascade,
  base_data_version bigint not null,
  revision integer not null default 1,
  checksum text not null,
  status public.draft_status not null default 'draft',
  review_note text,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint draft_submissions_base_version_nonnegative check (base_data_version >= 0),
  constraint draft_submissions_revision_positive check (revision > 0),
  constraint draft_submissions_checksum_not_blank check (length(trim(checksum)) > 0),
  constraint draft_submissions_reject_note_required check (status <> 'rejected' or length(trim(coalesce(review_note, ''))) > 0),
  constraint draft_submissions_member_fk foreign key (workspace_id, contributor_user_id)
    references public.workspace_members(workspace_id, user_id) on delete cascade,
  unique (workspace_id, id)
);

create unique index draft_submissions_one_active_per_contributor
  on public.draft_submissions (workspace_id, contributor_user_id)
  where status in ('draft', 'pending', 'partially_reviewed', 'needs_changes');

create table public.draft_operations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  draft_submission_id uuid not null references public.draft_submissions(id) on delete cascade,
  operation_id text not null,
  sequence_number integer not null,
  operation_type text not null,
  entity_id text,
  profile_legacy_id text,
  value jsonb,
  changes jsonb,
  base_values jsonb,
  status public.draft_operation_status not null default 'pending',
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint draft_operations_operation_id_not_blank check (length(trim(operation_id)) > 0),
  constraint draft_operations_sequence_nonnegative check (sequence_number >= 0),
  constraint draft_operations_type_allowed check (operation_type in (
    'profile.create', 'profile.update', 'subject.set',
    'person.create', 'person.update', 'person.delete',
    'relationship.create', 'relationship.update', 'relationship.delete',
    'media.attach', 'media.primary.set', 'media.caption.update', 'media.delete',
    'settings.duplicate_suppression.add'
  )),
  constraint draft_operations_submission_workspace_fk foreign key (workspace_id, draft_submission_id)
    references public.draft_submissions(workspace_id, id) on delete cascade,
  unique (draft_submission_id, operation_id),
  unique (draft_submission_id, sequence_number)
);

create table public.workspace_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  data_version bigint not null,
  schema_version integer not null,
  reason text not null,
  family_data jsonb not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint workspace_snapshots_version_nonnegative check (data_version >= 0),
  constraint workspace_snapshots_schema_positive check (schema_version > 0),
  constraint workspace_snapshots_family_data_object check (jsonb_typeof(family_data) = 'object'),
  unique (workspace_id, data_version, reason)
);

create table public.migration_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_type text not null default 'google_drive',
  source_revision text,
  status public.migration_status not null default 'pending',
  dry_run boolean not null default true,
  report jsonb not null default '{}'::jsonb,
  started_by_user_id uuid not null references auth.users(id) on delete restrict,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint migration_runs_source_not_blank check (length(trim(source_type)) > 0),
  constraint migration_runs_report_object check (jsonb_typeof(report) = 'object')
);

create index family_profiles_workspace_idx on public.family_profiles (workspace_id);
create index persons_profile_idx on public.persons (workspace_id, family_profile_id);
create index relationships_profile_idx on public.relationships (workspace_id, family_profile_id);
create index relationships_person1_idx on public.relationships (workspace_id, person1_id);
create index relationships_person2_idx on public.relationships (workspace_id, person2_id);
create index media_person_idx on public.media (workspace_id, person_id);
create index activity_events_workspace_time_idx on public.activity_events (workspace_id, occurred_at desc);
create index commits_workspace_time_idx on public.commits (workspace_id, created_at desc);
create index draft_submissions_workspace_status_idx on public.draft_submissions (workspace_id, status, updated_at desc);
create index draft_operations_draft_idx on public.draft_operations (draft_submission_id, sequence_number);
create index snapshots_workspace_time_idx on public.workspace_snapshots (workspace_id, created_at desc);
create index migration_runs_workspace_time_idx on public.migration_runs (workspace_id, created_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'user_profiles', 'workspaces', 'workspace_members', 'workspace_invitations',
    'family_profiles', 'persons', 'relationships', 'media', 'draft_submissions',
    'draft_operations', 'migration_runs'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      table_name || '_set_updated_at', table_name
    );
  end loop;
end;
$$;

create function public.is_workspace_owner(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspaces
    where id = target_workspace_id and owner_user_id = (select auth.uid())
  );
$$;

create function public.workspace_role(target_workspace_id uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.workspace_members
  where workspace_id = target_workspace_id and user_id = (select auth.uid())
  limit 1;
$$;

create function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.workspace_role(target_workspace_id) is not null;
$$;

create function public.can_read_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_workspace_member(target_workspace_id);
$$;

create function public.can_commit_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.workspace_role(target_workspace_id) in ('owner', 'editor');
$$;

create function public.can_review_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.workspace_role(target_workspace_id) in ('owner', 'editor');
$$;

create function public.can_manage_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_workspace_owner(target_workspace_id);
$$;

create function public.can_read_draft(target_draft_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.draft_submissions draft
    where draft.id = target_draft_id
      and (
        draft.contributor_user_id = (select auth.uid())
        or public.can_review_workspace(draft.workspace_id)
      )
  );
$$;

create function public.can_edit_own_draft(target_draft_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.draft_submissions draft
    where draft.id = target_draft_id
      and draft.contributor_user_id = (select auth.uid())
      and public.workspace_role(draft.workspace_id) = 'contributor'
      and draft.status in ('draft', 'needs_changes', 'partially_reviewed')
  );
$$;

create function public.enforce_workspace_owner_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_owner uuid;
begin
  select owner_user_id into expected_owner from public.workspaces where id = coalesce(new.workspace_id, old.workspace_id);
  if tg_op = 'DELETE' then
    if old.user_id = expected_owner then
      raise exception 'workspace owner membership cannot be deleted';
    end if;
    return old;
  end if;
  if new.user_id = expected_owner and new.role <> 'owner' then
    raise exception 'workspace owner must keep owner role';
  end if;
  if new.user_id <> expected_owner and new.role = 'owner' then
    raise exception 'only workspace owner may have owner role';
  end if;
  return new;
end;
$$;

create trigger workspace_members_enforce_owner
before insert or update or delete on public.workspace_members
for each row execute function public.enforce_workspace_owner_member();

create function public.create_workspace_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_user_id, 'owner');
  return new;
end;
$$;

create trigger workspaces_create_owner_membership
after insert on public.workspaces
for each row execute function public.create_workspace_owner_membership();

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.enforce_workspace_owner_member() from public, anon, authenticated;
revoke all on function public.create_workspace_owner_membership() from public, anon, authenticated;

revoke all on function public.is_workspace_owner(uuid) from public, anon;
revoke all on function public.workspace_role(uuid) from public, anon;
revoke all on function public.is_workspace_member(uuid) from public, anon;
revoke all on function public.can_read_workspace(uuid) from public, anon;
revoke all on function public.can_commit_workspace(uuid) from public, anon;
revoke all on function public.can_review_workspace(uuid) from public, anon;
revoke all on function public.can_manage_workspace(uuid) from public, anon;
revoke all on function public.can_read_draft(uuid) from public, anon;
revoke all on function public.can_edit_own_draft(uuid) from public, anon;

grant execute on function public.is_workspace_owner(uuid) to authenticated, service_role;
grant execute on function public.workspace_role(uuid) to authenticated, service_role;
grant execute on function public.is_workspace_member(uuid) to authenticated, service_role;
grant execute on function public.can_read_workspace(uuid) to authenticated, service_role;
grant execute on function public.can_commit_workspace(uuid) to authenticated, service_role;
grant execute on function public.can_review_workspace(uuid) to authenticated, service_role;
grant execute on function public.can_manage_workspace(uuid) to authenticated, service_role;
grant execute on function public.can_read_draft(uuid) to authenticated, service_role;
grant execute on function public.can_edit_own_draft(uuid) to authenticated, service_role;

alter table public.user_profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.family_profiles enable row level security;
alter table public.persons enable row level security;
alter table public.relationships enable row level security;
alter table public.media enable row level security;
alter table public.activity_events enable row level security;
alter table public.commits enable row level security;
alter table public.draft_submissions enable row level security;
alter table public.draft_operations enable row level security;
alter table public.workspace_snapshots enable row level security;
alter table public.migration_runs enable row level security;

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

create policy user_profiles_select_own on public.user_profiles
  for select to authenticated using (id = (select auth.uid()));
create policy user_profiles_insert_own on public.user_profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy user_profiles_update_own on public.user_profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy workspaces_select_member on public.workspaces
  for select to authenticated using (public.can_read_workspace(id));
create policy workspaces_insert_owner on public.workspaces
  for insert to authenticated with check (owner_user_id = (select auth.uid()));
create policy workspaces_update_owner on public.workspaces
  for update to authenticated using (public.is_workspace_owner(id)) with check (owner_user_id = (select auth.uid()));
create policy workspaces_delete_owner on public.workspaces
  for delete to authenticated using (public.is_workspace_owner(id));

create policy workspace_members_select_member on public.workspace_members
  for select to authenticated using (public.can_read_workspace(workspace_id));
create policy workspace_members_insert_owner on public.workspace_members
  for insert to authenticated with check (public.can_manage_workspace(workspace_id));
create policy workspace_members_update_owner on public.workspace_members
  for update to authenticated using (public.can_manage_workspace(workspace_id)) with check (public.can_manage_workspace(workspace_id));
create policy workspace_members_delete_owner on public.workspace_members
  for delete to authenticated using (public.can_manage_workspace(workspace_id));

create policy workspace_invitations_select_owner on public.workspace_invitations
  for select to authenticated using (public.can_manage_workspace(workspace_id));
create policy workspace_invitations_insert_owner on public.workspace_invitations
  for insert to authenticated with check (public.can_manage_workspace(workspace_id));
create policy workspace_invitations_update_owner on public.workspace_invitations
  for update to authenticated using (public.can_manage_workspace(workspace_id)) with check (public.can_manage_workspace(workspace_id));
create policy workspace_invitations_delete_owner on public.workspace_invitations
  for delete to authenticated using (public.can_manage_workspace(workspace_id));

do $$
declare
  table_name text;
begin
  foreach table_name in array array['family_profiles', 'persons', 'relationships', 'media'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.can_read_workspace(workspace_id))',
      table_name || '_select_member', table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.can_commit_workspace(workspace_id))',
      table_name || '_insert_committers', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.can_commit_workspace(workspace_id)) with check (public.can_commit_workspace(workspace_id))',
      table_name || '_update_committers', table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.can_commit_workspace(workspace_id))',
      table_name || '_delete_committers', table_name
    );
  end loop;
end;
$$;

create policy activity_events_select_member on public.activity_events
  for select to authenticated using (public.can_read_workspace(workspace_id));
create policy activity_events_insert_committer on public.activity_events
  for insert to authenticated with check (public.can_commit_workspace(workspace_id));

create policy commits_select_member on public.commits
  for select to authenticated using (public.can_read_workspace(workspace_id));
create policy commits_insert_committer on public.commits
  for insert to authenticated with check (public.can_commit_workspace(workspace_id) and actor_user_id = (select auth.uid()));
create policy commits_update_committer on public.commits
  for update to authenticated using (public.can_commit_workspace(workspace_id)) with check (public.can_commit_workspace(workspace_id));

create policy draft_submissions_select_owner_or_reviewer on public.draft_submissions
  for select to authenticated using (
    contributor_user_id = (select auth.uid()) or public.can_review_workspace(workspace_id)
  );
create policy draft_submissions_insert_own on public.draft_submissions
  for insert to authenticated with check (
    contributor_user_id = (select auth.uid()) and public.workspace_role(workspace_id) = 'contributor'
  );
create policy draft_submissions_update_own on public.draft_submissions
  for update to authenticated using (
    contributor_user_id = (select auth.uid()) and public.workspace_role(workspace_id) = 'contributor'
  ) with check (
    contributor_user_id = (select auth.uid()) and public.workspace_role(workspace_id) = 'contributor'
  );
create policy draft_submissions_update_reviewer on public.draft_submissions
  for update to authenticated using (public.can_review_workspace(workspace_id)) with check (public.can_review_workspace(workspace_id));
create policy draft_submissions_delete_own_draft on public.draft_submissions
  for delete to authenticated using (
    contributor_user_id = (select auth.uid()) and public.workspace_role(workspace_id) = 'contributor' and status = 'draft'
  );

create policy draft_operations_select_owner_or_reviewer on public.draft_operations
  for select to authenticated using (public.can_read_draft(draft_submission_id));
create policy draft_operations_insert_own on public.draft_operations
  for insert to authenticated with check (
    public.can_edit_own_draft(draft_submission_id)
    and exists (
      select 1 from public.draft_submissions draft
      where draft.id = draft_submission_id and draft.workspace_id = workspace_id
    )
  );
create policy draft_operations_update_own_or_reviewer on public.draft_operations
  for update to authenticated using (
    public.can_edit_own_draft(draft_submission_id) or public.can_review_workspace(workspace_id)
  ) with check (
    public.can_edit_own_draft(draft_submission_id) or public.can_review_workspace(workspace_id)
  );
create policy draft_operations_delete_own on public.draft_operations
  for delete to authenticated using (public.can_edit_own_draft(draft_submission_id));

create policy workspace_snapshots_select_member on public.workspace_snapshots
  for select to authenticated using (public.can_read_workspace(workspace_id));
create policy workspace_snapshots_insert_owner on public.workspace_snapshots
  for insert to authenticated with check (public.can_manage_workspace(workspace_id));
create policy workspace_snapshots_delete_owner on public.workspace_snapshots
  for delete to authenticated using (public.can_manage_workspace(workspace_id));

create policy migration_runs_select_owner on public.migration_runs
  for select to authenticated using (public.can_manage_workspace(workspace_id));
create policy migration_runs_insert_owner on public.migration_runs
  for insert to authenticated with check (public.can_manage_workspace(workspace_id) and started_by_user_id = (select auth.uid()));
create policy migration_runs_update_owner on public.migration_runs
  for update to authenticated using (public.can_manage_workspace(workspace_id)) with check (public.can_manage_workspace(workspace_id));

comment on schema public is 'Famnesia canonical family data and collaboration workflow';
comment on column public.family_profiles.legacy_id is 'Stable FamilyData profile ID, unique within a workspace';
comment on column public.persons.legacy_id is 'Stable FamilyData person ID, unique within a workspace';
comment on column public.relationships.legacy_id is 'Stable FamilyData relationship ID, unique within a workspace';
comment on column public.media.legacy_id is 'Stable FamilyData media ID, unique within a workspace';
