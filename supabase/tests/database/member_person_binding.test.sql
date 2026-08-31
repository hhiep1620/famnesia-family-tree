begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

create function public.throws_ok(test_sql text, description text)
returns text language sql as $$
  select regexp_replace(extensions.throws_ok(test_sql), 'threw exception', description);
$$;

create function public.binding_private_bundle(principal text, unwrap_char text, signing_char text)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'format','famnesia-encrypted-private-key','version',1,'principalId',principal,'recoveryEpoch',1,'salt',repeat(unwrap_char,43),
    'unwrapPublicKey',jsonb_build_object('kty','EC','crv','P-256','x',repeat(unwrap_char,43),'y',repeat(unwrap_char,43)),
    'signingPublicKey',jsonb_build_object('kty','EC','crv','P-256','x',repeat(signing_char,43),'y',repeat(signing_char,43)),
    'unwrapFingerprint','sha256:'||repeat(unwrap_char,43),'signingFingerprint','sha256:'||repeat(signing_char,43),
    'envelope',jsonb_build_object('version',1,'suite','FAMNESIA-P256-AESGCM-HKDF-SHA256-V1','nonce','ICEiIyQlJicoKSor','ciphertext',repeat('A',32),
      'aad',jsonb_build_object('workspaceId','principal','entityId',principal,'fieldClass','private-key-bundle','schemaVersion',1,
        'dataVersion',1,'keyId','recovery-kek-'||principal,'keyEpoch',1,'writerId','recovery-'||principal,'purpose','user-private-key-bundle'))
  );
$$;

create function public.binding_content_envelope(entity_id text, entity_class text)
returns jsonb language sql immutable as $$
  select jsonb_build_object('version',1,'suite','FAMNESIA-P256-AESGCM-HKDF-SHA256-V1','nonce','ICEiIyQlJicoKSor','ciphertext',repeat('A',32),
    'aad',jsonb_build_object('workspaceId','52000000-0000-4000-8000-000000000001','entityId',entity_id,'fieldClass',entity_class,
      'schemaVersion',1,'dataVersion',1,'keyId','wk-binding-1','keyEpoch',1,'writerId','cp_aaaaaaaaaaaaaaaaaaaaaaaa.tab.binding','purpose','family-content'));
$$;

insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at) values
  ('51000000-0000-4000-8000-000000000001','authenticated','authenticated','binding-owner@example.test',now(),now(),now()),
  ('51000000-0000-4000-8000-000000000002','authenticated','authenticated','binding-member@example.test',now(),now(),now()),
  ('51000000-0000-4000-8000-000000000003','authenticated','authenticated','binding-outsider@example.test',now(),now(),now());
insert into public.workspaces(id,owner_user_id,name) values('52000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','Binding workspace');
insert into public.workspace_members(workspace_id,user_id,role) values
  ('52000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002','viewer');
insert into public.encrypted_private_key_bundles(auth_user_id,principal_id,bundle,state,recovery_epoch,unwrap_fingerprint,signing_fingerprint) values
  ('51000000-0000-4000-8000-000000000001','cp_aaaaaaaaaaaaaaaaaaaaaaaa',public.binding_private_bundle('cp_aaaaaaaaaaaaaaaaaaaaaaaa','a','b'),'active',1,'sha256:'||repeat('a',43),'sha256:'||repeat('b',43)),
  ('51000000-0000-4000-8000-000000000002','cp_cccccccccccccccccccccccc',public.binding_private_bundle('cp_cccccccccccccccccccccccc','c','d'),'active',1,'sha256:'||repeat('c',43),'sha256:'||repeat('d',43));
insert into public.crypto_principals(principal_id,auth_user_id,unwrap_public_key,unwrap_fingerprint,signing_public_key,signing_fingerprint,recovery_epoch) values
  ('cp_aaaaaaaaaaaaaaaaaaaaaaaa','51000000-0000-4000-8000-000000000001','{"kty":"EC"}','sha256:'||repeat('a',43),'{"kty":"EC"}','sha256:'||repeat('b',43),1),
  ('cp_cccccccccccccccccccccccc','51000000-0000-4000-8000-000000000002','{"kty":"EC"}','sha256:'||repeat('c',43),'{"kty":"EC"}','sha256:'||repeat('d',43),1);
insert into public.workspace_crypto_states(workspace_id) values('52000000-0000-4000-8000-000000000001');
insert into public.workspace_principal_directory(workspace_id,principal_id,auth_user_id,directory_revision) values
  ('52000000-0000-4000-8000-000000000001','cp_aaaaaaaaaaaaaaaaaaaaaaaa','51000000-0000-4000-8000-000000000001',1),
  ('52000000-0000-4000-8000-000000000001','cp_cccccccccccccccccccccccc','51000000-0000-4000-8000-000000000002',1);
insert into public.encrypted_entities(workspace_id,entity_id,field_class,row_version,key_id,key_epoch,writer_principal_id,envelope) values
  ('52000000-0000-4000-8000-000000000001','profile-opaque','family_profile',1,'wk-binding-1',1,'cp_aaaaaaaaaaaaaaaaaaaaaaaa',public.binding_content_envelope('profile-opaque','family_profile')),
  ('52000000-0000-4000-8000-000000000001','person-one','person_core',1,'wk-binding-1',1,'cp_aaaaaaaaaaaaaaaaaaaaaaaa',public.binding_content_envelope('person-one','person_core')),
  ('52000000-0000-4000-8000-000000000001','person-two','person_core',1,'wk-binding-1',1,'cp_aaaaaaaaaaaaaaaaaaaaaaaa',public.binding_content_envelope('person-two','person_core'));

select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
  and c.relname in('member_person_bindings','member_binding_events') and c.relrowsecurity and c.relforcerowsecurity),2,'binding tables force RLS');
select is_empty($$select table_name from information_schema.role_table_grants where table_schema='public' and grantee='authenticated'
  and table_name in('member_person_bindings','member_binding_events') and privilege_type in('INSERT','UPDATE','DELETE')$$,'authenticated has no direct binding DML');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','51000000-0000-4000-8000-000000000002',true);
select lives_ok($$select public.propose_member_person_binding('52000000-0000-4000-8000-000000000001','proposal-one','profile-opaque','person-one')$$,'member proposes self binding');
select is((select count(*)::integer from public.member_person_bindings where state='pending'),1,'proposal remains pending and grants nothing');
select throws_ok($$insert into public.member_person_bindings(workspace_id,profile_id,person_id,principal_id,proposed_by_principal_id)
  values('52000000-0000-4000-8000-000000000001','profile-opaque','person-two','cp_cccccccccccccccccccccccc','cp_cccccccccccccccccccccccc')$$,
  'member cannot bypass binding RPC');
select throws_ok($$select public.decide_member_person_binding('52000000-0000-4000-8000-000000000001','member-confirm',
  (select binding_id from public.member_person_bindings where person_id='person-one'),'confirm',1)$$,'viewer cannot self-confirm');
select throws_ok($$select public.propose_member_person_binding('52000000-0000-4000-8000-000000000001','missing-target','wrong-profile','person-one')$$,
  'cross-profile or missing encrypted target is denied');

select set_config('request.jwt.claim.sub','51000000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.decide_member_person_binding('52000000-0000-4000-8000-000000000001','owner-confirm-one',
  (select binding_id from public.member_person_bindings where person_id='person-one'),'confirm',1)$$,'owner confirms pending binding');
select is((select count(*)::integer from public.member_person_bindings where state='confirmed'),1,'one binding is confirmed');
select is((select binding_revision::integer from public.workspace_crypto_states where workspace_id='52000000-0000-4000-8000-000000000001'),2,'confirm increments binding revision');
select ok((select pinned_unwrap_fingerprint='sha256:'||repeat('c',43) and pinned_signing_fingerprint='sha256:'||repeat('d',43)
  from public.member_person_bindings where state='confirmed'),'confirmation pins directory fingerprints');
select lives_ok($$select public.decide_member_person_binding('52000000-0000-4000-8000-000000000001','owner-confirm-one',
  (select binding_id from public.member_person_bindings where person_id='person-one'),'confirm',1)$$,'identical owner retry is idempotent');
select is((select count(*)::integer from public.member_binding_events where transition_id='owner-confirm-one'),1,'idempotent retry creates one audit event');

select set_config('request.jwt.claim.sub','51000000-0000-4000-8000-000000000002',true);
select lives_ok($$select public.propose_member_person_binding('52000000-0000-4000-8000-000000000001','proposal-rebind','profile-opaque','person-two')$$,'member proposes reviewed rebind');
select set_config('request.jwt.claim.sub','51000000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.decide_member_person_binding('52000000-0000-4000-8000-000000000001','owner-confirm-rebind',
  (select binding_id from public.member_person_bindings where person_id='person-two'),'confirm',2)$$,'owner confirms rebind atomically');
select results_eq($$select state::text from public.member_person_bindings order by person_id$$,
  $$select unnest(array['superseded'::text,'confirmed'::text])$$,'rebind supersedes old identity and confirms new identity');
select is((select binding_revision::integer from public.workspace_crypto_states where workspace_id='52000000-0000-4000-8000-000000000001'),3,'rebind increments binding revision');
select throws_ok($$select public.decide_member_person_binding('52000000-0000-4000-8000-000000000001','stale-revoke',
  (select binding_id from public.member_person_bindings where state='confirmed'),'revoke',2)$$,'stale binding revision is denied');
select lives_ok($$select public.decide_member_person_binding('52000000-0000-4000-8000-000000000001','owner-revoke',
  (select binding_id from public.member_person_bindings where state='confirmed'),'revoke',3)$$,'owner revokes active binding');
select is((select binding_revision::integer from public.workspace_crypto_states where workspace_id='52000000-0000-4000-8000-000000000001'),4,'revoke increments binding revision');
select is((select count(*)::integer from public.member_person_bindings where state='confirmed'),0,'revoked member has no active binding');
select set_config('request.jwt.claim.sub','51000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.propose_member_person_binding('52000000-0000-4000-8000-000000000001','outsider-claim','profile-opaque','person-one')$$,
  'outsider cannot claim into another workspace');

select * from finish();
rollback;
