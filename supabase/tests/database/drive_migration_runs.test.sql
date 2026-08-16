begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.start_drive_bundle_migration(
    '91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001', 'Imported', 'drive-folder-1', 'v1', repeat('a', 64), repeat('b', 64)
  )$$,
  '42501', 'permission denied for function start_drive_bundle_migration',
  'authenticated owners cannot invoke the controlled migration RPC'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.start_drive_bundle_migration(
    '91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001', 'Imported', 'drive-folder-1', 'v1', repeat('a', 64), repeat('b', 64)
  )$$,
  'service role can start a controlled migration'
);
select is((select status::text from public.migration_runs where id = '92000000-0000-4000-8000-000000000001'), 'running', 'new run is running');
select is((select canonical_ready from public.workspaces where id = '91000000-0000-4000-8000-000000000001'), false, 'new migration workspace is hidden');
select is((select role::text from public.workspace_members where workspace_id = '91000000-0000-4000-8000-000000000001'), 'owner', 'workspace owner membership is created');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is_empty(
  $$select id from public.workspaces where id = '91000000-0000-4000-8000-000000000001'$$,
  'owner cannot read an incomplete canonical workspace'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.load_drive_bundle_migration(
    '92000000-0000-4000-8000-000000000001',
    '{"schemaVersion":3,"updatedAt":"2026-08-14T00:00:00Z","profiles":[{"id":"F1","name":"Family","lineageSurname":"","description":"","photoFileId":null,"subjectPersonId":"P1","requiresSecret":false,"isActive":true}],"persons":[{"id":"P1","profileId":"F1","name":"Person","nickname":null,"gender":"male","birthDate":null,"isDeceased":false,"deathDate":null,"deathLunar":null,"phone1":"","phone2":"","address":"","note":"","ancestralRole":"none","createdAt":"2026-08-01T00:00:00Z","updatedAt":"2026-08-02T00:00:00Z"}],"relationships":[],"media":[],"settings":{"timezone":"Asia/Ho_Chi_Minh","locale":"vi-VN","duplicateSuppressions":[]}}'::jsonb,
    '[]'::jsonb, '{"uploadedPaths":[],"phase":"loaded"}'::jsonb
  )$$,
  'load writes normalized rows while the workspace remains hidden'
);
select is((select canonical_ready from public.workspaces where id = '91000000-0000-4000-8000-000000000001'), false, 'loaded workspace remains hidden before reconciliation');
select is((select count(*)::integer from public.persons where workspace_id = '91000000-0000-4000-8000-000000000001'), 1, 'load preserves one person');
select is((public.drive_migration_snapshot('92000000-0000-4000-8000-000000000001') -> 'persons' -> 0 ->> 'id'), 'P1', 'service reconciliation snapshot preserves legacy ID');
select lives_ok(
  $$select public.publish_drive_bundle_migration('92000000-0000-4000-8000-000000000001', '{"clean":true}'::jsonb)$$,
  'clean reconciliation can publish the migration'
);
select is((select data_version from public.workspaces where id = '91000000-0000-4000-8000-000000000001'), 1::bigint, 'published workspace starts at data version one');
select is((select status::text from public.migration_runs where id = '92000000-0000-4000-8000-000000000001'), 'completed', 'published run is completed');
select lives_ok(
  $$select public.start_drive_bundle_migration(
    '91000000-0000-4000-8000-000000000099', '92000000-0000-4000-8000-000000000099',
    '10000000-0000-4000-8000-000000000001', 'Imported rerun', 'drive-folder-1', 'v1', repeat('a', 64), repeat('b', 64)
  )$$,
  'same source checksum rerun is idempotent'
);
select is((select count(*)::integer from public.workspaces where legacy_drive_folder_id = 'drive-folder-1'), 1, 'rerun does not duplicate a workspace');
select throws_ok(
  $$select public.rollback_incomplete_drive_migration('92000000-0000-4000-8000-000000000001')$$,
  '55000', 'MIGRATION_COMPLETED_NOT_ROLLBACKABLE',
  'completed migration cannot be destructively rolled back'
);

select lives_ok(
  $$select public.start_drive_bundle_migration(
    '91000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001', 'Interrupted', 'drive-folder-2', 'v2', repeat('c', 64), repeat('d', 64)
  )$$,
  'a second migration can be interrupted'
);
select lives_ok(
  $$select public.fail_drive_bundle_migration('92000000-0000-4000-8000-000000000002', '{"uploadedPaths":["one"]}'::jsonb, 1)$$,
  'interrupted progress can be recorded for resume'
);
select is((select resume_cursor from public.migration_runs where id = '92000000-0000-4000-8000-000000000002'), 1, 'resume cursor is durable');
select lives_ok(
  $$select public.rollback_incomplete_drive_migration('92000000-0000-4000-8000-000000000002')$$,
  'only an incomplete hidden workspace can be rolled back'
);
select is((select count(*)::integer from public.workspaces where id = '91000000-0000-4000-8000-000000000002'), 0, 'rollback removes the exact incomplete workspace');

select * from finish();
rollback;
