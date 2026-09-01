begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

create function public.throws_ok(test_sql text, description text)
returns text language sql as $$
  select regexp_replace(extensions.throws_ok(test_sql), 'threw exception', description);
$$;

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('71000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'join-owner@example.test', now(), now(), now()),
  ('71000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'join-requester@example.test', now(), now(), now()),
  ('71000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'join-outsider@example.test', now(), now(), now());

insert into public.workspaces (id, owner_user_id, name, join_code)
values ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'Join test', 'aB3cD4e5');
insert into public.workspaces (id, owner_user_id, name)
values ('72000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000001', 'Generated code');

select ok((select join_code ~ '^[A-Za-z0-9]{8}$' from public.workspaces where id = '72000000-0000-4000-8000-000000000002'),
  'every workspace receives a join code');
select ok((select join_code is not null from public.workspaces where id = '72000000-0000-4000-8000-000000000001'),
  'join code is required');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
select lives_ok($$select public.request_workspace_join('aB3cD4e5', 'viewer')$$, 'requester can create a pending request');
select lives_ok($$select public.request_workspace_join('aB3cD4e5', 'viewer')$$, 'same pending request is idempotent');
select is((select count(*)::integer from public.workspace_join_requests where requester_user_id = '71000000-0000-4000-8000-000000000002'), 1, 'idempotency creates one row');
select public.throws_ok($$insert into public.workspace_join_requests(workspace_id, requester_user_id, requested_role)
  values ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000002', 'owner')$$,
  'requester cannot ask for owner role');

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000003', true);
select public.throws_ok($$select * from public.list_workspace_join_requests('72000000-0000-4000-8000-000000000001')$$,
  'non-owner cannot list pending requests');

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
select is((select count(*)::integer from public.list_workspace_join_requests('72000000-0000-4000-8000-000000000001')), 1,
  'owner sees one pending request');
select is((select public.resolve_workspace_join_request(
  '72000000-0000-4000-8000-000000000001',
  (select id from public.workspace_join_requests where requester_user_id = '71000000-0000-4000-8000-000000000002'),
  true, 'viewer')), 'approved', 'owner approves the request');
reset role;

select is((select role::text from public.workspace_members where workspace_id = '72000000-0000-4000-8000-000000000001'
  and user_id = '71000000-0000-4000-8000-000000000002'), 'viewer', 'approval grants only the selected membership role');
select is((select status from public.workspace_join_requests where requester_user_id = '71000000-0000-4000-8000-000000000002'), 'approved',
  'request is no longer pending');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
select public.throws_ok($$select public.request_workspace_join('aB3cD4e5', 'viewer')$$,
  'an existing member cannot request membership again');
reset role;

select * from finish();
rollback;
