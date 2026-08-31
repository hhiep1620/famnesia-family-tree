create function public.commit_contact_field_write(
  p_workspace_id uuid,p_commit_id text,p_expected_data_version bigint,p_person_id text,
  p_field_class public.private_field_class,p_expected_row_version bigint,p_authorization_id text,
  p_key_id text,p_key_epoch integer,p_envelope jsonb,p_clear boolean default false
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_principal text;
  state_row public.workspace_crypto_states%rowtype;
  field_row public.contact_field_states%rowtype;
  authorization_record public.signed_policy_authorizations%rowtype;
  existing_commit public.encrypted_commits%rowtype;
  current_row_version bigint;
  result_version bigint;
  canonical_request jsonb;
  request_digest text;
begin
  if public.workspace_role(p_workspace_id) not in ('owner','editor') then raise exception 'CONTACT_EDITOR_ROLE_REQUIRED' using errcode='42501'; end if;
  actor_principal:=public.current_crypto_principal(p_workspace_id);
  if actor_principal is null then raise exception 'ACTIVE_PRINCIPAL_REQUIRED' using errcode='42501'; end if;
  canonical_request:=jsonb_build_object('type',case when p_clear then 'private_delete' else 'private_upsert' end,
    'workspaceId',p_workspace_id,'personId',p_person_id,'fieldClass',p_field_class,'expectedRowVersion',p_expected_row_version,
    'authorizationId',p_authorization_id,'keyId',p_key_id,'keyEpoch',p_key_epoch,'envelope',case when p_clear then null else p_envelope end);
  request_digest:=public.binding_request_hash(canonical_request);
  select * into state_row from public.workspace_crypto_states where workspace_id=p_workspace_id for update;
  if not found then raise exception 'CRYPTO_STATE_NOT_FOUND'; end if;
  select * into existing_commit from public.encrypted_commits where workspace_id=p_workspace_id and commit_id=p_commit_id;
  if found then
    if existing_commit.request_checksum<>request_digest or existing_commit.request_payload<>canonical_request then raise exception 'COMMIT_ID_REUSED'; end if;
    return jsonb_build_object('commitId',p_commit_id,'dataVersion',existing_commit.result_data_version,'idempotent',true);
  end if;
  if state_row.data_version<>p_expected_data_version then raise exception 'STALE_DATA_VERSION'; end if;
  select * into field_row from public.contact_field_states where workspace_id=p_workspace_id and person_id=p_person_id
    and field_class=p_field_class and lifecycle='active' for update;
  if not found or field_row.key_id<>p_key_id or field_row.key_epoch<>p_key_epoch then raise exception 'STALE_CONTACT_KEY'; end if;
  select * into authorization_record from public.signed_policy_authorizations where authorization_id=p_authorization_id
    and workspace_id=p_workspace_id and actor_principal_id=actor_principal and purpose='contact_edit'
    and person_id=p_person_id and field_class=p_field_class and policy_revision=state_row.policy_revision
    and graph_revision=state_row.graph_revision and binding_revision=state_row.binding_revision and key_epoch=field_row.key_epoch
    and verified_at<=now() and expires_at>now() and revoked_at is null;
  if not found then raise exception 'CONTACT_AUTHORIZATION_DENIED' using errcode='42501'; end if;
  insert into public.authorization_nonce_ledger(workspace_id,nonce_hash,authorization_id,consumed_by_commit_id,consumed_by_principal_id)
    values(p_workspace_id,authorization_record.nonce_hash,authorization_record.authorization_id,p_commit_id,actor_principal);
  select row_version into current_row_version from public.encrypted_private_fields where workspace_id=p_workspace_id
    and person_id=p_person_id and field_class=p_field_class;
  if coalesce(current_row_version,0)<>p_expected_row_version then raise exception 'ROW_VERSION_CONFLICT'; end if;
  result_version:=state_row.data_version+1;
  if p_clear then
    delete from public.encrypted_private_fields where workspace_id=p_workspace_id and person_id=p_person_id and field_class=p_field_class;
  else
    if not public.encrypted_envelope_matches(p_envelope,p_workspace_id,p_person_id,p_field_class::text,result_version,
      p_key_id,p_key_epoch,p_envelope->'aad'->>'writerId','contact') then raise exception 'CONTACT_CIPHERTEXT_BINDING_MISMATCH'; end if;
    insert into public.encrypted_private_fields(workspace_id,person_id,field_class,row_version,key_id,key_epoch,writer_principal_id,envelope)
      values(p_workspace_id,p_person_id,p_field_class,result_version,p_key_id,p_key_epoch,actor_principal,p_envelope)
    on conflict(workspace_id,person_id,field_class) do update set row_version=excluded.row_version,key_id=excluded.key_id,
      key_epoch=excluded.key_epoch,writer_principal_id=excluded.writer_principal_id,envelope=excluded.envelope,updated_at=now();
  end if;
  update public.workspace_crypto_states set data_version=result_version,updated_at=now() where workspace_id=p_workspace_id;
  insert into public.encrypted_commits(workspace_id,commit_id,actor_principal_id,request_checksum,request_payload,
    base_data_version,result_data_version,operation_count)
  values(p_workspace_id,p_commit_id,actor_principal,request_digest,canonical_request,p_expected_data_version,result_version,1);
  return jsonb_build_object('commitId',p_commit_id,'dataVersion',result_version,'idempotent',false);
exception when unique_violation then
  if sqlerrm like '%authorization_nonce_ledger%' then raise exception 'AUTHORIZATION_REPLAY'; end if;
  raise;
end;
$$;

revoke all on function public.commit_contact_field_write(uuid,text,bigint,text,public.private_field_class,bigint,text,text,integer,jsonb,boolean) from public,anon;
grant execute on function public.commit_contact_field_write(uuid,text,bigint,text,public.private_field_class,bigint,text,text,integer,jsonb,boolean) to authenticated;
comment on function public.commit_contact_field_write(uuid,text,bigint,text,public.private_field_class,bigint,text,text,integer,jsonb,boolean) is
  'CR-07 exact-field encrypted contact write. Requires a trusted-verifier registered, unexpired, one-time edit authorization.';
