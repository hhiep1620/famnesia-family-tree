create table public.editor_commit_delegations (
  workspace_id uuid not null references public.workspace_crypto_states(workspace_id) on delete cascade,
  delegation_id text not null check (delegation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  principal_id text not null references public.crypto_principals(principal_id) on delete cascade,
  membership_epoch bigint not null check (membership_epoch > 0),
  scopes text[] not null,
  signer_fingerprint text not null check (signer_fingerprint ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  artifact jsonb not null,
  verified_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(workspace_id,delegation_id),
  constraint editor_delegation_scope check (
    cardinality(scopes) between 1 and 3
    and scopes <@ array['family_shared','media','contact']::text[]
  ),
  constraint editor_delegation_expiry check (expires_at > verified_at)
);

create table public.verified_checkpoint_intents (
  workspace_id uuid not null references public.workspace_crypto_states(workspace_id) on delete cascade,
  checkpoint_id text not null check (checkpoint_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  actor_principal_id text not null references public.crypto_principals(principal_id) on delete restrict,
  delegation_id text,
  request_checksum text not null check (request_checksum ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  membership_epoch bigint not null check (membership_epoch > 0),
  key_epoch integer not null check (key_epoch > 0),
  previous_checkpoint_revision bigint not null check (previous_checkpoint_revision >= 0),
  previous_checkpoint_hash text,
  next_checkpoint_hash text not null check (next_checkpoint_hash ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  external_anchor_hash text not null check (external_anchor_hash ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  artifact jsonb not null,
  verified_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_by_commit_id text,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(workspace_id,checkpoint_id),
  constraint checkpoint_intent_previous_hash check (
    (previous_checkpoint_revision=0 and previous_checkpoint_hash is null)
    or (previous_checkpoint_revision>0 and previous_checkpoint_hash ~ '^sha256:[A-Za-z0-9_-]{43}$')
  ),
  constraint checkpoint_intent_expiry check (expires_at > verified_at),
  constraint checkpoint_intent_consumption check (
    (consumed_at is null and consumed_by_commit_id is null)
    or (consumed_at is not null and consumed_by_commit_id is not null)
  ),
  constraint checkpoint_intent_delegation_fk foreign key(workspace_id,delegation_id)
    references public.editor_commit_delegations(workspace_id,delegation_id) on delete restrict
);

create table public.workspace_operation_checkpoints (
  workspace_id uuid not null references public.workspace_crypto_states(workspace_id) on delete cascade,
  checkpoint_revision bigint not null check (checkpoint_revision > 0),
  checkpoint_id text not null,
  checkpoint_hash text not null check (checkpoint_hash ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  previous_checkpoint_hash text,
  external_anchor_hash text not null check (external_anchor_hash ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  commit_id text not null,
  actor_principal_id text not null references public.crypto_principals(principal_id) on delete restrict,
  membership_epoch bigint not null check (membership_epoch > 0),
  key_epoch integer not null check (key_epoch > 0),
  artifact jsonb not null,
  created_at timestamptz not null default now(),
  primary key(workspace_id,checkpoint_revision),
  unique(workspace_id,checkpoint_id),
  unique(workspace_id,commit_id),
  constraint operation_checkpoint_commit_fk foreign key(workspace_id,commit_id)
    references public.encrypted_commits(workspace_id,commit_id) on delete restrict
);

alter table public.encrypted_commits
  add column membership_epoch bigint check (membership_epoch is null or membership_epoch > 0),
  add column checkpoint_revision bigint check (checkpoint_revision is null or checkpoint_revision > 0);

create function public.register_verified_editor_delegation(
  p_workspace_id uuid,p_delegation_id text,p_principal_id text,p_membership_epoch bigint,
  p_scopes text[],p_signer_fingerprint text,p_artifact jsonb,p_verified_at timestamptz,p_expires_at timestamptz
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'TRUSTED_VERIFIER_REQUIRED' using errcode='42501'; end if;
  if not exists(
    select 1 from public.workspace_crypto_states state
    join public.workspace_principal_directory directory on directory.workspace_id=state.workspace_id
    join public.workspace_members member on member.workspace_id=state.workspace_id and member.user_id=directory.auth_user_id
    where state.workspace_id=p_workspace_id and state.membership_epoch=p_membership_epoch
      and directory.principal_id=p_principal_id and directory.revoked_at is null and member.role='editor'
  ) then raise exception 'EDITOR_DELEGATION_SCOPE_INVALID' using errcode='42501'; end if;
  insert into public.editor_commit_delegations(workspace_id,delegation_id,principal_id,membership_epoch,scopes,
    signer_fingerprint,artifact,verified_at,expires_at)
  values(p_workspace_id,p_delegation_id,p_principal_id,p_membership_epoch,p_scopes,
    p_signer_fingerprint,p_artifact,p_verified_at,p_expires_at);
end;
$$;

create function public.register_verified_checkpoint_intent(
  p_workspace_id uuid,p_checkpoint_id text,p_actor_principal_id text,p_delegation_id text,
  p_request_checksum text,p_membership_epoch bigint,p_key_epoch integer,
  p_previous_checkpoint_revision bigint,p_previous_checkpoint_hash text,p_next_checkpoint_hash text,
  p_external_anchor_hash text,p_artifact jsonb,p_verified_at timestamptz,p_expires_at timestamptz
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'TRUSTED_VERIFIER_REQUIRED' using errcode='42501'; end if;
  insert into public.verified_checkpoint_intents(workspace_id,checkpoint_id,actor_principal_id,delegation_id,
    request_checksum,membership_epoch,key_epoch,previous_checkpoint_revision,previous_checkpoint_hash,
    next_checkpoint_hash,external_anchor_hash,artifact,verified_at,expires_at)
  values(p_workspace_id,p_checkpoint_id,p_actor_principal_id,p_delegation_id,
    p_request_checksum,p_membership_epoch,p_key_epoch,p_previous_checkpoint_revision,p_previous_checkpoint_hash,
    p_next_checkpoint_hash,p_external_anchor_hash,p_artifact,p_verified_at,p_expires_at);
end;
$$;

create function public.commit_encrypted_workspace_v2(
  p_workspace_id uuid,p_commit_id text,p_request_checksum text,p_expected_data_version bigint,
  p_expected_key_epoch integer,p_expected_membership_epoch bigint,p_dependencies jsonb,
  p_operations jsonb,p_checkpoint_id text
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid(); actor_role public.workspace_role; actor_principal text;
  state_row public.workspace_crypto_states%rowtype; existing_commit public.encrypted_commits%rowtype;
  intent public.verified_checkpoint_intents%rowtype; delegation public.editor_commit_delegations%rowtype;
  authorization_record public.signed_policy_authorizations%rowtype;
  operation jsonb; dependency jsonb; operation_type text; current_row_version bigint;
  result_version bigint; next_row_version bigint; canonical_request jsonb;
begin
  if actor_id is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select role into actor_role from public.workspace_members
    where workspace_id=p_workspace_id and user_id=actor_id;
  if actor_role not in ('owner','editor') then raise exception 'COMMIT_ROLE_DENIED' using errcode='42501'; end if;
  actor_principal:=public.current_crypto_principal(p_workspace_id);
  if actor_principal is null then raise exception 'ACTIVE_PRINCIPAL_REQUIRED' using errcode='42501'; end if;
  if p_request_checksum !~ '^sha256:[A-Za-z0-9_-]{43}$' then raise exception 'INVALID_REQUEST_CHECKSUM'; end if;
  if jsonb_typeof(p_dependencies)<>'array' or jsonb_array_length(p_dependencies)>500 then raise exception 'INVALID_DEPENDENCY_BATCH'; end if;
  if jsonb_typeof(p_operations)<>'array' or jsonb_array_length(p_operations) not between 1 and 500 then raise exception 'INVALID_OPERATION_BATCH'; end if;
  canonical_request:=jsonb_build_object('workspaceId',p_workspace_id,'baseDataVersion',p_expected_data_version,
    'keyEpoch',p_expected_key_epoch,'membershipEpoch',p_expected_membership_epoch,
    'dependencies',p_dependencies,'operations',p_operations,'checkpointId',p_checkpoint_id);

  select * into state_row from public.workspace_crypto_states where workspace_id=p_workspace_id for update;
  if not found then raise exception 'CRYPTO_STATE_NOT_FOUND'; end if;
  select * into existing_commit from public.encrypted_commits where workspace_id=p_workspace_id and commit_id=p_commit_id;
  if found then
    if existing_commit.request_checksum<>p_request_checksum or existing_commit.request_payload<>canonical_request
      or existing_commit.membership_epoch<>p_expected_membership_epoch
    then raise exception 'COMMIT_ID_REUSED'; end if;
    return jsonb_build_object('commitId',p_commit_id,'dataVersion',existing_commit.result_data_version,
      'checkpointRevision',existing_commit.checkpoint_revision,
      'checkpointHash',(select checkpoint_hash from public.workspace_operation_checkpoints
        where workspace_id=p_workspace_id and commit_id=p_commit_id),'idempotent',true);
  end if;
  if state_row.crypto_version<>1 or state_row.encrypted_schema_version<>1 then raise exception 'UNSUPPORTED_CRYPTO_STATE'; end if;
  if state_row.key_epoch<>p_expected_key_epoch then raise exception 'STALE_KEY_EPOCH'; end if;
  if state_row.membership_epoch<>p_expected_membership_epoch then raise exception 'STALE_MEMBERSHIP_EPOCH' using errcode='40001'; end if;
  if not exists(select 1 from public.collaboration_cutovers where workspace_id=p_workspace_id and state='active')
    then raise exception 'COLLABORATION_CUTOVER_NOT_ACTIVE' using errcode='42501'; end if;

  if actor_role='editor' then
    select d.* into delegation from public.editor_commit_delegations d
    where d.workspace_id=p_workspace_id and d.principal_id=actor_principal
      and d.membership_epoch=state_row.membership_epoch and d.verified_at<=now()
      and d.expires_at>now() and d.revoked_at is null order by d.verified_at desc limit 1;
    if not found then raise exception 'EDITOR_DELEGATION_REQUIRED' using errcode='42501'; end if;
  end if;

  select * into intent from public.verified_checkpoint_intents
    where workspace_id=p_workspace_id and checkpoint_id=p_checkpoint_id for update;
  if not found or intent.actor_principal_id<>actor_principal or intent.request_checksum<>p_request_checksum
    or intent.membership_epoch<>state_row.membership_epoch or intent.key_epoch<>state_row.key_epoch
    or intent.previous_checkpoint_revision<>state_row.checkpoint_revision
    or intent.previous_checkpoint_hash is distinct from state_row.checkpoint_hash
    or intent.verified_at>now() or intent.expires_at<=now() or intent.consumed_at is not null
    or (actor_role='editor' and intent.delegation_id is distinct from delegation.delegation_id)
  then raise exception 'CHECKPOINT_INTENT_INVALID' using errcode='42501'; end if;

  for dependency in select value from jsonb_array_elements(p_dependencies) loop
    if dependency - array['kind','entityId','fieldClass','expectedRowVersion']::text[] <> '{}'::jsonb
      then raise exception 'INVALID_DEPENDENCY_SHAPE'; end if;
    if dependency->>'kind'='entity' then
      select row_version into current_row_version from public.encrypted_entities where workspace_id=p_workspace_id
        and entity_id=dependency->>'entityId' and field_class=(dependency->>'fieldClass')::public.encrypted_entity_class;
    elsif dependency->>'kind'='private' then
      select row_version into current_row_version from public.encrypted_private_fields where workspace_id=p_workspace_id
        and person_id=dependency->>'entityId' and field_class=(dependency->>'fieldClass')::public.private_field_class;
    else raise exception 'INVALID_DEPENDENCY_KIND'; end if;
    if coalesce(current_row_version,0)<>(dependency->>'expectedRowVersion')::bigint then raise exception 'DEPENDENCY_VERSION_CONFLICT' using errcode='40001'; end if;
  end loop;

  if exists(
    select 1 from (
      select case when value->>'type' like 'private_%' then 'private:'||(value->>'personId')||':'||(value->>'fieldClass')
                  when value->>'type' like 'entity_%' then 'entity:'||(value->>'entityId')||':'||(value->>'fieldClass') end target
      from jsonb_array_elements(p_operations)
    ) targets where target is not null group by target having count(*)>1
  ) then raise exception 'DUPLICATE_OPERATION_TARGET'; end if;

  result_version:=state_row.data_version+1;
  for operation in select value from jsonb_array_elements(p_operations) loop
    operation_type:=operation->>'type';
    if operation_type='entity_upsert' then
      if operation-array['type','entityId','fieldClass','expectedRowVersion','keyId','keyEpoch','envelope']::text[]<>'{}'::jsonb
        then raise exception 'INVALID_ENTITY_OPERATION_SHAPE'; end if;
      if actor_role='editor' and not ('family_shared'=any(delegation.scopes)
        or ((operation->>'fieldClass')='media_manifest' and 'media'=any(delegation.scopes)))
        then raise exception 'EDITOR_SCOPE_DENIED' using errcode='42501'; end if;
      if (operation->>'keyEpoch')::integer<>state_row.key_epoch then raise exception 'STALE_KEY_EPOCH'; end if;
      select row_version into current_row_version from public.encrypted_entities where workspace_id=p_workspace_id
        and entity_id=operation->>'entityId' and field_class=(operation->>'fieldClass')::public.encrypted_entity_class;
      if coalesce(current_row_version,0)<>(operation->>'expectedRowVersion')::bigint then raise exception 'ROW_VERSION_CONFLICT' using errcode='40001'; end if;
      next_row_version:=coalesce(current_row_version,0)+1;
      insert into public.encrypted_entities(workspace_id,entity_id,field_class,row_version,key_id,key_epoch,writer_principal_id,envelope)
      values(p_workspace_id,operation->>'entityId',(operation->>'fieldClass')::public.encrypted_entity_class,
        next_row_version,operation->>'keyId',state_row.key_epoch,actor_principal,operation->'envelope')
      on conflict(workspace_id,entity_id,field_class) do update set row_version=excluded.row_version,key_id=excluded.key_id,
        key_epoch=excluded.key_epoch,writer_principal_id=excluded.writer_principal_id,envelope=excluded.envelope,updated_at=now();
    elsif operation_type='entity_delete' then
      if operation-array['type','entityId','fieldClass','expectedRowVersion']::text[]<>'{}'::jsonb then raise exception 'INVALID_ENTITY_DELETE_SHAPE'; end if;
      if actor_role='editor' and not ('family_shared'=any(delegation.scopes)
        or ((operation->>'fieldClass')='media_manifest' and 'media'=any(delegation.scopes)))
        then raise exception 'EDITOR_SCOPE_DENIED' using errcode='42501'; end if;
      delete from public.encrypted_entities where workspace_id=p_workspace_id and entity_id=operation->>'entityId'
        and field_class=(operation->>'fieldClass')::public.encrypted_entity_class
        and row_version=(operation->>'expectedRowVersion')::bigint;
      if not found then raise exception 'ROW_VERSION_CONFLICT' using errcode='40001'; end if;
    elsif operation_type in ('private_upsert','private_delete') then
      if actor_role='editor' and not ('contact'=any(delegation.scopes)) then raise exception 'EDITOR_SCOPE_DENIED' using errcode='42501'; end if;
      if operation_type='private_upsert' and operation-array['type','personId','fieldClass','expectedRowVersion','keyId','keyEpoch','authorizationId','envelope']::text[]<>'{}'::jsonb
        then raise exception 'INVALID_PRIVATE_OPERATION_SHAPE'; end if;
      if operation_type='private_delete' and operation-array['type','personId','fieldClass','expectedRowVersion','authorizationId']::text[]<>'{}'::jsonb
        then raise exception 'INVALID_PRIVATE_DELETE_SHAPE'; end if;
      select * into authorization_record from public.signed_policy_authorizations where authorization_id=operation->>'authorizationId'
        and workspace_id=p_workspace_id and actor_principal_id=actor_principal and purpose='contact_edit'
        and person_id=operation->>'personId' and field_class=(operation->>'fieldClass')::public.private_field_class
        and policy_revision=state_row.policy_revision and graph_revision=state_row.graph_revision
        and binding_revision=state_row.binding_revision and key_epoch=state_row.key_epoch
        and verified_at<=now() and expires_at>now() and revoked_at is null;
      if not found then raise exception 'CONTACT_AUTHORIZATION_DENIED' using errcode='42501'; end if;
      if not exists(select 1 from public.contact_recipient_grants where workspace_id=p_workspace_id
        and person_id=operation->>'personId' and field_class=(operation->>'fieldClass')::public.private_field_class
        and key_epoch=state_row.key_epoch and recipient_principal_id=actor_principal and revoked_at is null)
        then raise exception 'CONTACT_VIEW_GRANT_REQUIRED' using errcode='42501'; end if;
      insert into public.authorization_nonce_ledger(workspace_id,nonce_hash,authorization_id,consumed_by_commit_id,consumed_by_principal_id)
        values(p_workspace_id,authorization_record.nonce_hash,authorization_record.authorization_id,p_commit_id,actor_principal);
      select row_version into current_row_version from public.encrypted_private_fields where workspace_id=p_workspace_id
        and person_id=operation->>'personId' and field_class=(operation->>'fieldClass')::public.private_field_class;
      if coalesce(current_row_version,0)<>(operation->>'expectedRowVersion')::bigint then raise exception 'ROW_VERSION_CONFLICT' using errcode='40001'; end if;
      if operation_type='private_delete' then
        delete from public.encrypted_private_fields where workspace_id=p_workspace_id and person_id=operation->>'personId'
          and field_class=(operation->>'fieldClass')::public.private_field_class;
      else
        if (operation->>'keyEpoch')::integer<>state_row.key_epoch then raise exception 'STALE_KEY_EPOCH'; end if;
        next_row_version:=coalesce(current_row_version,0)+1;
        insert into public.encrypted_private_fields(workspace_id,person_id,field_class,row_version,key_id,key_epoch,writer_principal_id,envelope)
        values(p_workspace_id,operation->>'personId',(operation->>'fieldClass')::public.private_field_class,next_row_version,
          operation->>'keyId',state_row.key_epoch,actor_principal,operation->'envelope')
        on conflict(workspace_id,person_id,field_class) do update set row_version=excluded.row_version,key_id=excluded.key_id,
          key_epoch=excluded.key_epoch,writer_principal_id=excluded.writer_principal_id,envelope=excluded.envelope,updated_at=now();
      end if;
    elsif operation_type='key_envelope_insert' then
      if actor_role<>'owner' then raise exception 'OWNER_KEY_LIFECYCLE_REQUIRED' using errcode='42501'; end if;
      if operation-array['type','wrappedEnvelope']::text[]<>'{}'::jsonb then raise exception 'INVALID_KEY_ENVELOPE_OPERATION_SHAPE'; end if;
      if operation->'wrappedEnvelope'->'context'->>'issuerPrincipalId'<>actor_principal then raise exception 'KEY_ISSUER_MISMATCH'; end if;
      if (operation->'wrappedEnvelope'->'context'->>'keyEpoch')::integer<>state_row.key_epoch
        or (operation->'wrappedEnvelope'->'context'->>'directoryRevision')::bigint<>state_row.directory_revision
        then raise exception 'STALE_KEY_DIRECTORY'; end if;
      if not exists(select 1 from public.workspace_principal_directory where workspace_id=p_workspace_id
        and principal_id=operation->'wrappedEnvelope'->'context'->>'recipientPrincipalId' and revoked_at is null)
        then raise exception 'RECIPIENT_NOT_ACTIVE'; end if;
      if not exists(select 1 from public.crypto_principals recipient where recipient.principal_id=operation->'wrappedEnvelope'->'context'->>'recipientPrincipalId'
        and recipient.unwrap_fingerprint=operation->'wrappedEnvelope'->'context'->>'recipientKeyFingerprint')
        then raise exception 'RECIPIENT_KEY_SUBSTITUTION'; end if;
      insert into public.encrypted_key_envelopes(workspace_id,envelope_id,entity_id,key_id,key_purpose,key_epoch,directory_revision,
        recipient_principal_id,recipient_unwrap_fingerprint,issuer_principal_id,issuer_signing_fingerprint,wrapped_envelope,expires_at)
      values(p_workspace_id,operation->'wrappedEnvelope'->'context'->>'envelopeId',operation->'wrappedEnvelope'->'context'->>'entityId',
        operation->'wrappedEnvelope'->'context'->>'keyId',(operation->'wrappedEnvelope'->'context'->>'keyPurpose')::public.encrypted_key_purpose,
        state_row.key_epoch,state_row.directory_revision,operation->'wrappedEnvelope'->'context'->>'recipientPrincipalId',
        operation->'wrappedEnvelope'->'context'->>'recipientKeyFingerprint',actor_principal,
        operation->'wrappedEnvelope'->'context'->>'issuerSigningFingerprint',operation->'wrappedEnvelope',
        to_timestamp((operation->'wrappedEnvelope'->'context'->>'expiresAt')::bigint));
    else raise exception 'UNSUPPORTED_ENCRYPTED_OPERATION'; end if;
  end loop;

  insert into public.encrypted_commits(workspace_id,commit_id,actor_principal_id,request_checksum,request_payload,
    base_data_version,result_data_version,operation_count,membership_epoch,checkpoint_revision)
  values(p_workspace_id,p_commit_id,actor_principal,p_request_checksum,canonical_request,p_expected_data_version,
    result_version,jsonb_array_length(p_operations),state_row.membership_epoch,state_row.checkpoint_revision+1);
  insert into public.workspace_operation_checkpoints(workspace_id,checkpoint_revision,checkpoint_id,checkpoint_hash,
    previous_checkpoint_hash,external_anchor_hash,commit_id,actor_principal_id,membership_epoch,key_epoch,artifact)
  values(p_workspace_id,state_row.checkpoint_revision+1,intent.checkpoint_id,intent.next_checkpoint_hash,
    intent.previous_checkpoint_hash,intent.external_anchor_hash,p_commit_id,actor_principal,state_row.membership_epoch,state_row.key_epoch,intent.artifact);
  update public.verified_checkpoint_intents set consumed_by_commit_id=p_commit_id,consumed_at=now()
    where workspace_id=p_workspace_id and checkpoint_id=p_checkpoint_id;
  update public.workspace_crypto_states set data_version=result_version,checkpoint_revision=checkpoint_revision+1,
    checkpoint_hash=intent.next_checkpoint_hash,updated_at=now() where workspace_id=p_workspace_id;
  return jsonb_build_object('commitId',p_commit_id,'dataVersion',result_version,
    'checkpointRevision',state_row.checkpoint_revision+1,'checkpointHash',intent.next_checkpoint_hash,'idempotent',false);
exception when unique_violation then
  if sqlerrm like '%authorization_nonce_ledger%' then raise exception 'AUTHORIZATION_REPLAY'; end if;
  raise;
end;
$$;

create function public.revoke_editor_delegations_on_membership_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare target_workspace_id uuid:=coalesce(new.workspace_id,old.workspace_id); target_user_id uuid:=coalesce(new.user_id,old.user_id);
begin
  update public.editor_commit_delegations delegation set revoked_at=coalesce(delegation.revoked_at,now())
  from public.workspace_principal_directory directory
  where delegation.workspace_id=target_workspace_id and delegation.revoked_at is null
    and directory.workspace_id=target_workspace_id and directory.principal_id=delegation.principal_id
    and directory.auth_user_id=target_user_id;
  return coalesce(new,old);
end;
$$;
create trigger workspace_members_revoke_editor_delegations
after update of role or delete on public.workspace_members
for each row execute function public.revoke_editor_delegations_on_membership_change();

do $$ declare table_name text; begin
  foreach table_name in array array['editor_commit_delegations','verified_checkpoint_intents','workspace_operation_checkpoints'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('alter table public.%I force row level security',table_name);
    execute format('revoke all on public.%I from public,anon,authenticated',table_name);
    execute format('grant all on public.%I to service_role',table_name);
  end loop;
end $$;
grant select on public.editor_commit_delegations,public.verified_checkpoint_intents,public.workspace_operation_checkpoints to authenticated;
create policy editor_delegations_select_actor_owner on public.editor_commit_delegations for select to authenticated
  using(principal_id=public.current_crypto_principal(workspace_id) or public.is_workspace_owner(workspace_id));
create policy checkpoint_intents_select_actor_owner on public.verified_checkpoint_intents for select to authenticated
  using(actor_principal_id=public.current_crypto_principal(workspace_id) or public.is_workspace_owner(workspace_id));
create policy operation_checkpoints_select_member on public.workspace_operation_checkpoints for select to authenticated
  using(public.can_read_workspace(workspace_id));

revoke all on function public.commit_encrypted_workspace(uuid,text,text,bigint,integer,jsonb) from authenticated;
revoke all on function public.register_verified_editor_delegation(uuid,text,text,bigint,text[],text,jsonb,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.register_verified_checkpoint_intent(uuid,text,text,text,text,bigint,integer,bigint,text,text,text,jsonb,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.commit_encrypted_workspace_v2(uuid,text,text,bigint,integer,bigint,jsonb,jsonb,text) from public,anon;
revoke all on function public.revoke_editor_delegations_on_membership_change() from public,anon,authenticated;
grant execute on function public.register_verified_editor_delegation(uuid,text,text,bigint,text[],text,jsonb,timestamptz,timestamptz) to service_role;
grant execute on function public.register_verified_checkpoint_intent(uuid,text,text,text,text,bigint,integer,bigint,text,text,text,jsonb,timestamptz,timestamptz) to service_role;
grant execute on function public.commit_encrypted_workspace_v2(uuid,text,text,bigint,integer,bigint,jsonb,jsonb,text) to authenticated;

comment on function public.commit_encrypted_workspace_v2(uuid,text,text,bigint,integer,bigint,jsonb,jsonb,text) is
  'CR-08 direct encrypted owner/editor commit fenced by membership, delegation, row dependencies and an externally anchored verified checkpoint intent.';
