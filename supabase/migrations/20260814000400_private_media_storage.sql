create type public.media_upload_status as enum ('staging', 'verified', 'attached', 'discarded', 'expired');
create type public.media_cleanup_status as enum ('pending', 'completed', 'failed');

alter table public.media
  add column thumbnail_storage_path text,
  add column storage_status text not null default 'ready';

create table public.media_uploads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  family_profile_id uuid not null,
  person_id uuid not null,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  status public.media_upload_status not null default 'staging',
  object_prefix text not null,
  original_path text,
  thumbnail_path text,
  mime_type text,
  byte_size bigint,
  thumbnail_byte_size bigint,
  checksum text,
  claimed_legacy_id text,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_uploads_profile_fk foreign key (workspace_id, family_profile_id)
    references public.family_profiles(workspace_id, id) on delete cascade,
  constraint media_uploads_person_fk foreign key (workspace_id, family_profile_id, person_id)
    references public.persons(workspace_id, family_profile_id, id) on delete cascade,
  constraint media_uploads_prefix_not_blank check (length(trim(object_prefix)) > 0),
  constraint media_uploads_size_limit check (byte_size is null or byte_size between 1 and 4194304),
  constraint media_uploads_thumb_size_limit check (thumbnail_byte_size is null or thumbnail_byte_size between 1 and 524288),
  constraint media_uploads_mime_allowed check (mime_type is null or mime_type in ('image/webp', 'image/jpeg', 'image/png')),
  constraint media_uploads_checksum_shape check (checksum is null or checksum ~ '^[a-f0-9]{64}$'),
  constraint media_uploads_verified_complete check (
    status = 'staging'
    or (original_path is not null and thumbnail_path is not null and mime_type is not null
        and byte_size is not null and thumbnail_byte_size is not null and checksum is not null)
  ),
  unique (workspace_id, object_prefix),
  unique (workspace_id, claimed_legacy_id)
);

create index media_uploads_workspace_status_idx
  on public.media_uploads (workspace_id, status, expires_at);
create index media_uploads_creator_idx
  on public.media_uploads (created_by_user_id, workspace_id, status);

create table public.media_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  original_path text not null,
  thumbnail_path text,
  status public.media_cleanup_status not null default 'pending',
  attempt_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint media_cleanup_path_not_blank check (length(trim(original_path)) > 0),
  constraint media_cleanup_attempt_nonnegative check (attempt_count >= 0),
  unique (workspace_id, original_path)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('family-media', 'family-media', false, 4194304, array['image/webp', 'image/jpeg', 'image/png']::text[]),
  ('family-exports', 'family-exports', false, 10485760, array['application/json', 'application/zip']::text[]),
  ('family-backups', 'family-backups', false, 10485760, array['application/json', 'application/zip']::text[])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function public.media_object_workspace_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if object_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]+$' then
    return null;
  end if;
  return split_part(object_name, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create function public.media_object_upload_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if object_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]+$' then
    return null;
  end if;
  return split_part(object_name, '/', 4)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create function public.can_read_media_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select public.media_object_workspace_id(object_name) workspace_id,
           public.media_object_upload_id(object_name) upload_id
  ), upload as (
    select item.status, item.created_by_user_id
    from public.media_uploads item, target
    where item.id = target.upload_id and item.workspace_id = target.workspace_id
  )
  select public.can_read_workspace(target.workspace_id)
    and (
      not exists (select 1 from upload)
      or exists (select 1 from upload where status = 'attached')
      or exists (select 1 from upload where created_by_user_id = (select auth.uid()))
      or public.can_review_workspace(target.workspace_id)
    )
  from target;
$$;

create function public.can_write_media_object(object_name text)
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
      and upload.created_by_user_id = (select auth.uid())
      and upload.status in ('staging', 'verified')
      and object_name like upload.object_prefix || '/%'
      and public.workspace_role(upload.workspace_id) in ('owner', 'editor', 'contributor')
  );
$$;

create function public.prepare_media_upload(
  p_workspace_id uuid,
  p_profile_legacy_id text,
  p_person_legacy_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.workspace_role;
  profile_id uuid;
  person_id uuid;
  upload_id uuid := gen_random_uuid();
  object_prefix text;
begin
  select role into actor_role from public.workspace_members
    where workspace_id = p_workspace_id and user_id = actor_id;
  if actor_role is null or actor_role not in ('owner', 'editor', 'contributor') then
    raise exception using errcode = '42501', message = 'MEDIA_UPLOAD_FORBIDDEN';
  end if;
  select id into profile_id from public.family_profiles
    where workspace_id = p_workspace_id and legacy_id = p_profile_legacy_id;
  select id into person_id from public.persons
    where workspace_id = p_workspace_id and family_profile_id = profile_id and legacy_id = p_person_legacy_id;
  if profile_id is null or person_id is null then
    raise exception using errcode = '23503', message = 'MEDIA_UPLOAD_REFERENCE_MISSING';
  end if;
  object_prefix := concat_ws('/', p_workspace_id::text, profile_id::text, person_id::text, upload_id::text);
  insert into public.media_uploads (
    id, workspace_id, family_profile_id, person_id, created_by_user_id, object_prefix
  ) values (
    upload_id, p_workspace_id, profile_id, person_id, actor_id, object_prefix
  );
  return jsonb_build_object('uploadId', upload_id, 'objectPrefix', object_prefix, 'expiresAt', now() + interval '24 hours');
end;
$$;

create function public.verify_media_upload(
  p_upload_id uuid,
  p_original_path text,
  p_thumbnail_path text,
  p_mime_type text,
  p_byte_size bigint,
  p_thumbnail_byte_size bigint,
  p_checksum text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  upload public.media_uploads%rowtype;
begin
  select * into upload from public.media_uploads where id = p_upload_id for update;
  if not found or upload.created_by_user_id <> actor_id or upload.status <> 'staging' then
    raise exception using errcode = '42501', message = 'MEDIA_UPLOAD_NOT_EDITABLE';
  end if;
  if p_original_path not like upload.object_prefix || '/original.%'
     or p_thumbnail_path <> upload.object_prefix || '/thumb.webp'
     or p_original_path ~ '\.\.' or p_thumbnail_path ~ '\.\.' then
    raise exception using errcode = '22023', message = 'MEDIA_UPLOAD_PATH_INVALID';
  end if;
  if p_mime_type not in ('image/webp', 'image/jpeg', 'image/png')
     or p_byte_size not between 1 and 4194304
     or p_thumbnail_byte_size not between 1 and 524288
     or p_checksum !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'MEDIA_UPLOAD_METADATA_INVALID';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'family-media' and name = p_original_path)
     or not exists (select 1 from storage.objects where bucket_id = 'family-media' and name = p_thumbnail_path) then
    raise exception using errcode = '23503', message = 'MEDIA_UPLOAD_OBJECT_MISSING';
  end if;
  update public.media_uploads set
    status = 'verified', original_path = p_original_path, thumbnail_path = p_thumbnail_path,
    mime_type = p_mime_type, byte_size = p_byte_size, thumbnail_byte_size = p_thumbnail_byte_size,
    checksum = p_checksum, updated_at = now()
  where id = p_upload_id;
  return jsonb_build_object('status', 'verified', 'uploadId', p_upload_id, 'expiresAt', upload.expires_at);
end;
$$;

create function public.discard_media_upload(p_upload_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  upload public.media_uploads%rowtype;
begin
  select * into upload from public.media_uploads where id = p_upload_id for update;
  if not found or upload.created_by_user_id <> actor_id or upload.status = 'attached' then
    raise exception using errcode = '42501', message = 'MEDIA_UPLOAD_NOT_DISCARDABLE';
  end if;
  update public.media_uploads set status = 'discarded', updated_at = now() where id = p_upload_id;
  return jsonb_build_object('status', 'discarded', 'paths', jsonb_build_array(upload.original_path, upload.thumbnail_path));
end;
$$;

create function public._resolve_family_media_uploads(target_workspace_id uuid, family_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  resolved jsonb := '[]'::jsonb;
  upload public.media_uploads%rowtype;
  file_id text;
begin
  for item in select value from jsonb_array_elements(coalesce(family_data -> 'media', '[]'::jsonb))
  loop
    if nullif(item ->> 'storagePath', '') is not null or nullif(item ->> 'driveFileId', '') is not null then
      resolved := resolved || jsonb_build_array(item);
      continue;
    end if;
    file_id := nullif(item ->> 'fileId', '');
    if file_id is null or file_id !~ '^[0-9a-f-]{36}$' then
      raise exception using errcode = '23503', message = 'FAMILY_MEDIA_UPLOAD_INVALID';
    end if;
    select * into upload from public.media_uploads
      where id = file_id::uuid and workspace_id = target_workspace_id and status in ('verified', 'attached')
      for update;
    if not found then
      raise exception using errcode = '23503', message = 'FAMILY_MEDIA_UPLOAD_INVALID';
    end if;
    if upload.status = 'verified' and upload.created_by_user_id <> (select auth.uid())
       and not public.can_review_workspace(target_workspace_id) then
      raise exception using errcode = '42501', message = 'FAMILY_MEDIA_UPLOAD_FORBIDDEN';
    end if;
    update public.media_uploads set status = 'attached', claimed_legacy_id = item ->> 'id', updated_at = now()
      where id = upload.id;
    item := jsonb_set(item, '{storagePath}', to_jsonb(upload.original_path), true);
    item := jsonb_set(item, '{thumbnailStoragePath}', to_jsonb(upload.thumbnail_path), true);
    resolved := resolved || jsonb_build_array(item);
  end loop;
  return jsonb_set(family_data, '{media}', resolved, true);
end;
$$;

create function public.enqueue_deleted_media_object()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.storage_bucket = 'family-media' and old.storage_path is not null then
    insert into public.media_cleanup_queue (workspace_id, original_path, thumbnail_path)
    values (old.workspace_id, old.storage_path, old.thumbnail_storage_path)
    on conflict (workspace_id, original_path) do update set
      thumbnail_path = excluded.thumbnail_path, status = 'pending', completed_at = null;
  end if;
  return old;
end;
$$;

create function public.hydrate_or_retain_media_object()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  upload public.media_uploads%rowtype;
begin
  if new.storage_bucket = 'family-media' and new.storage_path is not null then
    select * into upload from public.media_uploads
      where workspace_id = new.workspace_id and original_path = new.storage_path and status = 'attached';
    if found then
      new.thumbnail_storage_path := upload.thumbnail_path;
      new.mime_type := upload.mime_type;
      new.byte_size := upload.byte_size;
      new.checksum := upload.checksum;
      new.storage_status := 'ready';
    end if;
    delete from public.media_cleanup_queue
      where workspace_id = new.workspace_id and original_path = new.storage_path;
  end if;
  return new;
end;
$$;

create trigger media_enqueue_cleanup_before_delete
before delete on public.media for each row execute function public.enqueue_deleted_media_object();
create trigger media_hydrate_before_insert
before insert on public.media for each row execute function public.hydrate_or_retain_media_object();

alter table public.media_uploads enable row level security;
alter table public.media_cleanup_queue enable row level security;

grant select, insert, update, delete on public.media_uploads to authenticated;
grant select, update, delete on public.media_cleanup_queue to authenticated;
grant select, insert, update, delete on public.media_uploads to service_role;
grant select, insert, update, delete on public.media_cleanup_queue to service_role;

create policy media_uploads_select_owner_reviewer on public.media_uploads
  for select to authenticated using (
    created_by_user_id = (select auth.uid()) or public.can_review_workspace(workspace_id)
  );
create policy media_uploads_insert_own on public.media_uploads
  for insert to authenticated with check (
    created_by_user_id = (select auth.uid()) and public.workspace_role(workspace_id) in ('owner', 'editor', 'contributor')
  );
create policy media_uploads_update_own_staging on public.media_uploads
  for update to authenticated using (
    (created_by_user_id = (select auth.uid()) and status in ('staging', 'verified', 'discarded'))
    or public.can_review_workspace(workspace_id)
  ) with check (
    created_by_user_id = (select auth.uid()) or public.can_review_workspace(workspace_id)
  );

create policy media_cleanup_select_committers on public.media_cleanup_queue
  for select to authenticated using (public.can_commit_workspace(workspace_id));
create policy media_cleanup_update_committers on public.media_cleanup_queue
  for update to authenticated using (public.can_commit_workspace(workspace_id))
  with check (public.can_commit_workspace(workspace_id));
create policy media_cleanup_delete_committers on public.media_cleanup_queue
  for delete to authenticated using (public.can_commit_workspace(workspace_id));

create policy family_media_select_private on storage.objects
  for select to authenticated using (
    bucket_id = 'family-media' and public.can_read_media_object(name)
  );
create policy family_media_insert_scoped on storage.objects
  for insert to authenticated with check (
    bucket_id = 'family-media' and public.can_write_media_object(name)
  );
create policy family_media_update_scoped on storage.objects
  for update to authenticated using (
    bucket_id = 'family-media' and public.can_write_media_object(name)
  ) with check (
    bucket_id = 'family-media' and public.can_write_media_object(name)
  );
create policy family_media_delete_scoped on storage.objects
  for delete to authenticated using (
    bucket_id = 'family-media'
    and (
      public.can_write_media_object(name)
      or public.can_commit_workspace(public.media_object_workspace_id(name))
    )
  );

revoke all on function public.media_object_workspace_id(text) from public, anon;
revoke all on function public.media_object_upload_id(text) from public, anon;
revoke all on function public.can_read_media_object(text) from public, anon;
revoke all on function public.can_write_media_object(text) from public, anon;
revoke all on function public.prepare_media_upload(uuid, text, text) from public, anon;
revoke all on function public.verify_media_upload(uuid, text, text, text, bigint, bigint, text) from public, anon;
revoke all on function public.discard_media_upload(uuid) from public, anon;
revoke all on function public._resolve_family_media_uploads(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.enqueue_deleted_media_object() from public, anon, authenticated;
revoke all on function public.hydrate_or_retain_media_object() from public, anon, authenticated;

grant execute on function public.media_object_workspace_id(text) to authenticated, service_role;
grant execute on function public.media_object_upload_id(text) to authenticated, service_role;
grant execute on function public.can_read_media_object(text) to authenticated, service_role;
grant execute on function public.can_write_media_object(text) to authenticated, service_role;
grant execute on function public.prepare_media_upload(uuid, text, text) to authenticated;
grant execute on function public.verify_media_upload(uuid, text, text, text, bigint, bigint, text) to authenticated;
grant execute on function public.discard_media_upload(uuid) to authenticated;

comment on table public.media_uploads is 'Private staged uploads awaiting canonical FamilyData attachment';
comment on table public.media_cleanup_queue is 'Idempotent object cleanup after canonical media metadata deletion';

create or replace function public.commit_family_operations(
  p_workspace_id uuid,
  p_commit_id text,
  p_base_data_version bigint,
  p_operations jsonb,
  p_client_created_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.workspace_role;
  actor_email text;
  actor_name text;
  current_version bigint;
  current_snapshot jsonb;
  applied jsonb;
  candidate jsonb;
  conflicts jsonb;
  operation_count integer;
  operation_counts jsonb;
  request_checksum text;
  existing_commit public.commits%rowtype;
  next_version bigint;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if p_commit_id is null or p_commit_id !~ '^[A-Za-z0-9_-]{8,128}$' then
    raise exception using errcode = '22023', message = 'FAMILY_COMMIT_ID_INVALID';
  end if;
  if p_base_data_version is null or p_base_data_version < 0 then
    raise exception using errcode = '22023', message = 'FAMILY_BASE_VERSION_INVALID';
  end if;
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception using errcode = '22023', message = 'FAMILY_OPERATIONS_INVALID';
  end if;
  operation_count := jsonb_array_length(p_operations);
  if operation_count < 1 or operation_count > 1000 then
    raise exception using errcode = '22023', message = 'FAMILY_OPERATIONS_INVALID';
  end if;
  request_checksum := md5(p_base_data_version::text || ':' || p_operations::text);

  select member.role into actor_role
    from public.workspace_members member
    where member.workspace_id = p_workspace_id and member.user_id = actor_id;
  if actor_role is null then
    raise exception using errcode = '42501', message = 'WORKSPACE_NOT_FOUND';
  end if;
  if actor_role not in ('owner', 'editor') then
    raise exception using errcode = '42501', message = 'FAMILY_COMMIT_FORBIDDEN';
  end if;

  select workspace.data_version into current_version
    from public.workspaces workspace
    where workspace.id = p_workspace_id
    for update;
  if current_version is null then
    raise exception using errcode = 'P0002', message = 'WORKSPACE_NOT_FOUND';
  end if;

  select * into existing_commit
    from public.commits commit_row
    where commit_row.workspace_id = p_workspace_id and commit_row.commit_id = p_commit_id;
  if found then
    if existing_commit.request_checksum <> request_checksum then
      raise exception using errcode = '22023', message = 'FAMILY_COMMIT_ID_REUSED';
    end if;
    if existing_commit.status <> 'applied' then
      raise exception using errcode = '55000', message = 'FAMILY_COMMIT_NOT_APPLIED';
    end if;
    current_snapshot := public._family_snapshot_json(p_workspace_id);
    return jsonb_build_object(
      'status', 'applied',
      'idempotent', true,
      'autoMerged', existing_commit.auto_merged,
      'dataVersion', current_version,
      'resultDataVersion', existing_commit.result_data_version,
      'appliedCount', existing_commit.operation_count,
      'counts', existing_commit.operation_counts,
      'snapshot', current_snapshot
    );
  end if;

  current_snapshot := public._family_snapshot_json(p_workspace_id);
  applied := public._family_apply_operations(current_snapshot, p_operations);
  conflicts := applied -> 'conflicts';
  if jsonb_array_length(conflicts) > 0 then
    return jsonb_build_object(
      'status', 'conflict',
      'conflicts', conflicts,
      'dataVersion', current_version,
      'snapshot', current_snapshot
    );
  end if;
  candidate := public._resolve_family_media_uploads(p_workspace_id, applied -> 'data');

  perform public._replace_family_data(p_workspace_id, candidate);
  next_version := current_version + 1;
  update public.workspaces set data_version = next_version where id = p_workspace_id;

  select coalesce(jsonb_object_agg(operation_type, count), '{}'::jsonb)
    into operation_counts
  from (
    select operation ->> 'type' as operation_type, count(*)::integer as count
    from jsonb_array_elements(p_operations) operation
    group by operation ->> 'type'
  ) counts;

  insert into public.commits (
    workspace_id, commit_id, actor_user_id, base_data_version, result_data_version,
    operation_count, operation_counts, status, auto_merged, request_checksum, client_created_at, applied_at
  ) values (
    p_workspace_id, p_commit_id, actor_id, p_base_data_version, next_version,
    operation_count, operation_counts, 'applied', p_base_data_version <> current_version,
    request_checksum, p_client_created_at, now()
  );

  select coalesce(profile.email::text, auth_user.email, 'unknown@example.invalid'),
         nullif(profile.display_name, '')
    into actor_email, actor_name
  from auth.users auth_user
  left join public.user_profiles profile on profile.id = auth_user.id
  where auth_user.id = actor_id;

  insert into public.activity_events (
    workspace_id, actor_user_id, actor_email, actor_name, action, entity_type,
    summary, metadata, occurred_at
  ) values (
    p_workspace_id, actor_id, actor_email, actor_name, 'family.commit', 'dataset',
    format('%s saved %s family changes', coalesce(actor_name, actor_email), operation_count),
    jsonb_build_object('commitId', p_commit_id, 'operationCount', operation_count, 'counts', operation_counts),
    now()
  );

  current_snapshot := public._family_snapshot_json(p_workspace_id);
  return jsonb_build_object(
    'status', 'applied',
    'idempotent', false,
    'autoMerged', p_base_data_version <> current_version,
    'dataVersion', next_version,
    'resultDataVersion', next_version,
    'appliedCount', operation_count,
    'counts', operation_counts,
    'snapshot', current_snapshot
  );
end;
$$;
