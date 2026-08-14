begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(43);

-- pgTAP's two-argument throws_ok treats the second argument as the exact
-- expected error text. This test-local wrapper keeps readable descriptions
-- while accepting any exception, which is appropriate for negative RLS and
-- constraint assertions whose detailed server message may vary by Postgres.
create function public.throws_ok(test_sql text, description text)
returns text
language sql
as $$
  select regexp_replace(extensions.throws_ok(test_sql), 'threw exception', description);
$$;

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'owner@example.test', now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'editor@example.test', now(), now(), now()),
  ('33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'contributor-a@example.test', now(), now(), now()),
  ('44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'contributor-b@example.test', now(), now(), now()),
  ('55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 'viewer@example.test', now(), now(), now()),
  ('66666666-6666-6666-6666-666666666666', 'authenticated', 'authenticated', 'outsider@example.test', now(), now(), now()),
  ('77777777-7777-7777-7777-777777777777', 'authenticated', 'authenticated', 'invitee@example.test', now(), now(), now());

insert into public.workspaces (id, owner_user_id, name)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Workspace A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Workspace B');

insert into public.workspace_members (workspace_id, user_id, role)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'editor'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'contributor'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'contributor'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 'viewer');

insert into public.family_profiles (id, workspace_id, legacy_id, name)
values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'PROFILE-A', 'Family A'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'PROFILE-B', 'Family B');

insert into public.persons (id, workspace_id, family_profile_id, legacy_id, name)
values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'PERSON-A1', 'Person A1'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'PERSON-A2', 'Person A2'),
  ('ffffffff-ffff-ffff-ffff-fffffffffff1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'PERSON-B1', 'Person B1');

select is(
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in (
      'user_profiles', 'workspaces', 'workspace_members', 'workspace_invitations',
      'family_profiles', 'persons', 'relationships', 'media', 'activity_events',
      'commits', 'draft_submissions', 'draft_operations', 'workspace_snapshots', 'migration_runs'
    ) and c.relrowsecurity),
  14,
  'RLS is enabled on every exposed Famnesia table'
);

select is_empty(
  $$select table_name from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon' and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')$$,
  'anon has no family table privileges'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select results_eq(
  $$select name from public.workspaces where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  array['Workspace A'::text],
  'owner can read workspace'
);
select lives_ok(
  $$insert into public.family_profiles (id, workspace_id, legacy_id, name) values ('99999999-9999-9999-9999-999999999999', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OWNER-NEW', 'Owner CRUD')$$,
  'owner can create canonical data'
);
select lives_ok(
  $$insert into public.workspace_members (workspace_id, user_id, role) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '77777777-7777-7777-7777-777777777777', 'viewer')$$,
  'owner can add a member'
);
select lives_ok(
  $$insert into public.workspace_invitations (workspace_id, email, role, invited_by_user_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'future@example.test', 'contributor', '11111111-1111-1111-1111-111111111111')$$,
  'owner can create an invitation'
);
select lives_ok(
  $$insert into public.workspace_snapshots (workspace_id, data_version, schema_version, reason, family_data, created_by_user_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 0, 3, 'test', '{}'::jsonb, '11111111-1111-1111-1111-111111111111')$$,
  'owner can create a snapshot'
);
select throws_ok(
  $$delete from public.workspace_members where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and user_id = '11111111-1111-1111-1111-111111111111'$$,
  'owner membership cannot be deleted'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select ok(public.can_commit_workspace('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'editor can commit');
select results_eq(
  $$select legacy_id from public.family_profiles where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and legacy_id = 'PROFILE-A'$$,
  array['PROFILE-A'::text],
  'editor can read canonical data'
);
select lives_ok(
  $$insert into public.persons (workspace_id, family_profile_id, legacy_id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'EDITOR-PERSON', 'Editor Person')$$,
  'editor can insert canonical data'
);
select lives_ok(
  $$insert into public.commits (workspace_id, commit_id, actor_user_id, operation_count) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'editor-commit-1', '22222222-2222-2222-2222-222222222222', 1)$$,
  'editor can create a commit record'
);
select throws_ok(
  $$insert into public.workspace_members (workspace_id, user_id, role) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '66666666-6666-6666-6666-666666666666', 'viewer')$$,
  'editor cannot administer members'
);
select throws_ok(
  $$insert into public.workspace_invitations (workspace_id, email, role, invited_by_user_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'blocked@example.test', 'viewer', '22222222-2222-2222-2222-222222222222')$$,
  'editor cannot administer invitations'
);
select throws_ok(
  $$insert into public.workspace_snapshots (workspace_id, data_version, schema_version, reason, family_data, created_by_user_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 3, 'blocked', '{}'::jsonb, '22222222-2222-2222-2222-222222222222')$$,
  'editor cannot create owner snapshots'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select ok(not public.can_commit_workspace('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'contributor cannot commit directly');
select results_eq(
  $$select legacy_id from public.persons where legacy_id = 'PERSON-A1'$$,
  array['PERSON-A1'::text],
  'contributor can read canonical data'
);
select throws_ok(
  $$insert into public.persons (workspace_id, family_profile_id, legacy_id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'BLOCKED-CONTRIBUTOR', 'Blocked')$$,
  'contributor cannot insert canonical data'
);
select lives_ok(
  $$insert into public.draft_submissions (id, workspace_id, contributor_user_id, base_data_version, checksum) values ('12345678-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 0, 'checksum-a')$$,
  'contributor can create own draft'
);
select lives_ok(
  $$insert into public.draft_operations (id, workspace_id, draft_submission_id, operation_id, sequence_number, operation_type, entity_id) values ('12345678-1000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '12345678-0000-0000-0000-000000000001', 'op-a', 0, 'person.update', 'PERSON-A1')$$,
  'contributor can add operation to own editable draft'
);
select throws_ok(
  $$insert into public.draft_submissions (workspace_id, contributor_user_id, base_data_version, checksum) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 0, 'impersonated')$$,
  'contributor cannot create another contributor draft'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select lives_ok(
  $$insert into public.draft_submissions (id, workspace_id, contributor_user_id, base_data_version, checksum) values ('12345678-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 0, 'checksum-b')$$,
  'second contributor can create own draft'
);
select lives_ok(
  $$insert into public.draft_operations (id, workspace_id, draft_submission_id, operation_id, sequence_number, operation_type, entity_id) values ('12345678-1000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '12345678-0000-0000-0000-000000000002', 'op-b', 0, 'person.update', 'PERSON-A2')$$,
  'second contributor can add own operation'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select is_empty(
  $$select id from public.draft_submissions where id = '12345678-0000-0000-0000-000000000002'$$,
  'contributor A cannot read contributor B draft'
);
select is_empty(
  $$update public.draft_operations set decision_note = 'tampered' where id = '12345678-1000-0000-0000-000000000002' returning id$$,
  'contributor A cannot update contributor B operation'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select results_eq(
  $$select count(*)::bigint from public.draft_submissions where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  array[2::bigint],
  'editor can review all contributor drafts'
);
select is_empty(
  $$update public.draft_submissions set status = 'rejected' where id = '12345678-0000-0000-0000-000000000001' returning id$$,
  'reviewers cannot bypass the revision-checked review RPC'
);
select is_empty(
  $$update public.draft_submissions set status = 'rejected', review_note = 'Needs correction', reviewed_by_user_id = '22222222-2222-2222-2222-222222222222' where id = '12345678-0000-0000-0000-000000000002' returning id$$,
  'review decisions cannot be written directly even with a note'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select results_eq(
  $$select legacy_id from public.persons where legacy_id = 'PERSON-A1'$$,
  array['PERSON-A1'::text],
  'viewer can read canonical data'
);
select throws_ok(
  $$insert into public.persons (workspace_id, family_profile_id, legacy_id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'BLOCKED-VIEWER', 'Blocked')$$,
  'viewer cannot write canonical data'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
select is_empty(
  $$select id from public.workspaces where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'non-member cannot read workspace'
);
select is_empty(
  $$select id from public.persons where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'non-member cannot read canonical data'
);
reset role;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select id from public.workspaces$$,
  'anonymous role has no table access'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select throws_ok(
  $$insert into public.persons (workspace_id, family_profile_id, legacy_id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'CROSS-WORKSPACE', 'Blocked')$$,
  'cross-workspace profile foreign key is rejected'
);
select throws_ok(
  $$insert into public.persons (workspace_id, family_profile_id, legacy_id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'PERSON-A1', 'Duplicate')$$,
  'duplicate legacy person ID is rejected'
);
select lives_ok(
  $$insert into public.relationships (workspace_id, family_profile_id, legacy_id, person1_id, person2_id, type) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'REL-PARENT-1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2', 'parent')$$,
  'first parent edge is accepted'
);
select throws_ok(
  $$insert into public.relationships (workspace_id, family_profile_id, legacy_id, person1_id, person2_id, type) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'REL-PARENT-2', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2', 'parent')$$,
  'duplicate parent edge is rejected'
);
select lives_ok(
  $$insert into public.relationships (workspace_id, family_profile_id, legacy_id, person1_id, person2_id, type, status) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'REL-SPOUSE-1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2', 'spouse', 'married')$$,
  'first spouse edge is accepted'
);
select throws_ok(
  $$insert into public.relationships (workspace_id, family_profile_id, legacy_id, person1_id, person2_id, type, status) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'REL-SPOUSE-2', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 'spouse', 'married')$$,
  'reverse duplicate spouse edge is rejected'
);
select throws_ok(
  $$insert into public.relationships (workspace_id, family_profile_id, legacy_id, person1_id, person2_id, type) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'REL-SELF', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 'parent')$$,
  'self relationship is rejected'
);
select throws_ok(
  $$insert into public.commits (workspace_id, commit_id, actor_user_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'editor-commit-1', '11111111-1111-1111-1111-111111111111')$$,
  'commit ID is unique inside a workspace'
);
select lives_ok(
  $$update public.family_profiles set name = 'Owner CRUD updated' where id = '99999999-9999-9999-9999-999999999999'$$,
  'owner can update canonical data'
);
select lives_ok(
  $$delete from public.family_profiles where id = '99999999-9999-9999-9999-999999999999'$$,
  'owner can delete canonical data'
);
reset role;

select * from finish();
rollback;
