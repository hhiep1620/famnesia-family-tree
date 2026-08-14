-- Deterministic local-only parity fixture. All identities use example.test and
-- the password is intentionally non-production: FamnesiaLocal123!
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'local-owner@example.test', extensions.crypt('FamnesiaLocal123!', extensions.gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"name":"Local Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'local-viewer@example.test', extensions.crypt('FamnesiaLocal123!', extensions.gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"name":"Local Viewer"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'local-outsider@example.test', extensions.crypt('FamnesiaLocal123!', extensions.gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"name":"Local Outsider"}', now(), now());

insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select id::text, id, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now()
from auth.users
where id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003'
);

insert into public.workspaces (
  id, owner_user_id, name, schema_version, data_version, timezone, locale, duplicate_suppressions
)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Gia đình mẫu Supabase', 3, 7, 'Asia/Ho_Chi_Minh', 'vi-VN', '["P01:P99"]'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Workspace trống', 3, 0, 'Asia/Ho_Chi_Minh', 'vi-VN', '[]');

insert into public.workspace_members (workspace_id, user_id, role, invited_by_user_id)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'viewer', '10000000-0000-4000-8000-000000000001');

insert into public.family_profiles (
  id, workspace_id, legacy_id, name, lineage_surname, description, requires_secret, is_active
)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'F_HOANG', 'Gia tộc họ Hoàng', 'Hoàng', 'Nhánh họ nội mẫu', false, true),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'F_NGUYEN', 'Gia tộc họ Nguyễn', 'Nguyễn', 'Nhánh họ ngoại mẫu', false, true);

insert into public.persons (
  id, workspace_id, family_profile_id, legacy_id, name, nickname, gender, birth_date,
  is_deceased, death_date, death_lunar_day, death_lunar_month, death_lunar_leap_month,
  phone1, address, note, ancestral_role, sort_order, birth_date_confidence, death_date_confidence
)
values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'P01', 'Hoàng Văn An', 'An', 'male', '1980-02-03', false, null, null, null, null, '0901000001', 'Hà Nội', 'Chủ thể dữ liệu mẫu', 'none', 1, 'confirmed', null),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'P02', 'Lê Thu Bình', null, 'female', '1982-05-06', false, null, null, null, null, '', '', '', 'none', 2, 'likely', null),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'P03', 'Hoàng Minh Châu', null, 'female', '2010-07-08', false, null, null, null, null, '', '', '', 'none', 3, 'confirmed', null),
  ('40000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'P10', 'Nguyễn Thị Dung', 'Bà Dung', 'female', '1940-01-12', true, '2020-09-21', 5, 8, false, '', 'Nam Định', 'Có ngày giỗ âm lịch', 'founding_ancestor', 1, 'estimated', 'confirmed');

update public.family_profiles
set subject_person_id = case legacy_id
  when 'F_HOANG' then '40000000-0000-4000-8000-000000000001'::uuid
  when 'F_NGUYEN' then '40000000-0000-4000-8000-000000000010'::uuid
end
where workspace_id = '20000000-0000-4000-8000-000000000001';

insert into public.relationships (
  id, workspace_id, family_profile_id, legacy_id, person1_id, person2_id, type,
  status, start_date, end_date, sort_order, confidence
)
values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'R01', '40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'spouse', 'divorced', '2005-01-01', '2022-01-01', 1, 'confirmed'),
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'R02', '40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', 'parent', null, null, null, 2, 'confirmed'),
  ('50000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'R03', '40000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003', 'parent', null, null, null, 3, 'likely');

insert into public.media (
  id, workspace_id, family_profile_id, person_id, legacy_id, storage_bucket, storage_path,
  type, mime_type, byte_size, checksum, is_primary, caption, taken_date, sort_order
)
values (
  '60000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'M01', 'family-media',
  'workspaces/20000000-0000-4000-8000-000000000001/persons/P01/M01.jpg',
  'photo', 'image/jpeg', 12345, 'fixture-checksum', true, 'Ảnh đại diện mẫu', '2024-01-02', 1
);

insert into public.activity_events (
  id, workspace_id, legacy_id, actor_user_id, actor_email, actor_name, action,
  entity_type, entity_id, summary, metadata, occurred_at
)
values
  ('70000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'A01', '10000000-0000-4000-8000-000000000001', 'local-owner@example.test', 'Local Owner', 'person.created', 'person', 'P01', 'Đã tạo thành viên Hoàng Văn An', '{"source":"seed"}', '2026-08-01T01:00:00Z'),
  ('70000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'A02', '10000000-0000-4000-8000-000000000001', 'local-owner@example.test', 'Local Owner', 'profile.updated', 'profile', 'F_HOANG', 'Đã cập nhật gia tộc họ Hoàng', '{"source":"seed"}', '2026-08-02T01:00:00Z');

insert into public.workspace_snapshots (
  id, workspace_id, data_version, schema_version, reason, family_data, created_by_user_id, created_at
)
values (
  '80000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  6, 3, 'before-seed-update',
  '{"schemaVersion":3,"updatedAt":"2026-08-01T00:00:00.000Z","profiles":[],"persons":[],"relationships":[],"media":[],"settings":{"timezone":"Asia/Ho_Chi_Minh","locale":"vi-VN","duplicateSuppressions":[]}}',
  '10000000-0000-4000-8000-000000000001',
  '2026-08-01T00:00:00Z'
);
