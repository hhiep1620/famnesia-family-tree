begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(38);

create function public.throws_any_ok(test_sql text, description text)
returns text
language sql
as $$
  select regexp_replace(extensions.throws_ok(test_sql), 'threw exception', description);
$$;

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('91000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'commit-owner@example.test', now(), now(), now()),
  ('91000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'commit-editor@example.test', now(), now(), now()),
  ('91000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'commit-contributor@example.test', now(), now(), now()),
  ('91000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'commit-viewer@example.test', now(), now(), now());

insert into public.workspaces (id, owner_user_id, name)
values ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'Commit workspace');

insert into public.workspace_members (workspace_id, user_id, role)
values
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', 'editor'),
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000003', 'viewer'),
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000004', 'viewer');

insert into public.family_profiles (id, workspace_id, legacy_id, name)
values ('93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'F1', 'Commit family');

insert into public.persons (id, workspace_id, family_profile_id, legacy_id, name)
values ('94000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', 'P1', 'Person One');

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);

create temporary table first_commit_result as
select public.commit_family_operations(
  '92000000-0000-4000-8000-000000000001',
  'commit_owner_initial',
  0,
  '[
    {"id":"op-person-2","type":"person.create","entityId":"P2","profileId":"F1","value":{"id":"P2","profileId":"F1","name":"Person Two","gender":"female","isDeceased":false},"createdAt":"2026-08-14T01:00:00.000Z"},
    {"id":"op-relation-2","type":"relationship.create","entityId":"R1","profileId":"F1","value":{"id":"R1","profileId":"F1","person1Id":"P1","person2Id":"P2","type":"parent"},"createdAt":"2026-08-14T01:00:01.000Z"},
    {"id":"op-media-2","type":"media.attach","entityId":"M1","profileId":"F1","value":{"id":"M1","profileId":"F1","personId":"P2","driveFileId":"legacy-photo","type":"photo","isPrimary":true},"createdAt":"2026-08-14T01:00:02.000Z"}
  ]'::jsonb,
  '2026-08-14T01:00:00.000Z'
) as result;

select is((select result ->> 'status' from first_commit_result), 'applied', 'multi-operation batch is applied');
select is((select data_version from public.workspaces where id = '92000000-0000-4000-8000-000000000001'), 1::bigint, 'batch increments data version exactly once');
select ok(exists(select 1 from public.persons where workspace_id = '92000000-0000-4000-8000-000000000001' and legacy_id = 'P2'), 'person operation is persisted');
select ok(exists(select 1 from public.relationships where workspace_id = '92000000-0000-4000-8000-000000000001' and legacy_id = 'R1'), 'relationship operation is persisted');
select ok(exists(select 1 from public.media where workspace_id = '92000000-0000-4000-8000-000000000001' and legacy_id = 'M1'), 'media operation is persisted');
select is((select count(*) from public.commits where workspace_id = '92000000-0000-4000-8000-000000000001'), 1::bigint, 'batch creates one commit row');
select is((select count(*) from public.activity_events where workspace_id = '92000000-0000-4000-8000-000000000001'), 1::bigint, 'batch creates one activity row');

create temporary table retry_result as
select public.commit_family_operations(
  '92000000-0000-4000-8000-000000000001', 'commit_owner_initial', 0,
  '[
    {"id":"op-person-2","type":"person.create","entityId":"P2","profileId":"F1","value":{"id":"P2","profileId":"F1","name":"Person Two","gender":"female","isDeceased":false},"createdAt":"2026-08-14T01:00:00.000Z"},
    {"id":"op-relation-2","type":"relationship.create","entityId":"R1","profileId":"F1","value":{"id":"R1","profileId":"F1","person1Id":"P1","person2Id":"P2","type":"parent"},"createdAt":"2026-08-14T01:00:01.000Z"},
    {"id":"op-media-2","type":"media.attach","entityId":"M1","profileId":"F1","value":{"id":"M1","profileId":"F1","personId":"P2","driveFileId":"legacy-photo","type":"photo","isPrimary":true},"createdAt":"2026-08-14T01:00:02.000Z"}
  ]'::jsonb,
  '2026-08-14T01:00:00.000Z'
) as result;

select is((select (result ->> 'idempotent')::boolean from retry_result), true, 'retry of the same commit ID is idempotent');
select is((select data_version from public.workspaces where id = '92000000-0000-4000-8000-000000000001'), 1::bigint, 'idempotent retry does not increment version');
select is((select count(*) from public.activity_events where workspace_id = '92000000-0000-4000-8000-000000000001'), 1::bigint, 'idempotent retry does not duplicate activity');
select public.throws_any_ok(
  $$select public.commit_family_operations(
    '92000000-0000-4000-8000-000000000001', 'commit_owner_initial', 0,
    '[{"id":"op-reused-with-other-payload","type":"person.update","entityId":"P1","profileId":"F1","changes":{"note":"Must not apply"},"baseValues":{"note":""},"createdAt":"2026-08-14T01:10:00.000Z"}]'::jsonb,
    now()
  )$$,
  'same commit ID with another payload is rejected'
);
select is((select note from public.persons where workspace_id = '92000000-0000-4000-8000-000000000001' and legacy_id = 'P1'), '', 'reused commit ID cannot mutate canonical data');

create temporary table invalid_reference_result as
select public.commit_family_operations(
  '92000000-0000-4000-8000-000000000001', 'commit_invalid_reference', 1,
  '[
    {"id":"op-person-rollback","type":"person.create","entityId":"P_BAD","profileId":"F1","value":{"id":"P_BAD","profileId":"F1","name":"Must Roll Back"},"createdAt":"2026-08-14T02:00:00.000Z"},
    {"id":"op-relation-invalid","type":"relationship.create","entityId":"R_BAD","profileId":"F1","value":{"id":"R_BAD","profileId":"F1","person1Id":"P_BAD","person2Id":"P_MISSING","type":"parent"},"createdAt":"2026-08-14T02:00:01.000Z"}
  ]'::jsonb,
  '2026-08-14T02:00:00.000Z'
) as result;

select is((select result ->> 'status' from invalid_reference_result), 'conflict', 'invalid operation N returns a reference conflict');
select is_empty($$select legacy_id from public.persons where workspace_id = '92000000-0000-4000-8000-000000000001' and legacy_id = 'P_BAD'$$, 'earlier operations are not committed when operation N conflicts');
select is((select data_version from public.workspaces where id = '92000000-0000-4000-8000-000000000001'), 1::bigint, 'conflicted batch does not increment version');
select is((select count(*) from public.commits where workspace_id = '92000000-0000-4000-8000-000000000001'), 1::bigint, 'conflicted batch creates no commit row');

select is(
  public.commit_family_operations(
    '92000000-0000-4000-8000-000000000001', 'commit_remote_phone', 1,
    '[{"id":"op-remote-phone","type":"person.update","entityId":"P1","profileId":"F1","changes":{"phone1":"0909"},"baseValues":{"phone1":""},"createdAt":"2026-08-14T03:00:00.000Z"}]'::jsonb,
    '2026-08-14T03:00:00.000Z'
  ) ->> 'status',
  'applied',
  'first field update is applied'
);

create temporary table auto_merge_result as
select public.commit_family_operations(
  '92000000-0000-4000-8000-000000000001', 'commit_stale_nickname', 1,
  '[{"id":"op-stale-nickname","type":"person.update","entityId":"P1","profileId":"F1","changes":{"nickname":"Local"},"baseValues":{"nickname":null},"createdAt":"2026-08-14T03:01:00.000Z"}]'::jsonb,
  '2026-08-14T03:01:00.000Z'
) as result;

select is((select result ->> 'status' from auto_merge_result), 'applied', 'different-field stale commit auto-merges');
select is((select (result ->> 'autoMerged')::boolean from auto_merge_result), true, 'auto-merged result is marked');
select results_eq(
  $$select phone1, nickname from public.persons where workspace_id = '92000000-0000-4000-8000-000000000001' and legacy_id = 'P1'$$,
  $$values ('0909'::text, 'Local'::text)$$,
  'auto-merge preserves remote and local fields'
);

select is(
  public.commit_family_operations(
    '92000000-0000-4000-8000-000000000001', 'commit_remote_nickname', 3,
    '[{"id":"op-remote-nickname","type":"person.update","entityId":"P1","profileId":"F1","changes":{"nickname":"Remote"},"baseValues":{"nickname":"Local"},"createdAt":"2026-08-14T03:02:00.000Z"}]'::jsonb,
    '2026-08-14T03:02:00.000Z'
  ) ->> 'status',
  'applied',
  'remote same-field change is applied before conflict test'
);

create temporary table same_field_result as
select public.commit_family_operations(
  '92000000-0000-4000-8000-000000000001', 'commit_same_field', 3,
  '[{"id":"op-local-conflict","type":"person.update","entityId":"P1","profileId":"F1","changes":{"nickname":"Local Again"},"baseValues":{"nickname":"Local"},"createdAt":"2026-08-14T03:03:00.000Z"}]'::jsonb,
  '2026-08-14T03:03:00.000Z'
) as result;

select is((select result ->> 'status' from same_field_result), 'conflict', 'same-field different-value returns conflict');
select is((select result #>> '{conflicts,0,reason}' from same_field_result), 'field_changed', 'conflict identifies the field change reason');
select is((select nickname from public.persons where workspace_id = '92000000-0000-4000-8000-000000000001' and legacy_id = 'P1'), 'Remote', 'same-field conflict keeps remote value');
select is((select data_version from public.workspaces where id = '92000000-0000-4000-8000-000000000001'), 4::bigint, 'same-field conflict does not increment version');

select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000002', true);
select is(
  public.commit_family_operations(
    '92000000-0000-4000-8000-000000000001', 'commit_editor_allowed', 4,
    '[{"id":"op-editor-note","type":"person.update","entityId":"P1","profileId":"F1","changes":{"note":"Editor note"},"baseValues":{"note":""},"createdAt":"2026-08-14T04:00:00.000Z"}]'::jsonb,
    '2026-08-14T04:00:00.000Z'
  ) ->> 'status',
  'applied',
  'editor may commit directly'
);

select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000003', true);
select public.throws_any_ok(
  $$select public.commit_family_operations('92000000-0000-4000-8000-000000000001', 'commit_contributor_denied', 5, '[{"id":"op-denied","type":"person.update","entityId":"P1","changes":{"note":"Denied"},"createdAt":"2026-08-14T04:01:00.000Z"}]'::jsonb, now())$$,
  'viewer direct commit is denied'
);

select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000004', true);
select public.throws_any_ok(
  $$select public.commit_family_operations('92000000-0000-4000-8000-000000000001', 'commit_viewer_denied', 5, '[{"id":"op-denied","type":"person.update","entityId":"P1","changes":{"note":"Denied"},"createdAt":"2026-08-14T04:02:00.000Z"}]'::jsonb, now())$$,
  'viewer direct commit is denied'
);

select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
select is(
  public.commit_family_operations(
    '92000000-0000-4000-8000-000000000001', 'commit_cascade_delete', 5,
    '[{"id":"op-delete-p2","type":"person.delete","entityId":"P2","profileId":"F1","createdAt":"2026-08-14T05:00:00.000Z"}]'::jsonb,
    '2026-08-14T05:00:00.000Z'
  ) ->> 'status',
  'applied',
  'person delete batch is applied'
);
select is_empty($$select legacy_id from public.persons where workspace_id = '92000000-0000-4000-8000-000000000001' and legacy_id = 'P2'$$, 'person delete removes the person');
select is_empty($$select legacy_id from public.relationships where workspace_id = '92000000-0000-4000-8000-000000000001' and legacy_id = 'R1'$$, 'person delete cascades relationships');
select is_empty($$select legacy_id from public.media where workspace_id = '92000000-0000-4000-8000-000000000001' and legacy_id = 'M1'$$, 'person delete cascades media');

select public.throws_any_ok(
  $$select public.commit_family_operations(
    '92000000-0000-4000-8000-000000000001', 'commit_cycle_rejected', 6,
    '[
      {"id":"op-cycle-person","type":"person.create","entityId":"P3","profileId":"F1","value":{"id":"P3","profileId":"F1","name":"Cycle Person"},"createdAt":"2026-08-14T06:00:00.000Z"},
      {"id":"op-cycle-edge-1","type":"relationship.create","entityId":"R2","profileId":"F1","value":{"id":"R2","profileId":"F1","person1Id":"P1","person2Id":"P3","type":"parent"},"createdAt":"2026-08-14T06:00:01.000Z"},
      {"id":"op-cycle-edge-2","type":"relationship.create","entityId":"R3","profileId":"F1","value":{"id":"R3","profileId":"F1","person1Id":"P3","person2Id":"P1","type":"parent"},"createdAt":"2026-08-14T06:00:02.000Z"}
    ]'::jsonb,
    now()
  )$$,
  'ancestry cycle rejects the whole transaction'
);
select is_empty($$select legacy_id from public.persons where workspace_id = '92000000-0000-4000-8000-000000000001' and legacy_id = 'P3'$$, 'cycle rollback removes earlier person create');
select is((select data_version from public.workspaces where id = '92000000-0000-4000-8000-000000000001'), 6::bigint, 'cycle rollback does not increment version');

select public.throws_any_ok(
  $$select public.commit_family_operations(
    '92000000-0000-4000-8000-000000000001', 'commit_duplicate_relationship', 6,
    '[
      {"id":"op-duplicate-person","type":"person.create","entityId":"P4","profileId":"F1","value":{"id":"P4","profileId":"F1","name":"Duplicate Person"},"createdAt":"2026-08-14T07:00:00.000Z"},
      {"id":"op-duplicate-edge-1","type":"relationship.create","entityId":"R4","profileId":"F1","value":{"id":"R4","profileId":"F1","person1Id":"P1","person2Id":"P4","type":"spouse","status":"married"},"createdAt":"2026-08-14T07:00:01.000Z"},
      {"id":"op-duplicate-edge-2","type":"relationship.create","entityId":"R5","profileId":"F1","value":{"id":"R5","profileId":"F1","person1Id":"P4","person2Id":"P1","type":"spouse","status":"married"},"createdAt":"2026-08-14T07:00:02.000Z"}
    ]'::jsonb,
    now()
  )$$,
  'duplicate relationship rejects the whole transaction'
);
select is_empty($$select legacy_id from public.persons where workspace_id = '92000000-0000-4000-8000-000000000001' and legacy_id = 'P4'$$, 'duplicate relationship rollback removes earlier person create');
select is((select data_version from public.workspaces where id = '92000000-0000-4000-8000-000000000001'), 6::bigint, 'duplicate relationship rollback does not increment version');

select * from finish();
rollback;
