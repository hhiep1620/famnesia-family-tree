begin;
create extension if not exists pgtap with schema extensions;
select plan(35);
create function public.throws_ok(test_sql text,description text) returns text language sql as $$
  select regexp_replace(extensions.throws_ok(test_sql),'threw exception',description);
$$;
create function public.contact_private_bundle(principal text,u text,s text) returns jsonb language sql immutable as $$
select jsonb_build_object('format','famnesia-encrypted-private-key','version',1,'principalId',principal,'recoveryEpoch',1,'salt',repeat(u,43),
 'unwrapPublicKey',jsonb_build_object('kty','EC','crv','P-256','x',repeat(u,43),'y',repeat(u,43)),
 'signingPublicKey',jsonb_build_object('kty','EC','crv','P-256','x',repeat(s,43),'y',repeat(s,43)),
 'unwrapFingerprint','sha256:'||repeat(u,43),'signingFingerprint','sha256:'||repeat(s,43),
 'envelope',jsonb_build_object('version',1,'suite','FAMNESIA-P256-AESGCM-HKDF-SHA256-V1','nonce','ICEiIyQlJicoKSor','ciphertext',repeat('A',32),
 'aad',jsonb_build_object('workspaceId','principal','entityId',principal,'fieldClass','private-key-bundle','schemaVersion',1,
 'dataVersion',1,'keyId','recovery-kek-'||principal,'keyEpoch',1,'writerId','recovery-'||principal,'purpose','user-private-key-bundle')));
$$;
create function public.contact_content(entity_id text,field text,key_id text,epoch integer,data_version bigint,writer text,purpose text)
returns jsonb language sql immutable as $$ select jsonb_build_object('version',1,'suite','FAMNESIA-P256-AESGCM-HKDF-SHA256-V1',
 'nonce','ICEiIyQlJicoKSor','ciphertext',repeat('Z',32),'aad',jsonb_build_object('workspaceId','62000000-0000-4000-8000-000000000001',
 'entityId',entity_id,'fieldClass',field,'schemaVersion',1,'dataVersion',data_version,'keyId',key_id,'keyEpoch',epoch,'writerId',writer,'purpose',purpose)); $$;
create function public.contact_wrapped(envelope_id text,recipient text,fingerprint text,key_id text,epoch integer)
returns jsonb language sql immutable as $$ select jsonb_build_object('version',1,'suite','FAMNESIA-P256-AESGCM-HKDF-SHA256-V1',
 'context',jsonb_build_object('envelopeId',envelope_id,'workspaceId','62000000-0000-4000-8000-000000000001','entityId','person-subject',
 'recipientPrincipalId',recipient,'recipientKeyFingerprint',fingerprint,'keyId',key_id,'keyPurpose','contact','keyEpoch',epoch,
 'directoryRevision',1,'issuerPrincipalId','cp_aaaaaaaaaaaaaaaaaaaaaaaa','issuerSigningFingerprint','sha256:'||repeat('b',43),'expiresAt',2000000000),
 'ephemeralPublicKey',jsonb_build_object('kty','EC','crv','P-256'),'salt',repeat('A',43),'nonce','ICEiIyQlJicoKSor',
 'wrappedKey',repeat('A',64),'issuerSignature',repeat('A',86)); $$;
create function public.contact_policy_artifact(policy_id text,recipients jsonb,revision bigint,epoch integer)
returns jsonb language sql immutable as $$ select jsonb_build_object('version',1,'purpose','policy','signerPrincipalId','cp_aaaaaaaaaaaaaaaaaaaaaaaa',
 'signerKeyFingerprint','sha256:'||repeat('b',43),'payload',jsonb_build_object('policyId',policy_id,'recipientPrincipalIds',recipients,
 'policyRevision',revision,'keyEpoch',epoch),'signature',repeat('A',86)); $$;

insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at) values
 ('61000000-0000-4000-8000-000000000001','authenticated','authenticated','contact-owner@example.test',now(),now(),now()),
 ('61000000-0000-4000-8000-000000000002','authenticated','authenticated','contact-editor@example.test',now(),now(),now()),
 ('61000000-0000-4000-8000-000000000003','authenticated','authenticated','contact-viewer@example.test',now(),now(),now()),
 ('61000000-0000-4000-8000-000000000004','authenticated','authenticated','contact-excluded@example.test',now(),now(),now()),
 ('61000000-0000-4000-8000-000000000005','authenticated','authenticated','contact-outsider@example.test',now(),now(),now());
insert into public.workspaces(id,owner_user_id,name) values('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','Contact workspace');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','editor'),
 ('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000003','viewer'),
 ('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000004','viewer');
insert into public.encrypted_private_key_bundles(auth_user_id,principal_id,bundle,state,recovery_epoch,unwrap_fingerprint,signing_fingerprint) values
 ('61000000-0000-4000-8000-000000000001','cp_aaaaaaaaaaaaaaaaaaaaaaaa',public.contact_private_bundle('cp_aaaaaaaaaaaaaaaaaaaaaaaa','a','b'),'active',1,'sha256:'||repeat('a',43),'sha256:'||repeat('b',43)),
 ('61000000-0000-4000-8000-000000000002','cp_cccccccccccccccccccccccc',public.contact_private_bundle('cp_cccccccccccccccccccccccc','c','d'),'active',1,'sha256:'||repeat('c',43),'sha256:'||repeat('d',43)),
 ('61000000-0000-4000-8000-000000000003','cp_eeeeeeeeeeeeeeeeeeeeeeee',public.contact_private_bundle('cp_eeeeeeeeeeeeeeeeeeeeeeee','e','f'),'active',1,'sha256:'||repeat('e',43),'sha256:'||repeat('f',43)),
 ('61000000-0000-4000-8000-000000000004','cp_gggggggggggggggggggggggg',public.contact_private_bundle('cp_gggggggggggggggggggggggg','g','h'),'active',1,'sha256:'||repeat('g',43),'sha256:'||repeat('h',43));
insert into public.crypto_principals(principal_id,auth_user_id,unwrap_public_key,unwrap_fingerprint,signing_public_key,signing_fingerprint,recovery_epoch) values
 ('cp_aaaaaaaaaaaaaaaaaaaaaaaa','61000000-0000-4000-8000-000000000001','{"kty":"EC"}','sha256:'||repeat('a',43),'{"kty":"EC"}','sha256:'||repeat('b',43),1),
 ('cp_cccccccccccccccccccccccc','61000000-0000-4000-8000-000000000002','{"kty":"EC"}','sha256:'||repeat('c',43),'{"kty":"EC"}','sha256:'||repeat('d',43),1),
 ('cp_eeeeeeeeeeeeeeeeeeeeeeee','61000000-0000-4000-8000-000000000003','{"kty":"EC"}','sha256:'||repeat('e',43),'{"kty":"EC"}','sha256:'||repeat('f',43),1),
 ('cp_gggggggggggggggggggggggg','61000000-0000-4000-8000-000000000004','{"kty":"EC"}','sha256:'||repeat('g',43),'{"kty":"EC"}','sha256:'||repeat('h',43),1);
insert into public.workspace_crypto_states(workspace_id) values('62000000-0000-4000-8000-000000000001');
insert into public.workspace_principal_directory(workspace_id,principal_id,auth_user_id,directory_revision) values
 ('62000000-0000-4000-8000-000000000001','cp_aaaaaaaaaaaaaaaaaaaaaaaa','61000000-0000-4000-8000-000000000001',1),
 ('62000000-0000-4000-8000-000000000001','cp_cccccccccccccccccccccccc','61000000-0000-4000-8000-000000000002',1),
 ('62000000-0000-4000-8000-000000000001','cp_eeeeeeeeeeeeeeeeeeeeeeee','61000000-0000-4000-8000-000000000003',1),
 ('62000000-0000-4000-8000-000000000001','cp_gggggggggggggggggggggggg','61000000-0000-4000-8000-000000000004',1);
insert into public.encrypted_entities(workspace_id,entity_id,field_class,row_version,key_id,key_epoch,writer_principal_id,envelope) values
 ('62000000-0000-4000-8000-000000000001','profile-opaque','family_profile',1,'wk-contact',1,'cp_aaaaaaaaaaaaaaaaaaaaaaaa',public.contact_content('profile-opaque','family_profile','wk-contact',1,1,'cp_aaaaaaaaaaaaaaaaaaaaaaaa.tab.test','family-content')),
 ('62000000-0000-4000-8000-000000000001','person-subject','person_core',1,'wk-contact',1,'cp_aaaaaaaaaaaaaaaaaaaaaaaa',public.contact_content('person-subject','person_core','wk-contact',1,1,'cp_aaaaaaaaaaaaaaaaaaaaaaaa.tab.test','family-content'));
insert into public.member_person_bindings(binding_id,workspace_id,profile_id,person_id,principal_id,state,binding_version,pinned_unwrap_fingerprint,pinned_signing_fingerprint,proposed_by_principal_id,confirmed_by_principal_id,decided_at) values
 ('63000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','profile-opaque','person-subject','cp_aaaaaaaaaaaaaaaaaaaaaaaa','confirmed',1,'sha256:'||repeat('a',43),'sha256:'||repeat('b',43),'cp_aaaaaaaaaaaaaaaaaaaaaaaa','cp_aaaaaaaaaaaaaaaaaaaaaaaa',now()),
 ('63000000-0000-4000-8000-000000000002','62000000-0000-4000-8000-000000000001','profile-opaque','person-editor','cp_cccccccccccccccccccccccc','confirmed',1,'sha256:'||repeat('c',43),'sha256:'||repeat('d',43),'cp_cccccccccccccccccccccccc','cp_aaaaaaaaaaaaaaaaaaaaaaaa',now()),
 ('63000000-0000-4000-8000-000000000003','62000000-0000-4000-8000-000000000001','profile-opaque','person-viewer','cp_eeeeeeeeeeeeeeeeeeeeeeee','confirmed',1,'sha256:'||repeat('e',43),'sha256:'||repeat('f',43),'cp_eeeeeeeeeeeeeeeeeeeeeeee','cp_aaaaaaaaaaaaaaaaaaaaaaaa',now()),
 ('63000000-0000-4000-8000-000000000004','62000000-0000-4000-8000-000000000001','profile-opaque','person-cousin-spouse','cp_gggggggggggggggggggggggg','confirmed',1,'sha256:'||repeat('g',43),'sha256:'||repeat('h',43),'cp_gggggggggggggggggggggggg','cp_aaaaaaaaaaaaaaaaaaaaaaaa',now());

select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
 and c.relname in('contact_policy_artifacts','contact_field_states','contact_key_rotations','contact_recipient_grants') and c.relrowsecurity and c.relforcerowsecurity),4,'all contact policy tables force RLS');
select is_empty($$select table_name from information_schema.role_table_grants where table_schema='public' and grantee='authenticated'
 and table_name like 'contact_%' and privilege_type in('INSERT','UPDATE','DELETE')$$,'authenticated has no direct contact policy DML');
set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.register_verified_contact_policy('policy-auth-attack','62000000-0000-4000-8000-000000000001','profile-opaque','person-subject','phone','cp_aaaaaaaaaaaaaaaaaaaaaaaa','63000000-0000-4000-8000-000000000001','direct_family','[]','[]','["cp_aaaaaaaaaaaaaaaaaaaaaaaa"]',2,1,1,1,'sha256:'||repeat('b',43),'sha256:'||repeat('n',43),public.contact_policy_artifact('policy-auth-attack','[]',2,1),now(),now()+interval '1 hour')$$,'browser cannot mark its own policy verified');
set local role service_role; select set_config('request.jwt.claim.role','service_role',true);
select lives_ok($$select public.register_verified_contact_policy('policy-one','62000000-0000-4000-8000-000000000001','profile-opaque','person-subject','phone','cp_aaaaaaaaaaaaaaaaaaaaaaaa','63000000-0000-4000-8000-000000000001','direct_family','[]','[]','["cp_aaaaaaaaaaaaaaaaaaaaaaaa","cp_cccccccccccccccccccccccc","cp_eeeeeeeeeeeeeeeeeeeeeeee"]',2,1,1,1,'sha256:'||repeat('b',43),'sha256:'||repeat('n',43),public.contact_policy_artifact('policy-one','["cp_aaaaaaaaaaaaaaaaaaaaaaaa","cp_cccccccccccccccccccccccc","cp_eeeeeeeeeeeeeeeeeeeeeeee"]',2,1),now(),now()+interval '1 hour')$$,'trusted verifier registers signed policy metadata');
select is((select count(*)::integer from public.contact_policy_artifacts where policy_id='policy-one' and not active),1,'verified policy remains pending until encrypted rotation commits');
select throws_ok($$select public.register_verified_contact_policy('policy-unbound','62000000-0000-4000-8000-000000000001','profile-opaque','person-subject','phone','cp_aaaaaaaaaaaaaaaaaaaaaaaa','63000000-0000-4000-8000-000000000001','custom','[]','[]','["cp_unboundxxxxxxxxxxxxxxxxxxxx"]',3,1,1,1,'sha256:'||repeat('b',43),'sha256:'||repeat('u',43),public.contact_policy_artifact('policy-unbound','[]',3,1),now(),now()+interval '1 hour')$$,'unbound recipient cannot receive contact grant');
set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.begin_contact_key_rotation('62000000-0000-4000-8000-000000000001','rotation-one','person-subject','phone','policy-one',0,'contact-phone-1','hmac-sha256:'||repeat('m',43))$$,'policy principal begins initial field-key rotation');
select is((select lifecycle::text from public.contact_field_states where person_id='person-subject' and field_class='phone'),'rotating','field is fenced while rotation is prepared');
select throws_ok($$select public.complete_contact_key_rotation('62000000-0000-4000-8000-000000000001','rotation-one',1,
 public.contact_content('person-subject','phone','contact-phone-1',1,2,'cp_aaaaaaaaaaaaaaaaaaaaaaaa.tab.rotation','contact'),jsonb_build_array(public.contact_wrapped('env-owner-1','cp_aaaaaaaaaaaaaaaaaaaaaaaa','sha256:'||repeat('a',43),'contact-phone-1',1)))$$,'missing recipient envelope aborts complete rotation');
select lives_ok($$select public.complete_contact_key_rotation('62000000-0000-4000-8000-000000000001','rotation-one',1,
 public.contact_content('person-subject','phone','contact-phone-1',1,2,'cp_aaaaaaaaaaaaaaaaaaaaaaaa.tab.rotation','contact'),jsonb_build_array(
 public.contact_wrapped('env-owner-1','cp_aaaaaaaaaaaaaaaaaaaaaaaa','sha256:'||repeat('a',43),'contact-phone-1',1),public.contact_wrapped('env-editor-1','cp_cccccccccccccccccccccccc','sha256:'||repeat('c',43),'contact-phone-1',1),public.contact_wrapped('env-viewer-1','cp_eeeeeeeeeeeeeeeeeeeeeeee','sha256:'||repeat('e',43),'contact-phone-1',1)))$$,'complete rotation switches ciphertext and all recipient envelopes atomically');
select is((select key_epoch from public.contact_field_states where person_id='person-subject' and field_class='phone'),1,'initial contact key epoch is active');
select is((select count(*)::integer from public.contact_policy_artifacts where policy_id='policy-one' and active),1,'policy activates only with ciphertext rotation');
select is((select count(*)::integer from public.contact_recipient_grants where revoked_at is null),1,'recipient RLS exposes only the owner grant to the owner');
select is((select count(*)::integer from public.contact_recipient_grants where recipient_principal_id='cp_gggggggggggggggggggggggg'),0,'cousin spouse fixture receives no default grant');
select ok(position('0900000000' in (select envelope::text from public.encrypted_private_fields where person_id='person-subject'))=0,'contact ciphertext row contains no phone plaintext');
set local role service_role; select set_config('request.jwt.claim.role','service_role',true);
select lives_ok($$select public.register_verified_contact_policy('policy-two','62000000-0000-4000-8000-000000000001','profile-opaque','person-subject','phone','cp_aaaaaaaaaaaaaaaaaaaaaaaa','63000000-0000-4000-8000-000000000001','custom','[]','["cp_eeeeeeeeeeeeeeeeeeeeeeee"]','["cp_aaaaaaaaaaaaaaaaaaaaaaaa","cp_cccccccccccccccccccccccc"]',3,1,1,2,'sha256:'||repeat('b',43),'sha256:'||repeat('o',43),public.contact_policy_artifact('policy-two','["cp_aaaaaaaaaaaaaaaaaaaaaaaa","cp_cccccccccccccccccccccccc"]',3,2),now(),now()+interval '1 hour')$$,'trusted verifier registers contraction policy');
select is((select count(*)::integer from public.contact_policy_artifacts where policy_id='policy-one' and active),1,'old audience remains canonical until replacement ciphertext is ready');
set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.begin_contact_key_rotation('62000000-0000-4000-8000-000000000001','rotation-two','person-subject','phone','policy-two',1,'contact-phone-2','hmac-sha256:'||repeat('r',43))$$,'recipient contraction requires next key epoch');
select lives_ok($$select public.complete_contact_key_rotation('62000000-0000-4000-8000-000000000001','rotation-two',2,
 public.contact_content('person-subject','phone','contact-phone-2',2,3,'cp_aaaaaaaaaaaaaaaaaaaaaaaa.tab.rotation','contact'),jsonb_build_array(
 public.contact_wrapped('env-owner-2','cp_aaaaaaaaaaaaaaaaaaaaaaaa','sha256:'||repeat('a',43),'contact-phone-2',2),public.contact_wrapped('env-editor-2','cp_cccccccccccccccccccccccc','sha256:'||repeat('c',43),'contact-phone-2',2)))$$,'contraction rotates and re-encrypts before activation');
set local role service_role; select set_config('request.jwt.claim.role','service_role',true);
select is((select count(*)::integer from public.contact_recipient_grants where key_epoch=1 and revoked_at is not null),3,'all old grants are revoked after switch');
select is((select count(*)::integer from public.contact_recipient_grants where key_epoch=2 and revoked_at is null),2,'new epoch has only retained recipients');
set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000003',true);
select is((select count(*)::integer from public.encrypted_key_envelopes),0,'removed recipient cannot read revoked wrapped key through RLS');
select is((select count(*)::integer from public.contact_recipient_grants),0,'removed recipient cannot read revoked grant through RLS');
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
select is((select key_epoch from public.contact_field_states where person_id='person-subject' and field_class='phone'),2,'contact field advances to new epoch');
select lives_ok($$select public.complete_contact_key_rotation('62000000-0000-4000-8000-000000000001','rotation-two',2,'{}','[]')$$,'completed rotation retry returns stored result');
select is((select count(*)::integer from public.contact_key_rotations where state='complete'),2,'resume leaves exactly two completed rotations');
select throws_ok($$select public.register_verified_contact_edit_authorization('auth-browser','62000000-0000-4000-8000-000000000001','cp_cccccccccccccccccccccccc','person-subject','phone',3,1,1,2,'sha256:'||repeat('x',43),public.contact_policy_artifact('edit','[]',3,2),now(),now()+interval '5 minutes')$$,'browser cannot self-register edit authorization');
set local role service_role; select set_config('request.jwt.claim.role','service_role',true);
select lives_ok($$select public.register_verified_contact_edit_authorization('auth-editor-phone','62000000-0000-4000-8000-000000000001','cp_cccccccccccccccccccccccc','person-subject','phone',3,1,1,2,'sha256:'||repeat('x',43),public.contact_policy_artifact('edit','[]',3,2),now(),now()+interval '5 minutes')$$,'trusted verifier registers exact short-lived edit scope');
set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.commit_contact_field_write('62000000-0000-4000-8000-000000000001','missing-auth',3,'person-subject','phone',3,'does-not-exist','contact-phone-2',2,public.contact_content('person-subject','phone','contact-phone-2',2,4,'cp_cccccccccccccccccccccccc.tab.edit','contact'),false)$$,'view grant alone cannot edit contact');
select throws_ok($$select public.commit_contact_field_write('62000000-0000-4000-8000-000000000001','wrong-field',3,'person-subject','address',0,'auth-editor-phone','contact-phone-2',2,public.contact_content('person-subject','address','contact-phone-2',2,4,'cp_cccccccccccccccccccccccc.tab.edit','contact'),false)$$,'phone edit authorization cannot target address or bundle');
select lives_ok($$select public.commit_contact_field_write('62000000-0000-4000-8000-000000000001','exact-phone-write',3,'person-subject','phone',3,'auth-editor-phone','contact-phone-2',2,public.contact_content('person-subject','phone','contact-phone-2',2,4,'cp_cccccccccccccccccccccccc.tab.edit','contact'),false)$$,'exact field authorization writes ciphertext');
select is((select data_version::integer from public.workspace_crypto_states where workspace_id='62000000-0000-4000-8000-000000000001'),4,'authorized contact edit increments data revision');
select throws_ok($$select public.commit_contact_field_write('62000000-0000-4000-8000-000000000001','phone-replay',4,'person-subject','phone',4,'auth-editor-phone','contact-phone-2',2,public.contact_content('person-subject','phone','contact-phone-2',2,5,'cp_cccccccccccccccccccccccc.tab.edit','contact'),false)$$,'one-time edit authorization cannot replay');
set local role service_role; select set_config('request.jwt.claim.role','service_role',true);
select throws_ok($$select public.register_verified_contact_edit_authorization('auth-expired','62000000-0000-4000-8000-000000000001','cp_cccccccccccccccccccccccc','person-subject','phone',3,1,1,2,'sha256:'||repeat('y',43),public.contact_policy_artifact('edit-expired','[]',3,2),now(),now()-interval '1 minute')$$,'expired edit authorization is rejected');
set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000005',true);
select throws_ok($$select public.begin_contact_key_rotation('62000000-0000-4000-8000-000000000001','outsider-rotation','person-subject','phone','policy-two',2,'attack-key','hmac-sha256:'||repeat('z',43))$$,'outsider cannot rotate contact key');
select * from finish(); rollback;
