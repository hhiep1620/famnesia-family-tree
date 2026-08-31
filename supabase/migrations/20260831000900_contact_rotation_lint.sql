create or replace function public.begin_contact_key_rotation(
  p_workspace_id uuid,p_rotation_id text,p_person_id text,p_field_class public.private_field_class,p_policy_id text,
  p_expected_from_epoch integer,p_to_key_id text,p_audience_manifest_hmac text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_principal text; policy_row public.contact_policy_artifacts%rowtype; field_row public.contact_field_states%rowtype;
  existing public.contact_key_rotations%rowtype; request_value jsonb; request_digest text; result_value jsonb;
begin
  actor_principal:=public.current_crypto_principal(p_workspace_id);
  if actor_principal is null then raise exception 'ACTIVE_PRINCIPAL_REQUIRED' using errcode='42501'; end if;
  select * into policy_row from public.contact_policy_artifacts where policy_id=p_policy_id and workspace_id=p_workspace_id
    and person_id=p_person_id and field_class=p_field_class and revoked_at is null;
  if not found or policy_row.policy_principal_id<>actor_principal then raise exception 'POLICY_PRINCIPAL_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.workspace_crypto_states s where s.workspace_id=p_workspace_id
    and s.policy_revision=policy_row.policy_revision and s.graph_revision=policy_row.graph_revision
    and s.binding_revision=policy_row.binding_revision) then raise exception 'STALE_POLICY_INPUT'; end if;
  request_value:=jsonb_build_object('workspaceId',p_workspace_id,'rotationId',p_rotation_id,'personId',p_person_id,
    'fieldClass',p_field_class,'policyId',p_policy_id,'fromEpoch',p_expected_from_epoch,'toKeyId',p_to_key_id,'audienceManifestHmac',p_audience_manifest_hmac);
  request_digest:=public.binding_request_hash(request_value);
  select * into existing from public.contact_key_rotations where workspace_id=p_workspace_id and rotation_id=p_rotation_id;
  if found then
    if existing.request_hash<>request_digest then raise exception 'ROTATION_ID_REUSED'; end if;
    return coalesce(existing.result,jsonb_build_object('rotationId',p_rotation_id,'state',existing.state,'toKeyEpoch',existing.to_key_epoch));
  end if;
  select * into field_row from public.contact_field_states where workspace_id=p_workspace_id and person_id=p_person_id and field_class=p_field_class for update;
  if found and (field_row.lifecycle<>'active' or field_row.key_epoch<>p_expected_from_epoch) then raise exception 'CONTACT_FIELD_ROTATION_CONFLICT'; end if;
  if not found and p_expected_from_epoch<>0 then raise exception 'CONTACT_FIELD_ROTATION_CONFLICT'; end if;
  if policy_row.key_epoch<>p_expected_from_epoch+1 then raise exception 'POLICY_KEY_EPOCH_MISMATCH'; end if;
  insert into public.contact_key_rotations(workspace_id,rotation_id,person_id,field_class,policy_id,from_key_id,from_key_epoch,
    to_key_id,to_key_epoch,request_hash,audience_manifest_hmac)
  values(p_workspace_id,p_rotation_id,p_person_id,p_field_class,p_policy_id,field_row.key_id,p_expected_from_epoch,
    p_to_key_id,p_expected_from_epoch+1,request_digest,p_audience_manifest_hmac);
  insert into public.contact_field_states(workspace_id,person_id,field_class,key_id,key_epoch,lifecycle,active_policy_id,rotation_id)
    values(p_workspace_id,p_person_id,p_field_class,p_to_key_id,p_expected_from_epoch+1,'rotating',p_policy_id,p_rotation_id)
  on conflict(workspace_id,person_id,field_class) do update set key_id=excluded.key_id,key_epoch=excluded.key_epoch,
    lifecycle='rotating',active_policy_id=excluded.active_policy_id,rotation_id=excluded.rotation_id,updated_at=now();
  result_value:=jsonb_build_object('rotationId',p_rotation_id,'state','prepared','toKeyEpoch',p_expected_from_epoch+1);
  return result_value;
end;
$$;

revoke all on function public.begin_contact_key_rotation(uuid,text,text,public.private_field_class,text,integer,text,text) from public,anon;
grant execute on function public.begin_contact_key_rotation(uuid,text,text,public.private_field_class,text,integer,text,text) to authenticated;
