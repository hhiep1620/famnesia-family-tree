begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(27);

create function public.media_throws_ok(test_sql text, description text)
returns text language sql as $$
  select regexp_replace(extensions.throws_ok(test_sql), 'threw exception', description);
$$;

select is((select public from storage.buckets where id = 'family-media'), false, 'family-media bucket is private');
select is((select file_size_limit from storage.buckets where id = 'family-media'), 4194304::bigint, 'family-media bucket has four MiB cap');
select results_eq(
  $$select unnest(allowed_mime_types) from storage.buckets where id = 'family-media' order by 1$$,
  array['image/jpeg'::text, 'image/png'::text, 'image/webp'::text],
  'family-media MIME allow list is explicit'
);
select ok((select not public from storage.buckets where id = 'family-exports'), 'family-exports bucket is private');
select ok((select not public from storage.buckets where id = 'family-backups'), 'family-backups bucket is private');
select is(public.media_object_workspace_id('../escape'), null::uuid, 'path traversal does not resolve a workspace');
select is(public.media_object_upload_id('not/a/media/path'), null::uuid, 'malformed path does not resolve an upload');

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('a1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'media-owner@example.test', now(), now(), now()),
  ('a2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'media-editor@example.test', now(), now(), now()),
  ('a3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'media-contributor-a@example.test', now(), now(), now()),
  ('a4444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'media-contributor-b@example.test', now(), now(), now()),
  ('a5555555-5555-4555-8555-555555555555', 'authenticated', 'authenticated', 'media-viewer@example.test', now(), now(), now()),
  ('a6666666-6666-4666-8666-666666666666', 'authenticated', 'authenticated', 'media-outsider@example.test', now(), now(), now());

insert into public.workspaces (id, owner_user_id, name)
values
  ('aa000000-0000-4000-8000-000000000001', 'a1111111-1111-4111-8111-111111111111', 'Media A'),
  ('bb000000-0000-4000-8000-000000000002', 'a1111111-1111-4111-8111-111111111111', 'Media B');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('aa000000-0000-4000-8000-000000000001', 'a2222222-2222-4222-8222-222222222222', 'editor'),
  ('aa000000-0000-4000-8000-000000000001', 'a3333333-3333-4333-8333-333333333333', 'editor'),
  ('aa000000-0000-4000-8000-000000000001', 'a4444444-4444-4444-8444-444444444444', 'editor'),
  ('aa000000-0000-4000-8000-000000000001', 'a5555555-5555-4555-8555-555555555555', 'viewer');
insert into public.family_profiles (id, workspace_id, legacy_id, name) values
  ('aa100000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'F_MEDIA', 'Media family'),
  ('bb100000-0000-4000-8000-000000000002', 'bb000000-0000-4000-8000-000000000002', 'F_OTHER', 'Other family');
insert into public.persons (id, workspace_id, family_profile_id, legacy_id, name) values
  ('aa200000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'aa100000-0000-4000-8000-000000000001', 'P_MEDIA', 'Media person'),
  ('bb200000-0000-4000-8000-000000000002', 'bb000000-0000-4000-8000-000000000002', 'bb100000-0000-4000-8000-000000000002', 'P_OTHER', 'Other person');

insert into public.media_uploads (
  id, workspace_id, family_profile_id, person_id, created_by_user_id, object_prefix
) values (
  'aa300000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001',
  'aa100000-0000-4000-8000-000000000001', 'aa200000-0000-4000-8000-000000000001',
  'a3333333-3333-4333-8333-333333333333',
  'aa000000-0000-4000-8000-000000000001/aa100000-0000-4000-8000-000000000001/aa200000-0000-4000-8000-000000000001/aa300000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3333333-3333-4333-8333-333333333333', true);
select ok(public.can_write_media_object('aa000000-0000-4000-8000-000000000001/aa100000-0000-4000-8000-000000000001/aa200000-0000-4000-8000-000000000001/aa300000-0000-4000-8000-000000000001/original.png'), 'contributor can write own staged object');
select ok(public.can_read_media_object('aa000000-0000-4000-8000-000000000001/aa100000-0000-4000-8000-000000000001/aa200000-0000-4000-8000-000000000001/aa300000-0000-4000-8000-000000000001/original.png'), 'contributor can read own staged object');
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('family-media', 'aa000000-0000-4000-8000-000000000001/aa100000-0000-4000-8000-000000000001/aa200000-0000-4000-8000-000000000001/aa300000-0000-4000-8000-000000000001/original.png', 'a3333333-3333-4333-8333-333333333333')$$,
  'contributor can insert own scoped Storage object'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('family-media', 'aa000000-0000-4000-8000-000000000001/aa100000-0000-4000-8000-000000000001/aa200000-0000-4000-8000-000000000001/aa300000-0000-4000-8000-000000000001/thumb.webp', 'a3333333-3333-4333-8333-333333333333')$$,
  'contributor can insert own thumbnail'
);
select lives_ok(
  $$select public.verify_media_upload('aa300000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001/aa100000-0000-4000-8000-000000000001/aa200000-0000-4000-8000-000000000001/aa300000-0000-4000-8000-000000000001/original.png', 'aa000000-0000-4000-8000-000000000001/aa100000-0000-4000-8000-000000000001/aa200000-0000-4000-8000-000000000001/aa300000-0000-4000-8000-000000000001/thumb.webp', 'image/png', 12, 12, repeat('a', 64))$$,
  'contributor verifies own staged pair'
);
select media_throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('family-media', 'bb000000-0000-4000-8000-000000000002/bb100000-0000-4000-8000-000000000002/bb200000-0000-4000-8000-000000000002/aa300000-0000-4000-8000-000000000001/original.png', 'a3333333-3333-4333-8333-333333333333')$$,
  'cross-workspace object insert is denied'
);
select media_throws_ok(
  $$select public.verify_media_upload('aa300000-0000-4000-8000-000000000001', '../escape', '../thumb', 'image/png', 12, 12, repeat('a', 64))$$,
  'verification rejects traversal paths'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4444444-4444-4444-8444-444444444444', true);
select ok(not public.can_read_media_object('aa000000-0000-4000-8000-000000000001/aa100000-0000-4000-8000-000000000001/aa200000-0000-4000-8000-000000000001/aa300000-0000-4000-8000-000000000001/original.png'), 'contributor B cannot read contributor A uncommitted upload');
select ok(not public.can_write_media_object('aa000000-0000-4000-8000-000000000001/aa100000-0000-4000-8000-000000000001/aa200000-0000-4000-8000-000000000001/aa300000-0000-4000-8000-000000000001/original.png'), 'contributor B cannot write contributor A upload');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
select ok(public.can_read_media_object('aa000000-0000-4000-8000-000000000001/aa100000-0000-4000-8000-000000000001/aa200000-0000-4000-8000-000000000001/aa300000-0000-4000-8000-000000000001/original.png'), 'owner reviewer can read pending contributor upload');
select lives_ok(
  $$select public.prepare_media_upload('aa000000-0000-4000-8000-000000000001', 'F_MEDIA', 'P_MEDIA')$$,
  'owner can prepare upload'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true);
select lives_ok(
  $$select public.prepare_media_upload('aa000000-0000-4000-8000-000000000001', 'F_MEDIA', 'P_MEDIA')$$,
  'editor can prepare upload'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5555555-5555-4555-8555-555555555555', true);
select ok(not public.can_read_media_object('aa000000-0000-4000-8000-000000000001/aa100000-0000-4000-8000-000000000001/aa200000-0000-4000-8000-000000000001/aa300000-0000-4000-8000-000000000001/original.png'), 'viewer cannot read pending upload');
select media_throws_ok(
  $$select public.prepare_media_upload('aa000000-0000-4000-8000-000000000001', 'F_MEDIA', 'P_MEDIA')$$,
  'viewer cannot prepare upload'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6666666-6666-4666-8666-666666666666', true);
select ok(not public.can_read_media_object('aa000000-0000-4000-8000-000000000001/aa100000-0000-4000-8000-000000000001/aa200000-0000-4000-8000-000000000001/aa300000-0000-4000-8000-000000000001/original.png'), 'outsider cannot read media object');
select media_throws_ok(
  $$select public.prepare_media_upload('aa000000-0000-4000-8000-000000000001', 'F_MEDIA', 'P_MEDIA')$$,
  'outsider cannot prepare upload'
);
reset role;

update public.media_uploads set status = 'attached', claimed_legacy_id = 'M_ATTACHED'
where id = 'aa300000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5555555-5555-4555-8555-555555555555', true);
select ok(public.can_read_media_object('aa000000-0000-4000-8000-000000000001/aa100000-0000-4000-8000-000000000001/aa200000-0000-4000-8000-000000000001/aa300000-0000-4000-8000-000000000001/original.png'), 'viewer can read attached canonical object');
select ok(not public.can_write_media_object('aa000000-0000-4000-8000-000000000001/aa100000-0000-4000-8000-000000000001/aa200000-0000-4000-8000-000000000001/aa300000-0000-4000-8000-000000000001/original.png'), 'viewer cannot write attached canonical object');
reset role;

select is((select count(*) from public.media_cleanup_queue), 0::bigint, 'no cleanup item exists before canonical deletion');
insert into public.media (workspace_id, family_profile_id, person_id, legacy_id, storage_bucket, storage_path, thumbnail_storage_path)
values ('aa000000-0000-4000-8000-000000000001', 'aa100000-0000-4000-8000-000000000001', 'aa200000-0000-4000-8000-000000000001', 'M_DELETE', 'family-media', 'aa/path/original.png', 'aa/path/thumb.webp');
delete from public.media where workspace_id = 'aa000000-0000-4000-8000-000000000001' and legacy_id = 'M_DELETE';
select is((select count(*) from public.media_cleanup_queue where original_path = 'aa/path/original.png'), 1::bigint, 'metadata delete queues object cleanup transactionally');

select * from finish();
rollback;
