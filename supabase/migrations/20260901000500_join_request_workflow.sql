-- CR-13 join codes are routing identifiers only. They never grant membership or keys.

drop policy if exists workspace_join_requests_insert on public.workspace_join_requests;
create policy workspace_join_requests_insert on public.workspace_join_requests
  for insert to authenticated
  with check (requester_user_id = auth.uid() and requested_role in ('editor', 'viewer'));

create or replace function public.create_family_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  workspace_id uuid;
begin
  if actor_id is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'WORKSPACE_NAME_INVALID';
  end if;
  insert into public.workspaces (owner_user_id, name, join_code, join_code_rotated_at)
  values (actor_id, trim(p_name), public.generate_workspace_join_code(), now())
  returning id into workspace_id;
  return workspace_id;
end;
$$;

update public.workspaces
set join_code = public.generate_workspace_join_code(), join_code_rotated_at = now()
where join_code is null;

create or replace function public.ensure_workspace_join_code()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.join_code is null then
    new.join_code := public.generate_workspace_join_code();
    new.join_code_rotated_at := coalesce(new.join_code_rotated_at, now());
  end if;
  return new;
end;
$$;
revoke all on function public.ensure_workspace_join_code() from public, anon, authenticated;
drop trigger if exists workspaces_ensure_join_code on public.workspaces;
create trigger workspaces_ensure_join_code before insert on public.workspaces
for each row execute function public.ensure_workspace_join_code();

alter table public.workspaces alter column join_code set not null;

create or replace function public.request_workspace_join(p_join_code text, p_requested_role public.workspace_role default 'viewer')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_workspace uuid;
  request_id uuid;
begin
  if actor_id is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if p_join_code !~ '^[A-Za-z0-9]{8}$' or p_requested_role not in ('editor', 'viewer') then
    raise exception using errcode = '22023', message = 'JOIN_REQUEST_INVALID';
  end if;
  select id into target_workspace from public.workspaces where join_code = p_join_code;
  if target_workspace is null then raise exception using errcode = 'P0002', message = 'JOIN_CODE_NOT_FOUND'; end if;
  if exists(select 1 from public.workspace_members where workspace_id = target_workspace and user_id = actor_id) then
    raise exception using errcode = '23505', message = 'ALREADY_WORKSPACE_MEMBER';
  end if;
  select id into request_id from public.workspace_join_requests
  where workspace_id = target_workspace and requester_user_id = actor_id and status = 'pending';
  if request_id is null then
    insert into public.workspace_join_requests (workspace_id, requester_user_id, requested_role)
    values (target_workspace, actor_id, p_requested_role)
    returning id into request_id;
  end if;
  return jsonb_build_object('requestId', request_id, 'status', 'pending');
end;
$$;

create or replace function public.list_workspace_join_requests(p_workspace_id uuid)
returns table(request_id uuid, requester_user_id uuid, requester_email text, requester_name text, requested_role public.workspace_role, requested_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_workspace_owner(p_workspace_id) then raise exception using errcode = '42501', message = 'OWNER_REQUIRED'; end if;
  return query
  select request.id, request.requester_user_id, profile.email::text, profile.display_name, request.requested_role, request.created_at
  from public.workspace_join_requests request
  join public.user_profiles profile on profile.id = request.requester_user_id
  where request.workspace_id = p_workspace_id and request.status = 'pending'
  order by request.created_at;
end;
$$;

create or replace function public.resolve_workspace_join_request(
  p_workspace_id uuid,
  p_request_id uuid,
  p_approve boolean,
  p_role public.workspace_role default 'viewer'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  requester_id uuid;
  next_status text := case when p_approve then 'approved' else 'rejected' end;
begin
  if actor_id is null or not public.is_workspace_owner(p_workspace_id) then raise exception using errcode = '42501', message = 'OWNER_REQUIRED'; end if;
  if p_role not in ('editor', 'viewer') then raise exception using errcode = '22023', message = 'JOIN_ROLE_INVALID'; end if;
  select requester_user_id into requester_id from public.workspace_join_requests
  where id = p_request_id and workspace_id = p_workspace_id and status = 'pending'
  for update;
  if requester_id is null then raise exception using errcode = 'P0002', message = 'JOIN_REQUEST_NOT_FOUND'; end if;
  if p_approve then
    insert into public.workspace_members (workspace_id, user_id, role, invited_by_user_id)
    values (p_workspace_id, requester_id, p_role, actor_id)
    on conflict (workspace_id, user_id) do update set role = excluded.role;
  end if;
  update public.workspace_join_requests
  set status = next_status, resolved_by = actor_id, resolved_at = now()
  where id = p_request_id;
  return next_status;
end;
$$;

revoke all on function public.request_workspace_join(text, public.workspace_role) from public, anon;
revoke all on function public.list_workspace_join_requests(uuid) from public, anon;
revoke all on function public.resolve_workspace_join_request(uuid, uuid, boolean, public.workspace_role) from public, anon;
grant execute on function public.request_workspace_join(text, public.workspace_role) to authenticated;
grant execute on function public.list_workspace_join_requests(uuid) to authenticated;
grant execute on function public.resolve_workspace_join_request(uuid, uuid, boolean, public.workspace_role) to authenticated;
