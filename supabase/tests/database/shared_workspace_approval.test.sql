begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

create function public.throws_ok(test_sql text, description text)
returns text language sql as $$
  select regexp_replace(extensions.throws_ok(test_sql), 'threw exception', description);
$$;

insert into public.workspace_crypto_states(workspace_id)
values('20000000-0000-4000-8000-000000000001') on conflict do nothing;

select results_eq(
  $$select enumlabel from pg_enum where enumtypid='public.workspace_role'::regtype order by enumsortorder$$,
  array['owner'::name,'editor'::name,'viewer'::name],
  'target workspace role contains exactly owner editor viewer'
);
select is((select count(*)::integer from pg_enum where enumtypid='public.workspace_role'::regtype and enumlabel='contributor'),0,
  'target role schema has no contributor label');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.create_workspace_invitation(
  '20000000-0000-4000-8000-000000000001','LOCAL-OUTSIDER@example.test','editor',repeat('a',64),now()+interval '7 days')$$,
  'owner can create an editor invitation');
select is((select role::text from public.workspace_invitations where token_hash=repeat('a',64)),'editor',
  'editor invitation stores only a target role');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select public.throws_ok($$select public.accept_workspace_invitation(repeat('a',64))$$,
  'wrong email cannot accept invitation');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select lives_ok($$select public.accept_workspace_invitation(repeat('a',64))$$,
  'invited account accepts editor role once');
select is((select role::text from public.workspace_members where workspace_id='20000000-0000-4000-8000-000000000001'
  and user_id='10000000-0000-4000-8000-000000000003'),'editor','acceptance creates editor membership');
select lives_ok($$select public.accept_workspace_invitation(repeat('a',64))$$,
  'same-account invitation retry is idempotent');
reset role;

select is((select membership_epoch from public.workspace_crypto_states where workspace_id='20000000-0000-4000-8000-000000000001'),2::bigint,
  'membership acceptance advances membership epoch');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
update public.workspace_members set role='viewer' where workspace_id='20000000-0000-4000-8000-000000000001'
  and user_id='10000000-0000-4000-8000-000000000003';
reset role;
select is((select membership_epoch from public.workspace_crypto_states where workspace_id='20000000-0000-4000-8000-000000000001'),3::bigint,
  'editor demotion advances membership epoch');

select ok(to_regprocedure('public.submit_family_draft(uuid,bigint,jsonb,text,timestamp with time zone)') is null,
  'legacy draft submit function is absent');
select ok(to_regprocedure('public.finalize_family_draft_review(uuid,uuid,integer,text,text[],text,bigint)') is null,
  'legacy draft review function is absent');
select is((select count(*)::integer from pg_policy where polrelid in ('public.draft_submissions'::regclass,'public.draft_operations'::regclass)
  and polcmd in ('a','w','d')),0,'legacy draft tables have no client mutation policies');
select public.throws_ok($$select 'contributor'::public.workspace_role$$,
  'a stale contributor claim cannot enter the target role type');
select public.throws_ok($$select public.create_workspace_invitation(
  '20000000-0000-4000-8000-000000000001','blocked@example.test','contributor',repeat('b',64),now()+interval '7 days')$$,
  'a pre-cutover contributor invitation cannot be replayed');
select is((select state::text from public.collaboration_cutovers where workspace_id='20000000-0000-4000-8000-000000000001'),'active',
  'new target workspace starts with active direct collaboration');
select is((select count(*)::integer from public.legacy_collaboration_inventory where workspace_id='20000000-0000-4000-8000-000000000001'),0,
  'new target workspace has no legacy role artifacts');
select is((select count(*)::integer from public.workspace_members where workspace_id='20000000-0000-4000-8000-000000000001'
  and role not in ('owner','editor','viewer')),0,'all live memberships use target roles');

select * from finish();
rollback;
