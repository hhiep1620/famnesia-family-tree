create table public.portability_export_scopes (
  authorization_id text primary key references public.signed_policy_authorizations(authorization_id) on delete cascade,
  workspace_id uuid not null references public.workspace_crypto_states(workspace_id) on delete cascade,
  profile_id text not null check (profile_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  format text not null check (format in ('gedcom','json','xlsx')),
  person_ids jsonb not null,
  fields jsonb not null,
  living_policy text not null check (living_policy = 'omit'),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint portability_scope_ids check (public.jsonb_opaque_id_array(person_ids) and public.jsonb_opaque_id_array(fields))
);

create function public.register_verified_portability_export_authorization(
  p_authorization_id text,p_workspace_id uuid,p_actor_principal_id text,p_profile_id text,p_format text,
  p_person_ids jsonb,p_fields jsonb,p_policy_revision bigint,p_graph_revision bigint,p_binding_revision bigint,
  p_key_epoch integer,p_nonce_hash text,p_artifact jsonb,p_verified_at timestamptz,p_expires_at timestamptz
)
returns void language plpgsql security definer set search_path = '' as $$
declare state_row public.workspace_crypto_states%rowtype;
begin
  if (select auth.jwt()->>'role') <> 'service_role' then raise exception 'TRUSTED_VERIFIER_REQUIRED' using errcode='42501'; end if;
  select * into state_row from public.workspace_crypto_states where workspace_id=p_workspace_id for update;
  if not found then raise exception 'CRYPTO_STATE_NOT_FOUND'; end if;
  if p_policy_revision<>state_row.policy_revision or p_graph_revision<>state_row.graph_revision
    or p_binding_revision<>state_row.binding_revision or p_key_epoch<>state_row.key_epoch then raise exception 'STALE_PORTABILITY_SCOPE'; end if;
  if p_expires_at<=p_verified_at or p_expires_at>p_verified_at+interval '10 minutes' then raise exception 'INVALID_PORTABILITY_EXPIRY'; end if;
  if p_format not in ('gedcom','json','xlsx') or not public.jsonb_opaque_id_array(p_person_ids) or not public.jsonb_opaque_id_array(p_fields)
    or p_artifact->>'purpose' <> 'portability_export' or p_artifact->>'signerPrincipalId' <> p_actor_principal_id then raise exception 'INVALID_PORTABILITY_SCOPE'; end if;
  if not exists(
    select 1 from public.crypto_principals principal
    left join public.workspaces workspace on workspace.id=p_workspace_id and workspace.owner_user_id=principal.auth_user_id
    left join public.workspace_principal_directory directory on directory.workspace_id=p_workspace_id and directory.principal_id=principal.principal_id and directory.revoked_at is null
    left join public.workspace_members member on member.workspace_id=p_workspace_id and member.user_id=principal.auth_user_id
    where principal.principal_id=p_actor_principal_id and (workspace.id is not null or member.role in ('owner','editor'))
  ) then raise exception 'PORTABILITY_EXPORT_ROLE_REQUIRED' using errcode='42501'; end if;
  insert into public.signed_policy_authorizations(authorization_id,workspace_id,actor_principal_id,person_id,field_class,purpose,
    policy_revision,graph_revision,binding_revision,key_epoch,nonce_hash,artifact,verified_at,expires_at)
  values(p_authorization_id,p_workspace_id,p_actor_principal_id,null,null,'portability_export',p_policy_revision,p_graph_revision,p_binding_revision,
    p_key_epoch,p_nonce_hash,p_artifact,p_verified_at,p_expires_at);
  insert into public.portability_export_scopes(authorization_id,workspace_id,profile_id,format,person_ids,fields,living_policy)
  values(p_authorization_id,p_workspace_id,p_profile_id,p_format,p_person_ids,p_fields,'omit');
end;
$$;

alter table public.portability_export_scopes enable row level security;
alter table public.portability_export_scopes force row level security;
revoke all on public.portability_export_scopes from public,anon,authenticated;
grant all on public.portability_export_scopes to service_role;
grant select on public.portability_export_scopes to authenticated;
create policy portability_export_scope_select_actor on public.portability_export_scopes for select to authenticated using(
  exists(select 1 from public.signed_policy_authorizations authz where authz.authorization_id=portability_export_scopes.authorization_id
    and authz.actor_principal_id=public.current_crypto_principal(portability_export_scopes.workspace_id))
);
revoke all on function public.register_verified_portability_export_authorization(text,uuid,text,text,text,jsonb,jsonb,bigint,bigint,bigint,integer,text,jsonb,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.register_verified_portability_export_authorization(text,uuid,text,text,text,jsonb,jsonb,bigint,bigint,bigint,integer,text,jsonb,timestamptz,timestamptz) to service_role;

create function public.consume_portability_export_authorization(p_workspace_id uuid, p_authorization_id text, p_export_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare authz public.signed_policy_authorizations%rowtype; scope_row public.portability_export_scopes%rowtype; actor text;
begin
  actor := public.current_crypto_principal(p_workspace_id);
  if actor is null then raise exception 'ACTIVE_PRINCIPAL_REQUIRED' using errcode='42501'; end if;
  select a.* into authz from public.signed_policy_authorizations a where a.authorization_id=p_authorization_id
    and a.workspace_id=p_workspace_id and a.actor_principal_id=actor and a.purpose='portability_export'
    and a.verified_at<=now() and a.expires_at>now() and a.revoked_at is null for update;
  if not found then raise exception 'PORTABILITY_AUTHORIZATION_DENIED' using errcode='42501'; end if;
  select * into scope_row from public.portability_export_scopes where authorization_id=p_authorization_id for update;
  if not found or scope_row.consumed_at is not null then raise exception 'AUTHORIZATION_REPLAY'; end if;
  insert into public.authorization_nonce_ledger(workspace_id,nonce_hash,authorization_id,consumed_by_commit_id,consumed_by_principal_id)
    values(p_workspace_id,authz.nonce_hash,p_authorization_id,p_export_id,actor);
  update public.portability_export_scopes set consumed_at=now() where authorization_id=p_authorization_id;
  return jsonb_build_object('authorizationId',scope_row.authorization_id,'workspaceId',scope_row.workspace_id,'profileId',scope_row.profile_id,
    'format',scope_row.format,'personIds',scope_row.person_ids,'fields',scope_row.fields,'livingPolicy',scope_row.living_policy);
exception when unique_violation then raise exception 'AUTHORIZATION_REPLAY';
end;
$$;
revoke all on function public.consume_portability_export_authorization(uuid,text,text) from public,anon;
grant execute on function public.consume_portability_export_authorization(uuid,text,text) to authenticated;
