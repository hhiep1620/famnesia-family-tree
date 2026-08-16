# FamilyData to Supabase Schema Mapping

Schema migration: `20260814000100_initial_family_schema.sql`

## Quyết định ID và version

- Mỗi record mới trong Postgres có primary key UUID nội bộ.
- ID string đang ổn định trong `family.json` được giữ ở `legacy_id`, unique theo workspace. API/repository có thể tiếp tục trả ID cũ cho UI trong thời gian migration.
- `workspaces.data_version` thay Drive `modifiedTime/version` làm optimistic concurrency token; giá trị bắt đầu từ `0` và chỉ tăng trong transactional commit của CR06.
- `workspaces.schema_version` giữ `FamilyData.schemaVersion` (hiện là `3`).
- Tất cả timestamp lưu bằng `timestamptz`; ngày sinh/ngày mất/ngày chụp dùng `date` để không lệch ngày theo timezone.

## Canonical FamilyData

| FamilyData | Postgres | Ghi chú |
|---|---|---|
| `schemaVersion` | `workspaces.schema_version` | Một version cho toàn workspace. |
| `updatedAt` | `workspaces.updated_at` | Do DB trigger cập nhật; không dùng làm concurrency token. |
| `settings.timezone` | `workspaces.timezone` | Default `Asia/Ho_Chi_Minh`. |
| `settings.locale` | `workspaces.locale` | Default `vi-VN`. |
| `settings.duplicateSuppressions` | `workspaces.duplicate_suppressions jsonb` | Phải là JSON array; giữ nguyên marker string. |
| `profiles[]` | `family_profiles` | `id` cũ → `legacy_id`; UUID nội bộ → `id`. |
| `profiles[].photoFileId` | `family_profiles.legacy_photo_file_id` | Chỉ là cầu nối Drive; chuyển sang Storage/media ở CR07. |
| `profiles[].subjectPersonId` | `family_profiles.subject_person_id` | FK composite bảo đảm chủ thể thuộc đúng workspace/profile. |
| `persons[]` | `persons` | `profileId` được resolve sang `family_profile_id` UUID. |
| `persons[].confidence` | `birth_date_confidence`, `death_date_confidence` | Enum khớp TypeScript. |
| `persons[].deathLunar` | `death_lunar_day/month/leap_month` | Constraint bắt buộc đủ cả ba hoặc cùng null. |
| `relationships[]` | `relationships` | `person1Id/person2Id` resolve sang UUID và bị ràng buộc cùng profile/workspace. |
| `media[]` | `media` | `driveFileId` → `legacy_drive_file_id` trong giai đoạn chuyển đổi. |

`gender`, `ancestralRole`, `relationship.type`, `spouse.status` và `confidence` dùng Postgres enum trùng tập giá trị TypeScript. `parent` không được có spouse status; self-edge, duplicate parent edge và duplicate spouse edge đảo chiều đều bị chặn ở DB. Vòng tổ tiên vẫn phải chạy `FamilyDataSchema`/genealogy validation ở server vì graph-cycle validation phức tạp không được thay bằng một constraint cục bộ.

## Identity và cộng tác

| Contract hiện tại/đích | Postgres | Ghi chú |
|---|---|---|
| Google user / Supabase user | `auth.users` + `user_profiles` | CR04 tạo/sync profile khi đăng nhập. |
| Workspace root folder | `workspaces` | `legacy_drive_folder_id` hỗ trợ reconciliation CR09. |
| Workspace member | `workspace_members` | Unique `(workspace_id, user_id)`; owner membership tự tạo và không thể xóa/hạ role. |
| Pending Drive permission/invite | `workspace_invitations` | Pending email không tạo user ID giả. |
| `owner` | `workspace_role.owner` | Canonical write + member admin + snapshot/migration. |
| `editor` | `workspace_role.editor` | Canonical commit + review Draft; không quản lý members. |
| `contributor` | `workspace_role.contributor` | Read canonical + own Draft only. |
| `viewer` | `workspace_role.viewer` | Read canonical only. |

Type `WorkspaceRole` phía UI hiện chưa có `editor`; CR04/CR08 sẽ mở rộng contract UI khi auth và collaboration chuyển sang Supabase. Phase schema chưa thay đổi frontend.

## Workflow và audit

| Runtime model | Postgres |
|---|---|
| `ActivityEvent` | `activity_events` |
| `FamilyCommitRequest.commitId` | `commits.commit_id`, unique trong workspace |
| `FamilyOperation[]` đang chờ duyệt | `draft_submissions` + `draft_operations` |
| Backup chính thức | `workspace_snapshots.family_data` |
| Drive import/cutover run | `migration_runs` |

`draft_operations` giữ operation payload dưới dạng `jsonb` vì union `FamilyOperation` thay đổi theo operation type. Các cột `operation_type`, `entity_id`, `profile_legacy_id`, sequence và status vẫn normalized để query/review/index. Checksum/revision nằm ở submission; dependency closure và tamper validation vẫn thuộc service layer.

## RLS matrix

| Resource | Owner | Editor | Contributor | Viewer | Non-member/anon |
|---|---|---|---|---|---|
| Workspace + canonical family | read/write | read/write | read | read | deny |
| Members/invitations | manage | deny | deny | deny | deny |
| Commits/activity writes | allow | allow | deny | deny | deny |
| Draft của chính contributor | review/read | review/read | create/read/update own | deny | deny |
| Draft contributor khác | review | review | deny | deny | deny |
| Snapshots | create/delete | read only | read only | read only | deny |
| Migration runs | manage | deny | deny | deny | deny |

Các helper `security definer` chỉ đọc membership/ownership để tránh recursive RLS, đặt `search_path = ''`, dùng tên object fully qualified và chỉ cấp execute cho `authenticated`/`service_role`. User flow trong test luôn chạy role `authenticated`; service role không được dùng để chứng minh policy.

## Khoảng trống được chủ động giữ cho CR sau

- CR04: tạo user profile, Supabase Auth session và mở rộng UI role `editor`.
- CR05: chuyển normalized rows về đúng `FamilyData` contract/read snapshot.
- CR06: RPC commit transaction, tăng `data_version`, idempotency và snapshot.
- CR07: bucket private, Storage path, signed URL và promote/delete ảnh.
- CR08: full Draft state machine/dependency review/invitation UX.
- CR09: resolve Drive IDs, import dữ liệu và reconciliation.
- CR10: remote RLS smoke test, cutover và rollback. Không selector nào được bật trong CR03.
