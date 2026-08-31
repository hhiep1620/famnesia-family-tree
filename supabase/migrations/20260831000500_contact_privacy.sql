create type public.contact_audience as enum ('self_only','direct_family','close_blood','blood_only','workspace_members','custom');
create type public.contact_field_lifecycle as enum ('active','rotating');
create type public.contact_rotation_state as enum ('prepared','complete');

create function public.jsonb_opaque_id_array(candidate jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(candidate)='array'
    and not exists(select 1 from jsonb_array_elements(candidate) item where jsonb_typeof(item)<>'string' or item#>>'{}' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$')
    and jsonb_array_length(candidate)=(select count(distinct item#>>'{}') from jsonb_array_elements(candidate) item),false);
$$;

create table public.contact_policy_artifacts (
  policy_id text primary key check (policy_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  workspace_id uuid not null references public.workspace_crypto_states(workspace_id) on delete cascade,
  profile_id text not null check (profile_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  person_id text not null check (person_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  field_class public.private_field_class not null,
  policy_principal_id text not null references public.crypto_principals(principal_id) on delete restrict,
  subject_binding_id uuid references public.member_person_bindings(binding_id) on delete restrict,
  audience public.contact_audience not null,
  allow_principal_ids jsonb not null default '[]',
  deny_principal_ids jsonb not null default '[]',
  recipient_principal_ids jsonb not null,
  policy_revision bigint not null check (policy_revision > 0),
  graph_revision bigint not null check (graph_revision > 0),
  binding_revision bigint not null check (binding_revision > 0),
  key_epoch integer not null check (key_epoch > 0),
  signer_fingerprint text not null check (signer_fingerprint ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  nonce_hash text not null unique check (nonce_hash ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  artifact jsonb not null,
  active boolean not null default false,
  verified_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint contact_policy_principal_directory_fk foreign key (workspace_id,policy_principal_id)
    references public.workspace_principal_directory(workspace_id,principal_id) on delete restrict,
  constraint contact_policy_id_arrays check (public.jsonb_opaque_id_array(allow_principal_ids)
    and public.jsonb_opaque_id_array(deny_principal_ids) and public.jsonb_opaque_id_array(recipient_principal_ids)),
  constraint contact_policy_expiry check (expires_at > verified_at)
);
create unique index contact_policy_active_field_unique on public.contact_policy_artifacts(workspace_id,person_id,field_class) where active and revoked_at is null;

create table public.contact_field_states (
  workspace_id uuid not null references public.workspace_crypto_states(workspace_id) on delete cascade,
  person_id text not null,
  field_class public.private_field_class not null,
  key_id text not null check (key_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  key_epoch integer not null check (key_epoch > 0),
  lifecycle public.contact_field_lifecycle not null,
  active_policy_id text not null references public.contact_policy_artifacts(policy_id) on delete restrict,
  rotation_id text,
  updated_at timestamptz not null default now(),
  primary key(workspace_id,person_id,field_class),
  constraint contact_field_rotation_shape check ((lifecycle='active' and rotation_id is null) or (lifecycle='rotating' and rotation_id is not null))
);

create table public.contact_key_rotations (
  workspace_id uuid not null references public.workspace_crypto_states(workspace_id) on delete cascade,
  rotation_id text not null check (rotation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  person_id text not null,
  field_class public.private_field_class not null,
  policy_id text not null references public.contact_policy_artifacts(policy_id) on delete restrict,
  from_key_id text,
  from_key_epoch integer not null check (from_key_epoch >= 0),
  to_key_id text not null,
  to_key_epoch integer not null,
  request_hash text not null check (request_hash ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  audience_manifest_hmac text not null check (audience_manifest_hmac ~ '^hmac-sha256:[A-Za-z0-9_-]{43}$'),
  state public.contact_rotation_state not null default 'prepared',
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key(workspace_id,rotation_id),
  unique(workspace_id,person_id,field_class,to_key_epoch),
  constraint contact_rotation_epoch_step check (to_key_epoch=from_key_epoch+1),
  constraint contact_rotation_lifecycle check ((state='prepared' and result is null and completed_at is null)
    or (state='complete' and result is not null and completed_at is not null))
);

create table public.contact_recipient_grants (
  workspace_id uuid not null,
  person_id text not null,
  field_class public.private_field_class not null,
  key_epoch integer not null check (key_epoch > 0),
  recipient_principal_id text not null references public.crypto_principals(principal_id) on delete restrict,
  binding_id uuid not null references public.member_person_bindings(binding_id) on delete restrict,
  binding_version bigint not null check (binding_version > 0),
  policy_id text not null references public.contact_policy_artifacts(policy_id) on delete restrict,
  envelope_id text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key(workspace_id,person_id,field_class,key_epoch,recipient_principal_id),
  constraint contact_grant_field_fk foreign key(workspace_id,person_id,field_class)
    references public.contact_field_states(workspace_id,person_id,field_class) on delete cascade,
  constraint contact_grant_envelope_fk foreign key(workspace_id,envelope_id)
    references public.encrypted_key_envelopes(workspace_id,envelope_id) on delete restrict
);

create function public.register_verified_contact_policy(
  p_policy_id text,p_workspace_id uuid,p_profile_id text,p_person_id text,p_field_class public.private_field_class,
  p_policy_principal_id text,p_subject_binding_id uuid,p_audience public.contact_audience,
  p_allow_principal_ids jsonb,p_deny_principal_ids jsonb,p_recipient_principal_ids jsonb,
  p_policy_revision bigint,p_graph_revision bigint,p_binding_revision bigint,p_key_epoch integer,
  p_signer_fingerprint text,p_nonce_hash text,p_artifact jsonb,p_verified_at timestamptz,p_expires_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  state_row public.workspace_crypto_states%rowtype;
  subject public.member_person_bindings%rowtype;
  owner_principal text;
  recipient text;
begin
  if (select auth.jwt()->>'role') <> 'service_role' then raise exception 'TRUSTED_VERIFIER_REQUIRED' using errcode='42501'; end if;
  select * into state_row from public.workspace_crypto_states where workspace_id=p_workspace_id for update;
  if not found then raise exception 'CRYPTO_STATE_NOT_FOUND'; end if;
  if p_policy_revision<>state_row.policy_revision+1 or p_graph_revision<>state_row.graph_revision
    or p_binding_revision<>state_row.binding_revision then raise exception 'STALE_POLICY_INPUT'; end if;
  if p_expires_at<=p_verified_at or p_expires_at>p_verified_at+interval '24 hours' then raise exception 'INVALID_POLICY_EXPIRY'; end if;
  if not public.jsonb_opaque_id_array(p_allow_principal_ids) or not public.jsonb_opaque_id_array(p_deny_principal_ids)
    or not public.jsonb_opaque_id_array(p_recipient_principal_ids) then raise exception 'INVALID_POLICY_AUDIENCE'; end if;
  select * into subject from public.member_person_bindings where binding_id=p_subject_binding_id and workspace_id=p_workspace_id
    and profile_id=p_profile_id and person_id=p_person_id and state='confirmed';
  if found then
    if subject.principal_id<>p_policy_principal_id or subject.binding_version>p_binding_revision
      or subject.pinned_signing_fingerprint<>p_signer_fingerprint then raise exception 'SUBJECT_POLICY_PRINCIPAL_MISMATCH'; end if;
  else
    select d.principal_id into owner_principal from public.workspaces w join public.workspace_principal_directory d
      on d.workspace_id=w.id and d.auth_user_id=w.owner_user_id and d.revoked_at is null where w.id=p_workspace_id;
    if owner_principal is null or owner_principal<>p_policy_principal_id then raise exception 'POLICY_STEWARD_REQUIRED'; end if;
  end if;
  if not exists(select 1 from public.crypto_principals where principal_id=p_policy_principal_id and signing_fingerprint=p_signer_fingerprint)
    then raise exception 'POLICY_SIGNER_FINGERPRINT_MISMATCH'; end if;
  if p_artifact->>'purpose'<>'policy' or p_artifact->>'signerPrincipalId'<>p_policy_principal_id
    or p_artifact->>'signerKeyFingerprint'<>p_signer_fingerprint then raise exception 'POLICY_ARTIFACT_BINDING_MISMATCH'; end if;
  for recipient in select value#>>'{}' from jsonb_array_elements(p_recipient_principal_ids) loop
    if not exists(select 1 from public.member_person_bindings b where b.workspace_id=p_workspace_id and b.profile_id=p_profile_id
      and b.principal_id=recipient and b.state='confirmed' and b.binding_version<=p_binding_revision) then
      raise exception 'POLICY_RECIPIENT_UNBOUND';
    end if;
  end loop;
  update public.contact_policy_artifacts set revoked_at=p_verified_at where workspace_id=p_workspace_id and person_id=p_person_id
    and field_class=p_field_class and not active and revoked_at is null;
  insert into public.contact_policy_artifacts(policy_id,workspace_id,profile_id,person_id,field_class,policy_principal_id,
    subject_binding_id,audience,allow_principal_ids,deny_principal_ids,recipient_principal_ids,policy_revision,graph_revision,
    binding_revision,key_epoch,signer_fingerprint,nonce_hash,artifact,verified_at,expires_at)
  values(p_policy_id,p_workspace_id,p_profile_id,p_person_id,p_field_class,p_policy_principal_id,p_subject_binding_id,
    p_audience,p_allow_principal_ids,p_deny_principal_ids,p_recipient_principal_ids,p_policy_revision,p_graph_revision,
    p_binding_revision,p_key_epoch,p_signer_fingerprint,p_nonce_hash,p_artifact,p_verified_at,p_expires_at);
  update public.workspace_crypto_states set policy_revision=p_policy_revision,updated_at=now() where workspace_id=p_workspace_id;
  return jsonb_build_object('policyId',p_policy_id,'policyRevision',p_policy_revision,'bindingRevision',p_binding_revision,'keyEpoch',p_key_epoch);
end;
$$;

create function public.begin_contact_key_rotation(
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

create function public.complete_contact_key_rotation(
  p_workspace_id uuid,p_rotation_id text,p_expected_data_version bigint,p_envelope jsonb,p_wrapped_envelopes jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_principal text; rotation public.contact_key_rotations%rowtype; policy_row public.contact_policy_artifacts%rowtype;
  state_row public.workspace_crypto_states%rowtype; wrapped jsonb; recipient text; binding_row public.member_person_bindings%rowtype;
  expected_count integer; result_version bigint; result_value jsonb;
begin
  actor_principal:=public.current_crypto_principal(p_workspace_id);
  select * into rotation from public.contact_key_rotations where workspace_id=p_workspace_id and rotation_id=p_rotation_id for update;
  if not found then raise exception 'CONTACT_ROTATION_NOT_FOUND'; end if;
  if rotation.state='complete' then return rotation.result; end if;
  select * into policy_row from public.contact_policy_artifacts where policy_id=rotation.policy_id and revoked_at is null;
  if not found or actor_principal is null or policy_row.policy_principal_id<>actor_principal
    or policy_row.expires_at<=now() then raise exception 'POLICY_PRINCIPAL_REQUIRED' using errcode='42501'; end if;
  select * into state_row from public.workspace_crypto_states where workspace_id=p_workspace_id for update;
  if state_row.data_version<>p_expected_data_version or state_row.policy_revision<>policy_row.policy_revision
    or state_row.graph_revision<>policy_row.graph_revision or state_row.binding_revision<>policy_row.binding_revision then raise exception 'STALE_CONTACT_ROTATION'; end if;
  result_version:=state_row.data_version+1;
  if not public.encrypted_envelope_matches(p_envelope,p_workspace_id,rotation.person_id,rotation.field_class::text,result_version,
    rotation.to_key_id,rotation.to_key_epoch,p_envelope->'aad'->>'writerId','contact') then raise exception 'CONTACT_CIPHERTEXT_BINDING_MISMATCH'; end if;
  if jsonb_typeof(p_wrapped_envelopes)<>'array' then raise exception 'INVALID_CONTACT_ENVELOPE_SET'; end if;
  expected_count:=jsonb_array_length(policy_row.recipient_principal_ids);
  if jsonb_array_length(p_wrapped_envelopes)<>expected_count then raise exception 'CONTACT_RECIPIENT_SET_MISMATCH'; end if;
  if (select count(distinct item->'context'->>'recipientPrincipalId') from jsonb_array_elements(p_wrapped_envelopes) item)<>expected_count
    then raise exception 'CONTACT_RECIPIENT_SET_MISMATCH'; end if;
  for wrapped in select value from jsonb_array_elements(p_wrapped_envelopes) loop
    recipient:=wrapped->'context'->>'recipientPrincipalId';
    if not policy_row.recipient_principal_ids ? recipient then raise exception 'CONTACT_RECIPIENT_SET_MISMATCH'; end if;
    select * into binding_row from public.member_person_bindings where workspace_id=p_workspace_id and profile_id=policy_row.profile_id
      and principal_id=recipient and state='confirmed' and binding_version<=policy_row.binding_revision;
    if not found or binding_row.pinned_unwrap_fingerprint<>wrapped->'context'->>'recipientKeyFingerprint' then raise exception 'CONTACT_RECIPIENT_BINDING_MISMATCH'; end if;
    insert into public.encrypted_key_envelopes(workspace_id,envelope_id,entity_id,key_id,key_purpose,key_epoch,directory_revision,
      recipient_principal_id,recipient_unwrap_fingerprint,issuer_principal_id,issuer_signing_fingerprint,wrapped_envelope,expires_at)
    values(p_workspace_id,wrapped->'context'->>'envelopeId',rotation.person_id,rotation.to_key_id,'contact',rotation.to_key_epoch,
      state_row.directory_revision,recipient,binding_row.pinned_unwrap_fingerprint,actor_principal,policy_row.signer_fingerprint,wrapped,
      to_timestamp((wrapped->'context'->>'expiresAt')::bigint));
    insert into public.contact_recipient_grants(workspace_id,person_id,field_class,key_epoch,recipient_principal_id,binding_id,binding_version,policy_id,envelope_id)
      values(p_workspace_id,rotation.person_id,rotation.field_class,rotation.to_key_epoch,recipient,binding_row.binding_id,
        binding_row.binding_version,policy_row.policy_id,wrapped->'context'->>'envelopeId');
  end loop;
  update public.encrypted_key_envelopes e set revoked_at=now() from public.contact_recipient_grants g
    where g.workspace_id=p_workspace_id and g.person_id=rotation.person_id and g.field_class=rotation.field_class
      and g.key_epoch<rotation.to_key_epoch and g.revoked_at is null and e.workspace_id=g.workspace_id and e.envelope_id=g.envelope_id;
  update public.contact_recipient_grants set revoked_at=now() where workspace_id=p_workspace_id and person_id=rotation.person_id
    and field_class=rotation.field_class and key_epoch<rotation.to_key_epoch and revoked_at is null;
  insert into public.encrypted_private_fields(workspace_id,person_id,field_class,row_version,key_id,key_epoch,writer_principal_id,envelope)
    values(p_workspace_id,rotation.person_id,rotation.field_class,result_version,rotation.to_key_id,rotation.to_key_epoch,actor_principal,p_envelope)
  on conflict(workspace_id,person_id,field_class) do update set row_version=excluded.row_version,key_id=excluded.key_id,
    key_epoch=excluded.key_epoch,writer_principal_id=excluded.writer_principal_id,envelope=excluded.envelope,updated_at=now();
  update public.contact_field_states set lifecycle='active',rotation_id=null,updated_at=now() where workspace_id=p_workspace_id
    and person_id=rotation.person_id and field_class=rotation.field_class and rotation_id=p_rotation_id;
  update public.contact_policy_artifacts set active=false,revoked_at=now() where workspace_id=p_workspace_id
    and person_id=rotation.person_id and field_class=rotation.field_class and active and policy_id<>policy_row.policy_id;
  update public.contact_policy_artifacts set active=true where policy_id=policy_row.policy_id;
  update public.workspace_crypto_states set data_version=result_version,updated_at=now() where workspace_id=p_workspace_id;
  result_value:=jsonb_build_object('rotationId',p_rotation_id,'state','complete','keyEpoch',rotation.to_key_epoch,'dataVersion',result_version);
  update public.contact_key_rotations set state='complete',result=result_value,completed_at=now() where workspace_id=p_workspace_id and rotation_id=p_rotation_id;
  return result_value;
end;
$$;

create function public.register_verified_contact_edit_authorization(
  p_authorization_id text,p_workspace_id uuid,p_actor_principal_id text,p_person_id text,p_field_class public.private_field_class,
  p_policy_revision bigint,p_graph_revision bigint,p_binding_revision bigint,p_key_epoch integer,p_nonce_hash text,
  p_artifact jsonb,p_verified_at timestamptz,p_expires_at timestamptz
)
returns void language plpgsql security definer set search_path = '' as $$
declare policy_row public.contact_policy_artifacts%rowtype; state_row public.workspace_crypto_states%rowtype;
begin
  if (select auth.jwt()->>'role')<>'service_role' then raise exception 'TRUSTED_VERIFIER_REQUIRED' using errcode='42501'; end if;
  select * into state_row from public.workspace_crypto_states where workspace_id=p_workspace_id;
  select * into policy_row from public.contact_policy_artifacts where workspace_id=p_workspace_id and person_id=p_person_id
    and field_class=p_field_class and active and revoked_at is null;
  if not found or policy_row.policy_revision<>p_policy_revision or state_row.graph_revision<>p_graph_revision
    or state_row.binding_revision<>p_binding_revision or policy_row.key_epoch<>p_key_epoch then raise exception 'STALE_CONTACT_AUTHORIZATION'; end if;
  if not exists(select 1 from public.workspace_principal_directory d join public.workspace_members m on m.workspace_id=d.workspace_id and m.user_id=d.auth_user_id
    where d.workspace_id=p_workspace_id and d.principal_id=p_actor_principal_id and d.revoked_at is null and m.role in('owner','editor'))
    then raise exception 'CONTACT_EDITOR_ROLE_REQUIRED'; end if;
  if p_expires_at<=p_verified_at or p_expires_at>p_verified_at+interval '10 minutes' then raise exception 'INVALID_CONTACT_AUTHORIZATION_EXPIRY'; end if;
  if p_artifact->>'purpose'<>'policy' or p_artifact->>'signerPrincipalId'<>policy_row.policy_principal_id
    or p_artifact->>'signerKeyFingerprint'<>policy_row.signer_fingerprint then raise exception 'CONTACT_AUTHORIZATION_SIGNATURE_BINDING_MISMATCH'; end if;
  insert into public.signed_policy_authorizations(authorization_id,workspace_id,actor_principal_id,person_id,field_class,purpose,
    policy_revision,graph_revision,binding_revision,key_epoch,nonce_hash,artifact,verified_at,expires_at)
  values(p_authorization_id,p_workspace_id,p_actor_principal_id,p_person_id,p_field_class,'contact_edit',p_policy_revision,
    p_graph_revision,p_binding_revision,p_key_epoch,p_nonce_hash,p_artifact,p_verified_at,p_expires_at);
end;
$$;

alter table public.contact_policy_artifacts enable row level security; alter table public.contact_policy_artifacts force row level security;
alter table public.contact_field_states enable row level security; alter table public.contact_field_states force row level security;
alter table public.contact_key_rotations enable row level security; alter table public.contact_key_rotations force row level security;
alter table public.contact_recipient_grants enable row level security; alter table public.contact_recipient_grants force row level security;
create policy contact_policy_select_member on public.contact_policy_artifacts for select to authenticated using(public.is_workspace_member(workspace_id));
create policy contact_field_state_select_member on public.contact_field_states for select to authenticated using(public.is_workspace_member(workspace_id));
create policy contact_rotation_select_policy_principal on public.contact_key_rotations for select to authenticated using(
  exists(select 1 from public.contact_policy_artifacts p where p.policy_id=contact_key_rotations.policy_id and p.policy_principal_id=public.current_crypto_principal(workspace_id)));
create policy contact_grant_select_recipient on public.contact_recipient_grants for select to authenticated using(
  recipient_principal_id=public.current_crypto_principal(workspace_id));
grant select on public.contact_policy_artifacts,public.contact_field_states,public.contact_key_rotations,public.contact_recipient_grants to authenticated,service_role;
grant all on public.contact_policy_artifacts,public.contact_field_states,public.contact_key_rotations,public.contact_recipient_grants to service_role;
revoke insert,update,delete,truncate,references,trigger on public.contact_policy_artifacts,public.contact_field_states,public.contact_key_rotations,public.contact_recipient_grants from authenticated;
revoke all on function public.jsonb_opaque_id_array(jsonb) from public,anon,authenticated;
revoke all on function public.register_verified_contact_policy(text,uuid,text,text,public.private_field_class,text,uuid,public.contact_audience,jsonb,jsonb,jsonb,bigint,bigint,bigint,integer,text,text,jsonb,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.register_verified_contact_edit_authorization(text,uuid,text,text,public.private_field_class,bigint,bigint,bigint,integer,text,jsonb,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.begin_contact_key_rotation(uuid,text,text,public.private_field_class,text,integer,text,text) from public,anon;
revoke all on function public.complete_contact_key_rotation(uuid,text,bigint,jsonb,jsonb) from public,anon;
grant execute on function public.jsonb_opaque_id_array(jsonb) to service_role;
grant execute on function public.register_verified_contact_policy(text,uuid,text,text,public.private_field_class,text,uuid,public.contact_audience,jsonb,jsonb,jsonb,bigint,bigint,bigint,integer,text,text,jsonb,timestamptz,timestamptz) to service_role;
grant execute on function public.register_verified_contact_edit_authorization(text,uuid,text,text,public.private_field_class,bigint,bigint,bigint,integer,text,jsonb,timestamptz,timestamptz) to service_role;
grant execute on function public.begin_contact_key_rotation(uuid,text,text,public.private_field_class,text,integer,text,text) to authenticated;
grant execute on function public.complete_contact_key_rotation(uuid,text,bigint,jsonb,jsonb) to authenticated;

comment on table public.contact_policy_artifacts is 'CR-07 trusted-verifier accepted signed contact policies; opaque IDs and revisions only.';
comment on table public.contact_key_rotations is 'CR-07 fenced field-key rotation state machine; recipient contraction must complete a new epoch.';
