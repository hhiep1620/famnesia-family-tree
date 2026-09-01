create type public.target_workspace_role as enum ('owner', 'editor', 'viewer');
create type public.collaboration_cutover_state as enum ('inventory', 'ready', 'active', 'blocked');
create type public.legacy_collaboration_disposition as enum ('viewer', 'revoked', 'export_required', 'discarded');

alter table public.workspace_crypto_states
  add column membership_epoch bigint not null default 1 check (membership_epoch > 0),
  add column checkpoint_revision bigint not null default 0 check (checkpoint_revision >= 0),
  add column checkpoint_hash text check (checkpoint_hash is null or checkpoint_hash ~ '^sha256:[A-Za-z0-9_-]{43}$');

create table public.collaboration_cutovers (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  state public.collaboration_cutover_state not null default 'inventory',
  activated_membership_epoch bigint check (activated_membership_epoch is null or activated_membership_epoch > 0),
  inventory_completed_at timestamptz,
  activated_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint collaboration_cutover_lifecycle check (
    (state <> 'active' and activated_at is null)
    or (state = 'active' and activated_at is not null and activated_membership_epoch is not null)
  )
);

create table public.legacy_collaboration_inventory (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  artifact_kind text not null check (artifact_kind in ('membership','invitation','draft')),
  artifact_id text not null,
  legacy_role text,
  disposition public.legacy_collaboration_disposition not null,
  recorded_at timestamptz not null default now(),
  primary key (workspace_id, artifact_kind, artifact_id),
  constraint legacy_role_inventory_value check (legacy_role is null or legacy_role = 'contributor')
);

insert into public.collaboration_cutovers(workspace_id, state, inventory_completed_at)
select id, 'inventory', now() from public.workspaces
on conflict (workspace_id) do nothing;

insert into public.legacy_collaboration_inventory(workspace_id, artifact_kind, artifact_id, legacy_role, disposition)
select workspace_id, 'membership', user_id::text, 'contributor', 'viewer'
from public.workspace_members where role = 'contributor'
on conflict do nothing;

insert into public.legacy_collaboration_inventory(workspace_id, artifact_kind, artifact_id, legacy_role, disposition)
select workspace_id, 'invitation', id::text, 'contributor', 'revoked'
from public.workspace_invitations where role = 'contributor' and status = 'pending'
on conflict do nothing;

insert into public.legacy_collaboration_inventory(workspace_id, artifact_kind, artifact_id, legacy_role, disposition)
select workspace_id, 'draft', id::text, 'contributor',
  case when status in ('approved','rejected','invalid') then 'discarded'::public.legacy_collaboration_disposition
       else 'export_required'::public.legacy_collaboration_disposition end
from public.draft_submissions
on conflict do nothing;

update public.workspace_invitations
set status = 'revoked', revoked_at = coalesce(revoked_at, now()), updated_at = now()
where role = 'contributor' and status = 'pending';

update public.workspace_members set role = 'viewer', updated_at = now() where role = 'contributor';
update public.workspace_invitations set role = 'viewer', updated_at = now() where role = 'contributor';

drop policy if exists draft_submissions_insert_own on public.draft_submissions;
drop policy if exists draft_submissions_update_own on public.draft_submissions;
drop policy if exists draft_submissions_delete_own_draft on public.draft_submissions;
drop policy if exists draft_operations_update_own on public.draft_operations;
drop policy if exists draft_operations_insert_own on public.draft_operations;
drop policy if exists draft_operations_delete_own on public.draft_operations;
drop policy if exists media_uploads_insert_own on public.media_uploads;

drop function public.create_workspace_invitation(uuid, text, public.workspace_role, text, timestamptz);
drop function public.workspace_role(uuid);
alter table public.workspace_invitations drop constraint workspace_invitations_role_not_owner;
alter table public.workspace_members alter column role type public.target_workspace_role using role::text::public.target_workspace_role;
alter table public.workspace_invitations alter column role type public.target_workspace_role using role::text::public.target_workspace_role;
drop type public.workspace_role;
alter type public.target_workspace_role rename to workspace_role;
alter table public.workspace_invitations add constraint workspace_invitations_role_not_owner check (role <> 'owner');

create function public.workspace_role(target_workspace_id uuid)
returns public.workspace_role
language sql stable security definer set search_path = ''
as $$
  select role from public.workspace_members
  where workspace_id = target_workspace_id and user_id = (select auth.uid()) limit 1;
$$;

create function public.create_workspace_invitation(
  p_workspace_id uuid, p_email text, p_role public.workspace_role,
  p_token_hash text, p_expires_at timestamptz
)
returns jsonb
language plpgsql security definer set search_path = ''
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
     or p_role not in ('editor', 'viewer')
     or p_token_hash !~ '^[a-f0-9]{64}$'
     or p_expires_at <= now() or p_expires_at > now() + interval '30 days' then
    raise exception using errcode = '22023', message = 'INVITATION_INVALID';
  end if;
  if exists (
    select 1 from public.user_profiles profile
    join public.workspace_members member on member.user_id = profile.id
    where member.workspace_id = p_workspace_id and profile.email = normalized_email
  ) then raise exception using errcode = '23505', message = 'MEMBER_ALREADY_EXISTS'; end if;
  update public.workspace_invitations set status = 'revoked', revoked_at = now(), updated_at = now()
    where workspace_id = p_workspace_id and email = normalized_email and status = 'pending';
  insert into public.workspace_invitations(workspace_id,email,role,status,token_hash,invited_by_user_id,expires_at)
  values(p_workspace_id,normalized_email,p_role,'pending',p_token_hash,actor_id,p_expires_at)
  returning id into invitation_id;
  return jsonb_build_object('id',invitation_id,'email',normalized_email,'role',p_role,'expiresAt',p_expires_at);
end;
$$;

create function public.fence_workspace_membership_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare target_workspace_id uuid := coalesce(new.workspace_id, old.workspace_id);
begin
  update public.workspace_crypto_states
  set membership_epoch = membership_epoch + 1, updated_at = now()
  where workspace_id = target_workspace_id;
  return coalesce(new, old);
end;
$$;

create trigger workspace_members_crypto_fence
after insert or update of role or delete on public.workspace_members
for each row execute function public.fence_workspace_membership_change();

create policy media_uploads_insert_owner_editor on public.media_uploads
for insert to authenticated with check (
  created_by_user_id = (select auth.uid())
  and public.workspace_role(workspace_id) in ('owner', 'editor')
);

create or replace function public.can_write_media_object(object_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.media_uploads upload
    where upload.id = public.media_object_upload_id(object_name)
      and upload.workspace_id = public.media_object_workspace_id(object_name)
      and object_name like upload.object_prefix || '/%'
      and (
        (upload.created_by_user_id = (select auth.uid())
          and upload.status in ('staging','verified')
          and public.workspace_role(upload.workspace_id) in ('owner','editor'))
        or (upload.status in ('discarded','expired') and public.can_review_workspace(upload.workspace_id))
      )
  );
$$;

create or replace function public.can_read_media_object(object_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  with target as (
    select public.media_object_workspace_id(object_name) workspace_id,
           public.media_object_upload_id(object_name) upload_id
  ), upload as (
    select item.status,item.created_by_user_id from public.media_uploads item,target
    where item.id=target.upload_id and item.workspace_id=target.workspace_id
  )
  select public.can_read_workspace(target.workspace_id) and (
    not exists(select 1 from upload)
    or exists(select 1 from upload where status='attached')
    or exists(select 1 from upload where created_by_user_id=(select auth.uid()))
    or public.is_workspace_owner(target.workspace_id)
  ) from target;
$$;

create or replace function public.prepare_media_upload(
  p_workspace_id uuid,p_profile_legacy_id text,p_person_legacy_id text
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid()); actor_role public.workspace_role;
  profile_id uuid; person_id uuid; upload_id uuid := gen_random_uuid(); object_prefix text;
begin
  select role into actor_role from public.workspace_members
    where workspace_id=p_workspace_id and user_id=actor_id;
  if actor_role is null or actor_role not in ('owner','editor') then
    raise exception using errcode='42501',message='MEDIA_UPLOAD_FORBIDDEN';
  end if;
  select id into profile_id from public.family_profiles
    where workspace_id=p_workspace_id and legacy_id=p_profile_legacy_id;
  select id into person_id from public.persons
    where workspace_id=p_workspace_id and family_profile_id=profile_id and legacy_id=p_person_legacy_id;
  if profile_id is null or person_id is null then
    raise exception using errcode='23503',message='MEDIA_UPLOAD_REFERENCE_MISSING';
  end if;
  object_prefix:=concat_ws('/',p_workspace_id::text,profile_id::text,person_id::text,upload_id::text);
  insert into public.media_uploads(id,workspace_id,family_profile_id,person_id,created_by_user_id,object_prefix)
    values(upload_id,p_workspace_id,profile_id,person_id,actor_id,object_prefix);
  return jsonb_build_object('uploadId',upload_id,'objectPrefix',object_prefix,'expiresAt',now()+interval '24 hours');
end;
$$;

update public.collaboration_cutovers cutover
set state = case when exists (
      select 1 from public.legacy_collaboration_inventory inventory
      where inventory.workspace_id = cutover.workspace_id and inventory.disposition = 'export_required'
    ) then 'inventory'::public.collaboration_cutover_state else 'active'::public.collaboration_cutover_state end,
    activated_membership_epoch = case when exists (
      select 1 from public.legacy_collaboration_inventory inventory
      where inventory.workspace_id = cutover.workspace_id and inventory.disposition = 'export_required'
    ) then null else coalesce((select membership_epoch from public.workspace_crypto_states state where state.workspace_id=cutover.workspace_id),1) end,
    activated_at = case when exists (
      select 1 from public.legacy_collaboration_inventory inventory
      where inventory.workspace_id = cutover.workspace_id and inventory.disposition = 'export_required'
    ) then null else now() end,
    updated_at = now();

create function public.initialize_workspace_collaboration_cutover()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.collaboration_cutovers(
    workspace_id,state,activated_membership_epoch,inventory_completed_at,activated_at
  ) values(new.id,'active',1,now(),now()) on conflict(workspace_id) do nothing;
  return new;
end;
$$;

create trigger workspaces_collaboration_cutover
after insert on public.workspaces
for each row execute function public.initialize_workspace_collaboration_cutover();

drop function public.submit_family_draft(uuid,bigint,jsonb,text,timestamptz);
drop function public.finalize_family_draft_review(uuid,uuid,integer,text,text[],text,bigint);
drop function public.mark_family_draft_needs_changes(uuid,uuid,integer,text);
drop function public.cleanup_terminal_family_drafts(uuid);
revoke all on function public.workspace_role(uuid) from public,anon;
revoke all on function public.create_workspace_invitation(uuid,text,public.workspace_role,text,timestamptz) from public,anon;
revoke all on function public.fence_workspace_membership_change() from public,anon,authenticated;
revoke all on function public.initialize_workspace_collaboration_cutover() from public,anon,authenticated;
grant execute on function public.workspace_role(uuid) to authenticated,service_role;
grant execute on function public.create_workspace_invitation(uuid,text,public.workspace_role,text,timestamptz) to authenticated;

alter table public.collaboration_cutovers enable row level security;
alter table public.collaboration_cutovers force row level security;
alter table public.legacy_collaboration_inventory enable row level security;
alter table public.legacy_collaboration_inventory force row level security;
revoke all on public.collaboration_cutovers, public.legacy_collaboration_inventory from public,anon,authenticated;
grant all on public.collaboration_cutovers, public.legacy_collaboration_inventory to service_role;
grant select on public.collaboration_cutovers, public.legacy_collaboration_inventory to authenticated;
create policy collaboration_cutovers_select_member on public.collaboration_cutovers
  for select to authenticated using (public.can_read_workspace(workspace_id));
create policy legacy_collaboration_inventory_select_owner on public.legacy_collaboration_inventory
  for select to authenticated using (public.is_workspace_owner(workspace_id));

comment on table public.legacy_collaboration_inventory is
  'CR-08 opaque inventory of legacy role-bearing artifacts; contains no family/contact plaintext.';
