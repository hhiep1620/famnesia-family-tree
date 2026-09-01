begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

create function public.throws_ok(test_sql text, description text)
returns text language sql as $$select regexp_replace(extensions.throws_ok(test_sql),'threw exception',description)$$;
create function public.cr08_bundle(principal text,u text,s text)
returns jsonb language sql immutable as $$
  select jsonb_build_object('format','famnesia-encrypted-private-key','version',1,'principalId',principal,
    'recoveryEpoch',1,'salt',repeat(u,43),'unwrapPublicKey',jsonb_build_object('kty','EC'),
    'signingPublicKey',jsonb_build_object('kty','EC'),'unwrapFingerprint','sha256:'||repeat(u,43),
    'signingFingerprint','sha256:'||repeat(s,43),'envelope',jsonb_build_object(
      'version',1,'suite','FAMNESIA-P256-AESGCM-HKDF-SHA256-V1','nonce','ICEiIyQlJicoKSor','ciphertext',repeat('A',32),
      'aad',jsonb_build_object('workspaceId','principal','entityId',principal,'fieldClass','private-key-bundle',
        'schemaVersion',1,'dataVersion',1,'keyId','recovery-kek-'||principal,'keyEpoch',1,
        'writerId','recovery-'||principal,'purpose','user-private-key-bundle')))
$$;
create function public.cr08_envelope(entity_id text,row_version bigint,writer_id text)
returns jsonb language sql immutable as $$
  select jsonb_build_object('version',1,'suite','FAMNESIA-P256-AESGCM-HKDF-SHA256-V1',
    'nonce','ICEiIyQlJicoKSor','ciphertext',repeat('A',32),'aad',jsonb_build_object(
      'workspaceId','72000000-0000-4000-8000-000000000001','entityId',entity_id,'fieldClass','person_core',
      'schemaVersion',1,'dataVersion',row_version,'keyId','wk-cr08','keyEpoch',1,
      'writerId',writer_id,'purpose','family-content'))
$$;

insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at) values
 ('71000000-0000-4000-8000-000000000001','authenticated','authenticated','cr08-owner@example.test',now(),now(),now()),
 ('71000000-0000-4000-8000-000000000002','authenticated','authenticated','cr08-editor@example.test',now(),now(),now()),
 ('71000000-0000-4000-8000-000000000003','authenticated','authenticated','cr08-viewer@example.test',now(),now(),now());
insert into public.workspaces(id,owner_user_id,name) values
 ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','CR08 encrypted collaboration');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','editor'),
 ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000003','viewer');
insert into public.encrypted_private_key_bundles(auth_user_id,principal_id,bundle,state,recovery_epoch,unwrap_fingerprint,signing_fingerprint) values
 ('71000000-0000-4000-8000-000000000001','cp_111111111111111111111111',public.cr08_bundle('cp_111111111111111111111111','a','b'),'active',1,'sha256:'||repeat('a',43),'sha256:'||repeat('b',43)),
 ('71000000-0000-4000-8000-000000000002','cp_222222222222222222222222',public.cr08_bundle('cp_222222222222222222222222','c','d'),'active',1,'sha256:'||repeat('c',43),'sha256:'||repeat('d',43));
insert into public.crypto_principals(principal_id,auth_user_id,unwrap_public_key,unwrap_fingerprint,signing_public_key,signing_fingerprint,recovery_epoch) values
 ('cp_111111111111111111111111','71000000-0000-4000-8000-000000000001','{}','sha256:'||repeat('a',43),'{}','sha256:'||repeat('b',43),1),
 ('cp_222222222222222222222222','71000000-0000-4000-8000-000000000002','{}','sha256:'||repeat('c',43),'{}','sha256:'||repeat('d',43),1);
insert into public.workspace_crypto_states(workspace_id) values('72000000-0000-4000-8000-000000000001');
insert into public.workspace_principal_directory(workspace_id,principal_id,auth_user_id,directory_revision) values
 ('72000000-0000-4000-8000-000000000001','cp_111111111111111111111111','71000000-0000-4000-8000-000000000001',1),
 ('72000000-0000-4000-8000-000000000001','cp_222222222222222222222222','71000000-0000-4000-8000-000000000002',1);
insert into public.editor_commit_delegations(workspace_id,delegation_id,principal_id,membership_epoch,scopes,signer_fingerprint,artifact,verified_at,expires_at)
values('72000000-0000-4000-8000-000000000001','delegation-1','cp_222222222222222222222222',1,
 array['family_shared','media'],'sha256:'||repeat('b',43),'{}',now(),now()+interval '1 hour');
insert into public.verified_checkpoint_intents(workspace_id,checkpoint_id,actor_principal_id,delegation_id,request_checksum,
 membership_epoch,key_epoch,previous_checkpoint_revision,previous_checkpoint_hash,next_checkpoint_hash,external_anchor_hash,artifact,verified_at,expires_at)
values('72000000-0000-4000-8000-000000000001','checkpoint-a','cp_222222222222222222222222','delegation-1','sha256:'||repeat('a',43),
 1,1,0,null,'sha256:'||repeat('h',43),'sha256:'||repeat('x',43),'{}',now(),now()+interval '5 minutes');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select lives_ok($$select public.commit_encrypted_workspace_v2('72000000-0000-4000-8000-000000000001','editor-a',
 'sha256:'||repeat('a',43),1,1,1,'[]',jsonb_build_array(jsonb_build_object('type','entity_upsert','entityId','person-a',
 'fieldClass','person_core','expectedRowVersion',0,'keyId','wk-cr08','keyEpoch',1,
 'envelope',public.cr08_envelope('person-a',1,'cp_222222222222222222222222'))),'checkpoint-a')$$,
 'editor with active delegation commits ciphertext directly');
select is((select writer_principal_id from public.encrypted_entities where entity_id='person-a'),'cp_222222222222222222222222',
 'direct commit records editor principal without plaintext');
select is((select checkpoint_revision from public.workspace_crypto_states where workspace_id='72000000-0000-4000-8000-000000000001'),1::bigint,
 'direct commit advances authenticated checkpoint');
select is((public.commit_encrypted_workspace_v2('72000000-0000-4000-8000-000000000001','editor-a',
 'sha256:'||repeat('a',43),1,1,1,'[]',jsonb_build_array(jsonb_build_object('type','entity_upsert','entityId','person-a',
 'fieldClass','person_core','expectedRowVersion',0,'keyId','wk-cr08','keyEpoch',1,
 'envelope',public.cr08_envelope('person-a',1,'cp_222222222222222222222222'))),'checkpoint-a')->>'idempotent')::boolean,true,
 'same commit id and request retries exactly once');
select is((select count(*)::integer from public.encrypted_commits where commit_id='editor-a'),1,'idempotent retry stores one commit');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',true);
select public.throws_ok($$select public.commit_encrypted_workspace_v2('72000000-0000-4000-8000-000000000001','viewer-denied',
 'sha256:'||repeat('v',43),2,1,1,'[]','[{"type":"entity_delete","entityId":"person-a","fieldClass":"person_core","expectedRowVersion":1}]','missing')$$,
 'viewer cannot commit');
reset role;

insert into public.verified_checkpoint_intents(workspace_id,checkpoint_id,actor_principal_id,delegation_id,request_checksum,
 membership_epoch,key_epoch,previous_checkpoint_revision,previous_checkpoint_hash,next_checkpoint_hash,external_anchor_hash,artifact,verified_at,expires_at)
values('72000000-0000-4000-8000-000000000001','checkpoint-b','cp_222222222222222222222222','delegation-1','sha256:'||repeat('c',43),
 1,1,1,'sha256:'||repeat('h',43),'sha256:'||repeat('i',43),'sha256:'||repeat('x',43),'{}',now(),now()+interval '5 minutes');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select lives_ok($$select public.commit_encrypted_workspace_v2('72000000-0000-4000-8000-000000000001','editor-b',
 'sha256:'||repeat('c',43),1,1,1,'[]',jsonb_build_array(jsonb_build_object('type','entity_upsert','entityId','person-b',
 'fieldClass','person_core','expectedRowVersion',0,'keyId','wk-cr08','keyEpoch',1,
 'envelope',public.cr08_envelope('person-b',1,'cp_222222222222222222222222'))),'checkpoint-b')$$,
 'stale global base safely rebases a disjoint row');
select is((select data_version from public.workspace_crypto_states where workspace_id='72000000-0000-4000-8000-000000000001'),3::bigint,
 'disjoint rebase preserves monotonic workspace ordering');
select is((select count(*)::integer from public.encrypted_entities where workspace_id='72000000-0000-4000-8000-000000000001'),2,
 'both disjoint ciphertext rows survive');
select public.throws_ok($$select public.commit_encrypted_workspace_v2('72000000-0000-4000-8000-000000000001','same-row-conflict',
 'sha256:'||repeat('z',43),1,1,1,'[]',jsonb_build_array(jsonb_build_object('type','entity_upsert','entityId','person-a',
 'fieldClass','person_core','expectedRowVersion',0,'keyId','wk-cr08','keyEpoch',1,
 'envelope',public.cr08_envelope('person-a',1,'cp_222222222222222222222222'))),'missing')$$,
 'same-row stale edit conflicts without data loss');
reset role;

update public.workspace_members set role='viewer' where workspace_id='72000000-0000-4000-8000-000000000001'
 and user_id='71000000-0000-4000-8000-000000000002';
select ok((select revoked_at is not null from public.editor_commit_delegations where delegation_id='delegation-1'),
 'demotion revokes editor delegation immediately');
update public.workspace_members set role='editor' where workspace_id='72000000-0000-4000-8000-000000000001'
 and user_id='71000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select public.throws_ok($$select public.commit_encrypted_workspace_v2('72000000-0000-4000-8000-000000000001','stale-epoch',
 'sha256:'||repeat('s',43),3,1,1,'[]','[{"type":"entity_delete","entityId":"person-a","fieldClass":"person_core","expectedRowVersion":1}]','missing')$$,
 'stale membership epoch cannot commit after role changes');
select public.throws_ok($$select public.commit_encrypted_workspace_v2('72000000-0000-4000-8000-000000000001','no-delegation',
 'sha256:'||repeat('n',43),3,1,3,'[]','[{"type":"entity_delete","entityId":"person-a","fieldClass":"person_core","expectedRowVersion":1}]','missing')$$,
 're-promoted editor needs a new delegation');
reset role;

insert into public.editor_commit_delegations(workspace_id,delegation_id,principal_id,membership_epoch,scopes,signer_fingerprint,artifact,verified_at,expires_at)
values('72000000-0000-4000-8000-000000000001','delegation-2','cp_222222222222222222222222',3,
 array['family_shared'],'sha256:'||repeat('b',43),'{}',now(),now()+interval '1 hour');
insert into public.verified_checkpoint_intents(workspace_id,checkpoint_id,actor_principal_id,delegation_id,request_checksum,
 membership_epoch,key_epoch,previous_checkpoint_revision,previous_checkpoint_hash,next_checkpoint_hash,external_anchor_hash,artifact,verified_at,expires_at)
values('72000000-0000-4000-8000-000000000001','checkpoint-c','cp_222222222222222222222222','delegation-2','sha256:'||repeat('k',43),
 3,1,2,'sha256:'||repeat('i',43),'sha256:'||repeat('j',43),'sha256:'||repeat('x',43),'{}',now(),now()+interval '5 minutes');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select lives_ok($$select public.commit_encrypted_workspace_v2('72000000-0000-4000-8000-000000000001','editor-c',
 'sha256:'||repeat('k',43),3,1,3,'[]',jsonb_build_array(jsonb_build_object('type','entity_upsert','entityId','person-c',
 'fieldClass','person_core','expectedRowVersion',0,'keyId','wk-cr08','keyEpoch',1,
 'envelope',public.cr08_envelope('person-c',1,'cp_222222222222222222222222'))),'checkpoint-c')$$,
 'explicit new delegation restores editor direct commit');
select public.throws_ok($$select public.commit_encrypted_workspace_v2('72000000-0000-4000-8000-000000000001','dependency-conflict',
 'sha256:'||repeat('m',43),4,1,3,'[{"kind":"entity","entityId":"person-a","fieldClass":"person_core","expectedRowVersion":0}]',
 jsonb_build_array(jsonb_build_object('type','entity_upsert','entityId','person-d','fieldClass','person_core','expectedRowVersion',0,
 'keyId','wk-cr08','keyEpoch',1,'envelope',public.cr08_envelope('person-d',1,'cp_222222222222222222222222'))),'missing')$$,
 'stale declared dependency blocks otherwise disjoint write');
reset role;

delete from public.workspace_members where workspace_id='72000000-0000-4000-8000-000000000001'
 and user_id='71000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select public.throws_ok($$select public.commit_encrypted_workspace_v2('72000000-0000-4000-8000-000000000001','removed-editor',
 'sha256:'||repeat('r',43),4,1,3,'[]','[{"type":"entity_delete","entityId":"person-a","fieldClass":"person_core","expectedRowVersion":1}]','missing')$$,
 'removed editor session is blocked immediately');
reset role;

select ok(not has_function_privilege('authenticated','public.commit_encrypted_workspace(uuid,text,text,bigint,integer,jsonb)','EXECUTE'),
 'legacy unfenced encrypted commit RPC is not callable');
select is((select count(*)::integer from public.workspace_operation_checkpoints where workspace_id='72000000-0000-4000-8000-000000000001'),3,
 'checkpoint ledger contains exactly the three accepted direct commits');
select is((select count(*)::integer from public.encrypted_entities where workspace_id='72000000-0000-4000-8000-000000000001'),3,
 'failed conflict revoked and removed-member attempts preserve canonical ciphertext');

select * from finish();
rollback;
