begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

create function public.throws_ok(test_sql text, description text)
returns text language sql as $$
  select regexp_replace(extensions.throws_ok(test_sql), 'threw exception', description);
$$;

create function public.test_private_bundle(principal text, unwrap_char text, signing_char text)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'format', 'famnesia-encrypted-private-key', 'version', 1, 'principalId', principal,
    'recoveryEpoch', 1, 'salt', repeat(unwrap_char, 43),
    'unwrapPublicKey', jsonb_build_object('kty', 'EC', 'crv', 'P-256', 'x', repeat(unwrap_char, 43), 'y', repeat(unwrap_char, 43)),
    'signingPublicKey', jsonb_build_object('kty', 'EC', 'crv', 'P-256', 'x', repeat(signing_char, 43), 'y', repeat(signing_char, 43)),
    'unwrapFingerprint', 'sha256:' || repeat(unwrap_char, 43),
    'signingFingerprint', 'sha256:' || repeat(signing_char, 43),
    'envelope', jsonb_build_object(
      'version', 1, 'suite', 'FAMNESIA-P256-AESGCM-HKDF-SHA256-V1',
      'nonce', 'ICEiIyQlJicoKSor', 'ciphertext', repeat('A', 32),
      'aad', jsonb_build_object(
        'workspaceId', 'principal', 'entityId', principal, 'fieldClass', 'private-key-bundle',
        'schemaVersion', 1, 'dataVersion', 1, 'keyId', 'recovery-kek-' || principal,
        'keyEpoch', 1, 'writerId', 'recovery-' || principal, 'purpose', 'user-private-key-bundle'
      )
    )
  );
$$;

insert into auth.users(id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('41000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'crypto-owner@example.test', now(), now(), now()),
  ('41000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'crypto-editor@example.test', now(), now(), now()),
  ('41000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'crypto-viewer@example.test', now(), now(), now()),
  ('41000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'crypto-outsider@example.test', now(), now(), now()),
  ('41000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'crypto-contributor@example.test', now(), now(), now());

insert into public.workspaces(id, owner_user_id, name)
values ('42000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', 'Encrypted workspace');
insert into public.workspace_members(workspace_id, user_id, role) values
  ('42000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000002', 'editor'),
  ('42000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000003', 'viewer'),
  ('42000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000005', 'contributor');

insert into public.encrypted_private_key_bundles(auth_user_id, principal_id, bundle, state, recovery_epoch, unwrap_fingerprint, signing_fingerprint) values
  ('41000000-0000-4000-8000-000000000001', 'cp_aaaaaaaaaaaaaaaaaaaaaaaa', public.test_private_bundle('cp_aaaaaaaaaaaaaaaaaaaaaaaa', 'a', 'b'), 'active', 1, 'sha256:' || repeat('a',43), 'sha256:' || repeat('b',43)),
  ('41000000-0000-4000-8000-000000000002', 'cp_cccccccccccccccccccccccc', public.test_private_bundle('cp_cccccccccccccccccccccccc', 'c', 'd'), 'active', 1, 'sha256:' || repeat('c',43), 'sha256:' || repeat('d',43)),
  ('41000000-0000-4000-8000-000000000003', 'cp_eeeeeeeeeeeeeeeeeeeeeeee', public.test_private_bundle('cp_eeeeeeeeeeeeeeeeeeeeeeee', 'e', 'f'), 'active', 1, 'sha256:' || repeat('e',43), 'sha256:' || repeat('f',43));

insert into public.crypto_principals(principal_id, auth_user_id, unwrap_public_key, unwrap_fingerprint, signing_public_key, signing_fingerprint, recovery_epoch) values
  ('cp_aaaaaaaaaaaaaaaaaaaaaaaa', '41000000-0000-4000-8000-000000000001', '{"kty":"EC"}', 'sha256:' || repeat('a',43), '{"kty":"EC"}', 'sha256:' || repeat('b',43), 1),
  ('cp_cccccccccccccccccccccccc', '41000000-0000-4000-8000-000000000002', '{"kty":"EC"}', 'sha256:' || repeat('c',43), '{"kty":"EC"}', 'sha256:' || repeat('d',43), 1),
  ('cp_eeeeeeeeeeeeeeeeeeeeeeee', '41000000-0000-4000-8000-000000000003', '{"kty":"EC"}', 'sha256:' || repeat('e',43), '{"kty":"EC"}', 'sha256:' || repeat('f',43), 1);
insert into public.workspace_crypto_states(workspace_id) values ('42000000-0000-4000-8000-000000000001');
insert into public.workspace_principal_directory(workspace_id, principal_id, auth_user_id, directory_revision) values
  ('42000000-0000-4000-8000-000000000001', 'cp_aaaaaaaaaaaaaaaaaaaaaaaa', '41000000-0000-4000-8000-000000000001', 1),
  ('42000000-0000-4000-8000-000000000001', 'cp_cccccccccccccccccccccccc', '41000000-0000-4000-8000-000000000002', 1),
  ('42000000-0000-4000-8000-000000000001', 'cp_eeeeeeeeeeeeeeeeeeeeeeee', '41000000-0000-4000-8000-000000000003', 1);

insert into public.encrypted_entities(workspace_id, entity_id, field_class, row_version, key_id, key_epoch, writer_principal_id, envelope)
values ('42000000-0000-4000-8000-000000000001', 'person-1', 'person_core', 1, 'wk-family-1', 1, 'cp_aaaaaaaaaaaaaaaaaaaaaaaa',
  jsonb_build_object('version',1,'suite','FAMNESIA-P256-AESGCM-HKDF-SHA256-V1','nonce','ICEiIyQlJicoKSor','ciphertext',repeat('A',32),
    'aad',jsonb_build_object('workspaceId','42000000-0000-4000-8000-000000000001','entityId','person-1','fieldClass','person_core',
      'schemaVersion',1,'dataVersion',1,'keyId','wk-family-1','keyEpoch',1,'writerId','cp_aaaaaaaaaaaaaaaaaaaaaaaa','purpose','family-content')));

insert into public.encrypted_key_envelopes(workspace_id, envelope_id, entity_id, key_id, key_purpose, key_epoch, directory_revision,
  recipient_principal_id, recipient_unwrap_fingerprint, issuer_principal_id, issuer_signing_fingerprint, wrapped_envelope, expires_at)
select '42000000-0000-4000-8000-000000000001', 'env-' || recipient_suffix, 'workspace-root', 'wk-family-1', 'workspace', 1, 1,
  recipient_id, recipient_fingerprint, 'cp_aaaaaaaaaaaaaaaaaaaaaaaa', 'sha256:' || repeat('b',43),
  jsonb_build_object('version',1,'suite','FAMNESIA-P256-AESGCM-HKDF-SHA256-V1',
    'context',jsonb_build_object('envelopeId','env-' || recipient_suffix,'workspaceId','42000000-0000-4000-8000-000000000001',
      'entityId','workspace-root','recipientPrincipalId',recipient_id,'recipientKeyFingerprint',recipient_fingerprint,
      'keyId','wk-family-1','keyPurpose','workspace','keyEpoch',1,'directoryRevision',1,
      'issuerPrincipalId','cp_aaaaaaaaaaaaaaaaaaaaaaaa','issuerSigningFingerprint','sha256:' || repeat('b',43),'expiresAt',1900000000),
    'ephemeralPublicKey','{"kty":"EC","crv":"P-256"}'::jsonb,'salt',repeat('A',43),'nonce','ICEiIyQlJicoKSor',
    'wrappedKey',repeat('A',64),'issuerSignature',repeat('A',86)), to_timestamp(1900000000)
from (values
  ('editor', 'cp_cccccccccccccccccccccccc', 'sha256:' || repeat('c',43)),
  ('viewer', 'cp_eeeeeeeeeeeeeeeeeeeeeeee', 'sha256:' || repeat('e',43))
) recipients(recipient_suffix, recipient_id, recipient_fingerprint);

select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('crypto_principals','workspace_crypto_states','workspace_principal_directory',
  'encrypted_entities','encrypted_private_fields','encrypted_key_envelopes','signed_policy_authorizations','authorization_nonce_ledger',
  'crypto_invitations','opaque_backup_capabilities','opaque_backup_audit','encrypted_commits') and c.relrowsecurity and c.relforcerowsecurity), 12,
  'all CR-04 tables enable and force RLS');
select is_empty($$select table_name from information_schema.role_table_grants where table_schema='public' and grantee='authenticated'
  and table_name in ('encrypted_entities','encrypted_private_fields','encrypted_key_envelopes','encrypted_commits')
  and privilege_type in ('INSERT','UPDATE','DELETE')$$, 'authenticated has no direct CR-04 encrypted DML grants');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from public.encrypted_entities), 1, 'owner reads workspace ciphertext');
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.encrypted_entities), 1, 'editor reads workspace ciphertext');
select is((select count(*)::integer from public.encrypted_key_envelopes), 1, 'recipient A reads only its wrapped key');
select is_empty($$select envelope_id from public.encrypted_key_envelopes where envelope_id='env-viewer'$$, 'recipient A cannot read recipient B wrapped key');
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000003',true);
select is((select count(*)::integer from public.encrypted_entities), 1, 'viewer reads workspace ciphertext');
select is((select count(*)::integer from public.encrypted_key_envelopes), 1, 'recipient B reads only its wrapped key');
select throws_ok($$insert into public.encrypted_entities(workspace_id,entity_id,field_class,row_version,key_id,key_epoch,writer_principal_id,envelope)
  values('42000000-0000-4000-8000-000000000001','attack','person_core',1,'wk-family-1',1,'cp_eeeeeeeeeeeeeeeeeeeeeeee','{}')$$,
  'viewer has no direct encrypted write privilege');
select throws_ok($$select public.commit_encrypted_workspace('42000000-0000-4000-8000-000000000001','viewer-commit','sha256:'||repeat('v',43),1,1,'[{"type":"entity_delete","entityId":"person-1","fieldClass":"person_core","expectedRowVersion":1}]')$$,
  'viewer cannot call encrypted commit');
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000004',true);
select is_empty($$select entity_id from public.encrypted_entities$$, 'outsider reads no ciphertext');
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000005',true);
select throws_ok($$select public.commit_encrypted_workspace('42000000-0000-4000-8000-000000000001','contributor-commit','sha256:'||repeat('q',43),1,1,'[{"type":"entity_delete","entityId":"person-1","fieldClass":"person_core","expectedRowVersion":1}]')$$,
  'legacy contributor is denied direct encrypted commit');
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.commit_encrypted_workspace('42000000-0000-4000-8000-000000000001','stale-commit','sha256:'||repeat('s',43),1,2,'[{"type":"entity_delete","entityId":"person-1","fieldClass":"person_core","expectedRowVersion":1}]')$$,
  'stale key epoch fails closed');
select throws_ok($$select public.commit_encrypted_workspace('42000000-0000-4000-8000-000000000001','cross-workspace','sha256:'||repeat('w',43),1,1,
  jsonb_build_array(jsonb_build_object('type','entity_upsert','entityId','person-2','fieldClass','person_core','expectedRowVersion',0,
    'keyId','wk-family-1','keyEpoch',1,'envelope',jsonb_build_object('version',1,'suite','FAMNESIA-P256-AESGCM-HKDF-SHA256-V1',
      'nonce','ICEiIyQlJicoKSor','ciphertext',repeat('A',32),'aad',jsonb_build_object('workspaceId','42000000-0000-4000-8000-000000000099',
      'entityId','person-2','fieldClass','person_core','schemaVersion',1,'dataVersion',2,'keyId','wk-family-1','keyEpoch',1,
      'writerId','cp_cccccccccccccccccccccccc','purpose','family-content')))))$$,
  'cross-workspace AAD substitution fails before commit');
select throws_ok($$select public.commit_encrypted_workspace('42000000-0000-4000-8000-000000000001','recipient-key-attack','sha256:'||repeat('k',43),1,1,
  jsonb_build_array(jsonb_build_object('type','key_envelope_insert','wrappedEnvelope',
    jsonb_set(jsonb_set(jsonb_set(jsonb_set((select wrapped_envelope from public.encrypted_key_envelopes where envelope_id='env-viewer'),
      '{context,envelopeId}','"env-key-attack"'),'{context,recipientKeyFingerprint}',to_jsonb('sha256:'||repeat('z',43))),
      '{context,issuerPrincipalId}','"cp_cccccccccccccccccccccccc"'),'{context,issuerSigningFingerprint}',to_jsonb('sha256:'||repeat('d',43))))))$$,
  'recipient public-key substitution fails closed');
select throws_ok($$select public.commit_encrypted_workspace('42000000-0000-4000-8000-000000000001','directory-replay','sha256:'||repeat('d',43),1,1,
  jsonb_build_array(jsonb_build_object('type','key_envelope_insert','wrappedEnvelope',
    jsonb_set(jsonb_set(jsonb_set(jsonb_set((select wrapped_envelope from public.encrypted_key_envelopes where envelope_id='env-viewer'),
      '{context,envelopeId}','"env-directory-replay"'),'{context,directoryRevision}','2'),
      '{context,issuerPrincipalId}','"cp_cccccccccccccccccccccccc"'),'{context,issuerSigningFingerprint}',to_jsonb('sha256:'||repeat('d',43))))))$$,
  'stale directory revision fails closed');
reset role;

insert into public.signed_policy_authorizations(authorization_id,workspace_id,actor_principal_id,person_id,field_class,purpose,
  policy_revision,graph_revision,binding_revision,key_epoch,nonce_hash,artifact,verified_at,expires_at)
values('auth-phone','42000000-0000-4000-8000-000000000001','cp_cccccccccccccccccccccccc','person-1','phone','contact_edit',
  1,1,1,1,'sha256:'||repeat('n',43),'{}',now(),now()+interval '5 minutes');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.commit_encrypted_workspace('42000000-0000-4000-8000-000000000001','scope-attack','sha256:'||repeat('x',43),1,1,
  '[{"type":"private_delete","personId":"person-1","fieldClass":"address","expectedRowVersion":1,"authorizationId":"auth-phone"}]')$$,
  'phone authorization cannot mutate address');
select lives_ok($$select public.commit_encrypted_workspace('42000000-0000-4000-8000-000000000001','phone-write','sha256:'||repeat('p',43),1,1,
  jsonb_build_array(jsonb_build_object('type','private_upsert','personId','person-1','fieldClass','phone','expectedRowVersion',0,
    'keyId','ck-person-1-phone','keyEpoch',1,'authorizationId','auth-phone',
    'envelope',jsonb_build_object('version',1,'suite','FAMNESIA-P256-AESGCM-HKDF-SHA256-V1','nonce','ICEiIyQlJicoKSor',
      'ciphertext',repeat('A',32),'aad',jsonb_build_object('workspaceId','42000000-0000-4000-8000-000000000001',
      'entityId','person-1','fieldClass','phone','schemaVersion',1,'dataVersion',2,'keyId','ck-person-1-phone','keyEpoch',1,
      'writerId','cp_cccccccccccccccccccccccc','purpose','contact')))))$$,
  'matching contact authorization commits one field atomically');
select throws_ok($$select public.commit_encrypted_workspace('42000000-0000-4000-8000-000000000001','phone-replay','sha256:'||repeat('r',43),2,1,
  '[{"type":"private_delete","personId":"person-1","fieldClass":"phone","expectedRowVersion":2,"authorizationId":"auth-phone"}]')$$,
  'consumed contact authorization cannot replay');
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select lives_ok($$select public.mint_opaque_backup_capability('42000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001', 'sha256:'||translate(rtrim(encode(extensions.digest(convert_to('backup-secret','UTF8'),'sha256'),'base64'),'='),'+/','-_'),
  now(), now()+interval '5 minutes')$$, 'trusted service can mint a short-lived backup capability');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000001',true);
select is(jsonb_array_length(public.export_opaque_workspace_backup('42000000-0000-4000-8000-000000000001','backup-secret')->'backup'->'keyEnvelopes'), 2,
  'opaque owner backup preserves envelopes for all recipients');
select is(public.export_opaque_workspace_backup('42000000-0000-4000-8000-000000000001','backup-secret')->>'error', 'INVALID_OR_EXPIRED_CAPABILITY',
  'backup capability is single use');

select * from finish();
rollback;
