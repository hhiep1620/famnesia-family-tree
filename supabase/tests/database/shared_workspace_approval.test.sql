begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.create_family_workspace('Workspace created by RPC')$$,
  'workspace creation RPC succeeds for a signed-in user'
);
select is(
  (select count(*)::integer from public.workspace_members member
   join public.workspaces workspace on workspace.id = member.workspace_id
   where workspace.name = 'Workspace created by RPC'
     and member.user_id = '10000000-0000-4000-8000-000000000001'
     and member.role = 'owner'),
  1,
  'workspace creation atomically creates its owner membership'
);

select lives_ok(
  $$select public.create_workspace_invitation(
    '20000000-0000-4000-8000-000000000001', 'LOCAL-OUTSIDER@example.test', 'contributor',
    repeat('a', 64), now() + interval '7 days'
  )$$,
  'owner can create a normalized contributor invitation'
);
select is(
  (select token_hash from public.workspace_invitations where token_hash = repeat('a', 64)),
  repeat('a', 64),
  'invitation stores the token hash'
);
select is_empty(
  $$select id from public.workspace_invitations where token_hash = 'plaintext-secret-token'$$,
  'invitation never stores the plaintext token'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.accept_workspace_invitation(repeat('a', 64))$$,
  '42501', 'INVITATION_EMAIL_MISMATCH',
  'a user with the wrong email cannot accept the invitation'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$select public.accept_workspace_invitation(repeat('a', 64))$$,
  'the invited email can accept the invitation'
);
select is(
  (select role::text from public.workspace_members
   where workspace_id = '20000000-0000-4000-8000-000000000001'
     and user_id = '10000000-0000-4000-8000-000000000003'),
  'contributor',
  'acceptance creates the requested membership'
);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is(
  (select status::text from public.workspace_invitations where token_hash = repeat('a', 64)),
  'accepted',
  'accepted invitation becomes terminal'
);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$select public.accept_workspace_invitation(repeat('a', 64))$$,
  'invitation replay by the same accepted user is idempotent'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.create_workspace_invitation(
    '20000000-0000-4000-8000-000000000001', 'never@example.test', 'viewer',
    repeat('b', 64), now() + interval '1 day'
  )$$,
  'owner can create a second invitation'
);
select lives_ok(
  $$select public.revoke_workspace_invitation(
    '20000000-0000-4000-8000-000000000001',
    (select id from public.workspace_invitations where token_hash = repeat('b', 64))
  )$$,
  'owner can revoke a pending invitation'
);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.accept_workspace_invitation(repeat('b', 64))$$,
  '22023', 'INVITATION_NOT_PENDING',
  'a revoked invitation cannot be accepted'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$insert into public.workspace_invitations (
    workspace_id, email, role, token_hash, invited_by_user_id, expires_at
  ) values (
    '20000000-0000-4000-8000-000000000001', 'expired@example.test', 'viewer', repeat('c', 64),
    '10000000-0000-4000-8000-000000000001', now() - interval '1 minute'
  )$$,
  'expired invitation fixture can be prepared by the owner'
);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.accept_workspace_invitation(repeat('c', 64))$$,
  '22023', 'INVITATION_EXPIRED',
  'expired invitation is rejected server-side'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$update public.workspace_members set role = 'viewer'
    where workspace_id = '20000000-0000-4000-8000-000000000001'
      and user_id = '10000000-0000-4000-8000-000000000001'$$,
  'P0001', 'workspace owner must keep owner role',
  'workspace owner cannot downgrade the last owner membership'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
select lives_ok(
  $$select public.submit_family_draft(
    '20000000-0000-4000-8000-000000000001', 7,
    '[{"id":"op-a","type":"person.update","entityId":"P01","profileId":"F_HOANG","changes":{"nickname":"Draft A"},"baseValues":{"nickname":"An"},"createdAt":"2026-08-14T00:00:00.000Z"}]'::jsonb,
    repeat('d', 64), now()
  )$$,
  'contributor can submit a revision-locked draft'
);
select is(
  (select status::text from public.draft_submissions
   where workspace_id = '20000000-0000-4000-8000-000000000001'
     and contributor_user_id = '10000000-0000-4000-8000-000000000005'),
  'pending',
  'submitted draft is pending review'
);
select is_empty(
  $$update public.draft_operations set changes = '{"nickname":"tampered"}'::jsonb
    where operation_id = 'op-a' returning id$$,
  'contributor cannot tamper with a submitted operation'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$select public.submit_family_draft(
    '20000000-0000-4000-8000-000000000001', 7,
    '[{"id":"op-b","type":"person.update","entityId":"P02","profileId":"F_HOANG","changes":{"nickname":"Draft B"},"baseValues":{"nickname":null},"createdAt":"2026-08-14T00:00:00.000Z"}]'::jsonb,
    repeat('e', 64), now()
  )$$,
  'second contributor can submit an isolated draft'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
select is(
  (select count(*)::integer from public.draft_submissions
   where workspace_id = '20000000-0000-4000-8000-000000000001'),
  1,
  'contributor sees only their own draft'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select is(
  (select count(*)::integer from public.draft_submissions
   where workspace_id = '20000000-0000-4000-8000-000000000001'),
  2,
  'editor can list all submitted drafts'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.submit_family_draft(
    '20000000-0000-4000-8000-000000000001', 7,
    '[{"id":"blocked","type":"person.update","entityId":"P01","createdAt":"2026-08-14T00:00:00.000Z"}]'::jsonb,
    repeat('f', 64), now()
  )$$,
  '42501', 'DRAFT_SUBMIT_FORBIDDEN',
  'viewer cannot submit a draft'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$select public.finalize_family_draft_review(
    '20000000-0000-4000-8000-000000000001',
    (select id from public.draft_submissions where contributor_user_id = '10000000-0000-4000-8000-000000000005'),
    1, 'reject', array['op-a'], '', -1
  )$$,
  '22023', 'DRAFT_REVIEW_INVALID',
  'reject decision requires a reason'
);
select throws_ok(
  $$select public.finalize_family_draft_review(
    '20000000-0000-4000-8000-000000000001',
    (select id from public.draft_submissions where contributor_user_id = '10000000-0000-4000-8000-000000000005'),
    99, 'reject', array['op-a'], 'Outdated review', -1
  )$$,
  '40001', 'DRAFT_REVISION_CHANGED',
  'review must target the exact draft revision'
);
select lives_ok(
  $$select public.finalize_family_draft_review(
    '20000000-0000-4000-8000-000000000001',
    (select id from public.draft_submissions where contributor_user_id = '10000000-0000-4000-8000-000000000005'),
    1, 'reject', array['op-a'], 'Please correct the nickname', -1
  )$$,
  'editor can reject the selected operation through the review RPC'
);
select is(
  (select status::text from public.draft_submissions
   where contributor_user_id = '10000000-0000-4000-8000-000000000005'
     and workspace_id = '20000000-0000-4000-8000-000000000001'),
  'rejected',
  'fully rejected draft becomes terminal'
);
select is(
  (select count(*)::integer from public.draft_review_events
   where workspace_id = '20000000-0000-4000-8000-000000000001'
     and decision = 'reject'),
  1,
  'review event is recorded without storing an invitation token'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$delete from public.workspace_members
    where workspace_id = '20000000-0000-4000-8000-000000000001'
      and user_id = '10000000-0000-4000-8000-000000000002'$$,
  'owner can remove a non-owner member'
);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select is(
  public.can_read_workspace('20000000-0000-4000-8000-000000000001'),
  false,
  'member removal denies the next request immediately'
);

select * from finish();
rollback;
