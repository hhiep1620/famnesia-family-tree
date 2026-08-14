# CR-03 — Postgres Schema, Constraints and Row Level Security

## Mục tiêu

Tạo schema Supabase normalized, constraints, RPC helper nền tảng và RLS đầy đủ. Phase này chưa chuyển frontend đọc/ghi Supabase.

## Prerequisite

- Phase 02 Done.
- Supabase CLI/local database hoạt động, hoặc có blocker được user chấp nhận.
- Đã đọc `src/types/family.ts`, schema validation và operation types thực tế.

## Schema bắt buộc

### Identity/workspace

- `user_profiles`
- `workspaces`
- `workspace_members`
- `workspace_invitations`

### Family canonical data

- `family_profiles`
- `persons`
- `relationships`
- `media`

### Workflow/audit

- `activity_events`
- `commits`
- `draft_submissions`
- `draft_operations`
- `workspace_snapshots`
- `migration_runs`

## Data rules

- Dùng UUID cho workspace/internal records mới; giữ legacy string IDs cho profile/person/relationship/media hoặc có cột `legacy_id` unique theo workspace.
- Mọi entity family có `workspace_id`.
- Profile-scoped entity có composite foreign key bảo đảm cùng workspace/profile.
- `workspace_members` unique `(workspace_id, user_id)` và pending invite không giả user ID.
- Role enum/check: owner, editor, contributor, viewer.
- Relationship type/status/confidence/gender values khớp TypeScript contract.
- Không self-parent/self-spouse.
- Chặn duplicate spouse/parent edge bằng canonical keys/index phù hợp.
- Ancestor cycle vẫn được server/business validation kiểm tra; SQL helper có thể bổ sung nhưng không thay test nghiệp vụ.
- Timestamps dùng `timestamptz` UTC.
- `workspaces.data_version bigint not null default 0`.
- `commits.commit_id` unique trong workspace.

## RLS policy matrix

### Owner

- Read/write canonical data.
- Manage members/invitations.
- Import/restore/snapshot.

### Editor

- Read canonical data.
- Commit family operations.
- Review contributor drafts.
- Không đổi owner/member role nếu không được phép.

### Contributor

- Read canonical data.
- Create/update own draft trước submission.
- Submit own draft.
- Không write canonical tables trực tiếp.
- Không đọc draft riêng của contributor khác.

### Viewer

- Read canonical data được membership cho phép.
- Không write.

### Anonymous

- Không có quyền trên family tables trong phase này.

## Helper functions

Tạo SQL functions ổn định và test được, ví dụ:

- `is_workspace_member(workspace_id)`.
- `workspace_role(workspace_id)`.
- `can_read_workspace(workspace_id)`.
- `can_commit_workspace(workspace_id)`.
- `can_review_workspace(workspace_id)`.

Tránh recursive RLS bằng `security definer` helper được harden `search_path`, owner và execute grants đúng mức.

## Migration discipline

- Mọi schema/policy nằm trong timestamped files dưới `supabase/migrations`.
- Không chỉnh remote Dashboard mà không capture migration.
- Seed chỉ tạo dữ liệu test, không chứa email/token thật.
- Generate TypeScript database types và commit file generated nếu project convention chọn như vậy.

## Test bắt buộc

Ít nhất test bằng nhiều JWT/user context hoặc SQL test harness:

- Owner CRUD/members.
- Editor commit allowed, member admin denied.
- Contributor canonical insert denied, own draft allowed.
- Contributor A không đọc/sửa Draft B.
- Viewer read allowed, writes denied.
- Non-member read denied.
- Cross-workspace FK/write denied.
- Duplicate IDs/relationships bị chặn.
- Secret/service-role không được dùng để chứng minh RLS user flow.

## Không làm

- Không sửa frontend/auth.
- Không import dữ liệu Drive.
- Không tạo public storage bucket.
- Không bật DATA_BACKEND=supabase.

## Acceptance criteria

- `supabase db reset` dựng schema sạch từ zero.
- RLS enabled trên mọi table exposed.
- Policy matrix có test pass và failure cases.
- TypeScript generated types phản ánh schema.
- Không có remote-only schema drift.
- `FamilyData` có mapping khả thi, được ghi trong `SCHEMA-MAPPING.md`.

## Validation

```bash
npx supabase db reset
npx supabase test db
npx supabase gen types typescript --local
npm test
npm run lint
npm run build
git diff --check
```

## Handoff bắt buộc

- Migration files và schema version.
- Policy matrix pass/fail evidence.
- Mapping decisions/known gaps.
- Update `TASK-STATUS.md`: Phase 03 Done, Phase 04 next.
