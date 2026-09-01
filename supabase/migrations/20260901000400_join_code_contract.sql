alter table public.workspaces add column if not exists join_code text;
alter table public.workspaces add column if not exists join_code_epoch bigint not null default 1;
alter table public.workspaces add column if not exists join_code_rotated_at timestamptz;
alter table public.workspaces add constraint workspaces_join_code_shape check (join_code is null or (join_code ~ '^[A-Za-z0-9]{8}$' and join_code ~ '[A-Z]' and join_code ~ '[a-z]' and join_code ~ '[0-9]'));
create unique index if not exists workspaces_join_code_unique on public.workspaces (join_code) where join_code is not null;

create table if not exists public.workspace_join_requests (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete cascade, requested_role public.workspace_role not null default 'viewer',
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired')), resolved_by uuid references auth.users(id), resolved_at timestamptz,
  created_at timestamptz not null default now(), unique (workspace_id, requester_user_id, status)
);
alter table public.workspace_join_requests enable row level security;
alter table public.workspace_join_requests force row level security;
revoke all on public.workspace_join_requests from public, anon, authenticated;
grant select, insert on public.workspace_join_requests to authenticated;
create policy workspace_join_requests_actor on public.workspace_join_requests for select to authenticated using (requester_user_id=auth.uid() or public.is_workspace_owner(workspace_id));
create policy workspace_join_requests_insert on public.workspace_join_requests for insert to authenticated with check (requester_user_id=auth.uid() and requested_role in ('owner','editor','viewer'));

create or replace function public.generate_workspace_join_code()
returns text language plpgsql volatile set search_path = '' as $$
declare candidate text;
begin
  loop
    candidate := translate(encode(extensions.gen_random_bytes(8), 'base64'), E'+/=\n', 'Aa0');
    candidate := regexp_replace(candidate, '[^A-Za-z0-9]', 'A', 'g');
    candidate := left(candidate || 'Aa0', 8);
    if candidate ~ '^[A-Za-z0-9]{8}$' and candidate ~ '[A-Z]' and candidate ~ '[a-z]' and candidate ~ '[0-9]' and not exists(select 1 from public.workspaces where join_code=candidate) then return candidate; end if;
  end loop;
  return null;
end;
$$;
revoke all on function public.generate_workspace_join_code() from public, anon, authenticated;

create or replace function public.rotate_workspace_join_code(p_workspace_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare next_code text;
begin
  if not public.is_workspace_owner(p_workspace_id) then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
  next_code := public.generate_workspace_join_code();
  update public.workspaces set join_code=next_code, join_code_epoch=join_code_epoch+1, join_code_rotated_at=now() where id=p_workspace_id;
  return next_code;
end;
$$;
revoke all on function public.rotate_workspace_join_code(uuid) from public, anon;
grant execute on function public.rotate_workspace_join_code(uuid) to authenticated;
