alter table public.workspaces
  add column canonical_ready boolean not null default true;

alter table public.migration_runs
  add column source_checksum text,
  add column manifest_checksum text,
  add column resume_cursor integer not null default 0;

alter table public.migration_runs
  add constraint migration_runs_source_checksum_format check (source_checksum is null or source_checksum ~ '^[a-f0-9]{64}$'),
  add constraint migration_runs_manifest_checksum_format check (manifest_checksum is null or manifest_checksum ~ '^[a-f0-9]{64}$'),
  add constraint migration_runs_resume_cursor_nonnegative check (resume_cursor >= 0);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('famnesia.preserve_updated_at', true) <> 'on' then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

drop policy if exists workspaces_select_member on public.workspaces;
create policy workspaces_select_member on public.workspaces
  for select to authenticated using (canonical_ready and public.can_read_workspace(id));

create function public.start_drive_bundle_migration(
  p_workspace_id uuid,
  p_run_id uuid,
  p_owner_user_id uuid,
  p_name text,
  p_legacy_drive_folder_id text,
  p_source_revision text,
  p_source_checksum text,
  p_manifest_checksum text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_run public.migration_runs%rowtype;
  existing_workspace public.workspaces%rowtype;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'MIGRATION_SERVICE_ROLE_REQUIRED';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 120
     or length(trim(coalesce(p_legacy_drive_folder_id, ''))) < 3
     or p_source_checksum !~ '^[a-f0-9]{64}$'
     or p_manifest_checksum !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'MIGRATION_INPUT_INVALID';
  end if;
  if not exists (select 1 from auth.users where id = p_owner_user_id) then
    raise exception using errcode = '23503', message = 'MIGRATION_OWNER_NOT_FOUND';
  end if;

  select * into existing_run from public.migration_runs where id = p_run_id for update;
  if found then
    if existing_run.started_by_user_id <> p_owner_user_id
       or existing_run.source_checksum <> p_source_checksum
       or existing_run.manifest_checksum <> p_manifest_checksum
       or existing_run.workspace_id <> p_workspace_id then
      raise exception using errcode = '22023', message = 'MIGRATION_RUN_ID_REUSED';
    end if;
    if existing_run.status = 'completed' then
      return jsonb_build_object('status', 'already_completed', 'workspaceId', existing_run.workspace_id, 'runId', existing_run.id, 'resumeCursor', existing_run.resume_cursor);
    end if;
    update public.migration_runs set status = 'running', started_at = coalesce(started_at, now()), updated_at = now()
      where id = p_run_id;
    return jsonb_build_object('status', 'resumed', 'workspaceId', p_workspace_id, 'runId', p_run_id, 'resumeCursor', existing_run.resume_cursor);
  end if;

  select * into existing_workspace from public.workspaces
    where legacy_drive_folder_id = p_legacy_drive_folder_id for update;
  if found then
    select * into existing_run from public.migration_runs
      where workspace_id = existing_workspace.id and status = 'completed' and source_checksum = p_source_checksum
      order by completed_at desc limit 1;
    if found then
      return jsonb_build_object('status', 'already_completed', 'workspaceId', existing_workspace.id, 'runId', existing_run.id, 'resumeCursor', existing_run.resume_cursor);
    end if;
    raise exception using errcode = '23505', message = 'MIGRATION_TARGET_EXISTS';
  end if;

  insert into public.workspaces (
    id, owner_user_id, name, legacy_drive_folder_id, canonical_ready, data_version
  ) values (
    p_workspace_id, p_owner_user_id, trim(p_name), trim(p_legacy_drive_folder_id), false, 0
  );
  insert into public.migration_runs (
    id, workspace_id, source_type, source_revision, source_checksum, manifest_checksum,
    status, dry_run, report, started_by_user_id, started_at
  ) values (
    p_run_id, p_workspace_id, 'google_drive_bundle', nullif(trim(coalesce(p_source_revision, '')), ''),
    p_source_checksum, p_manifest_checksum, 'running', false,
    jsonb_build_object('uploadedPaths', '[]'::jsonb, 'phase', 'upload'), p_owner_user_id, now()
  );
  return jsonb_build_object('status', 'started', 'workspaceId', p_workspace_id, 'runId', p_run_id, 'resumeCursor', 0);
end;
$$;

create function public.load_drive_bundle_migration(
  p_run_id uuid,
  p_family_data jsonb,
  p_media_metadata jsonb,
  p_report jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  run public.migration_runs%rowtype;
  workspace public.workspaces%rowtype;
  item jsonb;
  snapshot jsonb;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'MIGRATION_SERVICE_ROLE_REQUIRED';
  end if;
  if jsonb_typeof(p_family_data) <> 'object' or jsonb_typeof(p_media_metadata) <> 'array' or jsonb_typeof(p_report) <> 'object' then
    raise exception using errcode = '22023', message = 'MIGRATION_PAYLOAD_INVALID';
  end if;
  select * into run from public.migration_runs where id = p_run_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'MIGRATION_RUN_NOT_FOUND'; end if;
  select * into workspace from public.workspaces where id = run.workspace_id for update;
  if run.status <> 'running' or workspace.canonical_ready then
    raise exception using errcode = '55000', message = 'MIGRATION_RUN_NOT_LOADABLE';
  end if;

  perform set_config('famnesia.preserve_updated_at', 'on', true);
  perform public._replace_family_data(workspace.id, p_family_data);
  for item in select value from jsonb_array_elements(p_media_metadata)
  loop
    if coalesce(item ->> 'mediaId', '') = ''
       or coalesce(item ->> 'sha256', '') !~ '^[a-f0-9]{64}$'
       or coalesce((item ->> 'bytes')::bigint, 0) < 1 then
      raise exception using errcode = '22023', message = 'MIGRATION_MEDIA_METADATA_INVALID';
    end if;
    update public.media set
      mime_type = nullif(item ->> 'mimeType', ''),
      byte_size = (item ->> 'bytes')::bigint,
      checksum = item ->> 'sha256',
      thumbnail_storage_path = nullif(item ->> 'thumbnailPath', ''),
      storage_status = 'ready'
    where workspace_id = workspace.id and legacy_id = item ->> 'mediaId';
    if not found then
      raise exception using errcode = '23503', message = 'MIGRATION_MEDIA_ROW_MISSING';
    end if;
  end loop;
  perform set_config('famnesia.preserve_updated_at', 'off', true);
  update public.migration_runs set
    status = 'running', resume_cursor = jsonb_array_length(p_media_metadata),
    report = p_report || jsonb_build_object('phase', 'reconcile'), updated_at = now()
  where id = p_run_id;
  snapshot := public._family_snapshot_json(workspace.id);
  return jsonb_build_object('status', 'loaded', 'workspaceId', workspace.id, 'runId', run.id, 'dataVersion', 0, 'snapshot', snapshot);
end;
$$;

create function public.publish_drive_bundle_migration(p_run_id uuid, p_report jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  run public.migration_runs%rowtype;
  workspace public.workspaces%rowtype;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'MIGRATION_SERVICE_ROLE_REQUIRED';
  end if;
  if jsonb_typeof(p_report) <> 'object' then
    raise exception using errcode = '22023', message = 'MIGRATION_REPORT_INVALID';
  end if;
  select * into run from public.migration_runs where id = p_run_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'MIGRATION_RUN_NOT_FOUND'; end if;
  select * into workspace from public.workspaces where id = run.workspace_id for update;
  if run.status = 'completed' and workspace.canonical_ready then
    return jsonb_build_object('status', 'already_completed', 'workspaceId', workspace.id, 'runId', run.id, 'dataVersion', workspace.data_version);
  end if;
  if run.status <> 'running' or workspace.canonical_ready or coalesce(run.report ->> 'phase', '') <> 'reconcile' then
    raise exception using errcode = '55000', message = 'MIGRATION_RUN_NOT_PUBLISHABLE';
  end if;
  update public.workspaces set data_version = 1, canonical_ready = true where id = workspace.id;
  update public.migration_runs set
    status = 'completed', report = p_report || jsonb_build_object('phase', 'completed'),
    completed_at = now(), updated_at = now()
  where id = p_run_id;
  return jsonb_build_object('status', 'completed', 'workspaceId', workspace.id, 'runId', run.id, 'dataVersion', 1);
end;
$$;

create function public.fail_drive_bundle_migration(p_run_id uuid, p_report jsonb, p_resume_cursor integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'MIGRATION_SERVICE_ROLE_REQUIRED';
  end if;
  update public.migration_runs set
    status = 'failed', report = coalesce(p_report, '{}'::jsonb),
    resume_cursor = greatest(coalesce(p_resume_cursor, 0), 0), updated_at = now()
  where id = p_run_id and status in ('pending', 'running', 'failed');
  if not found then raise exception using errcode = 'P0002', message = 'MIGRATION_RUN_NOT_FOUND'; end if;
end;
$$;

create function public.rollback_incomplete_drive_migration(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  run public.migration_runs%rowtype;
  ready boolean;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'MIGRATION_SERVICE_ROLE_REQUIRED';
  end if;
  select * into run from public.migration_runs where id = p_run_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'MIGRATION_RUN_NOT_FOUND'; end if;
  select canonical_ready into ready from public.workspaces where id = run.workspace_id for update;
  if run.status = 'completed' or ready then
    raise exception using errcode = '55000', message = 'MIGRATION_COMPLETED_NOT_ROLLBACKABLE';
  end if;
  delete from public.workspaces where id = run.workspace_id;
  return jsonb_build_object('status', 'rolled_back', 'workspaceId', run.workspace_id, 'runId', run.id);
end;
$$;

create function public.drive_migration_snapshot(p_run_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  run public.migration_runs%rowtype;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'MIGRATION_SERVICE_ROLE_REQUIRED';
  end if;
  select * into run from public.migration_runs where id = p_run_id;
  if not found or run.status not in ('running', 'completed') then
    raise exception using errcode = 'P0002', message = 'MIGRATION_RUN_NOT_LOADED';
  end if;
  return public._family_snapshot_json(run.workspace_id);
end;
$$;

revoke all on function public.start_drive_bundle_migration(uuid, uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.load_drive_bundle_migration(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.publish_drive_bundle_migration(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fail_drive_bundle_migration(uuid, jsonb, integer) from public, anon, authenticated;
revoke all on function public.rollback_incomplete_drive_migration(uuid) from public, anon, authenticated;
revoke all on function public.drive_migration_snapshot(uuid) from public, anon, authenticated;

grant execute on function public.start_drive_bundle_migration(uuid, uuid, uuid, text, text, text, text, text) to service_role;
grant execute on function public.load_drive_bundle_migration(uuid, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.publish_drive_bundle_migration(uuid, jsonb) to service_role;
grant execute on function public.fail_drive_bundle_migration(uuid, jsonb, integer) to service_role;
grant execute on function public.rollback_incomplete_drive_migration(uuid) to service_role;
grant execute on function public.drive_migration_snapshot(uuid) to service_role;

grant select on public.user_profiles, public.workspaces, public.workspace_members, public.persons to service_role;
grant select, update on public.migration_runs to service_role;

comment on column public.workspaces.canonical_ready is 'False while a CR09 migration is incomplete; hidden from authenticated runtime reads';
comment on function public.rollback_incomplete_drive_migration(uuid) is 'Deletes only a hidden incomplete migration workspace; Storage paths must be removed by the controlled CLI first';
