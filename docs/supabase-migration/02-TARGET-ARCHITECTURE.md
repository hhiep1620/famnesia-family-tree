# Target Architecture — Supabase-backed Famnesia

## Quyết định chính

Famnesia sẽ dùng Supabase cho ba chức năng:

1. **Supabase Auth** — Google sign-in, session và user identity.
2. **Supabase Postgres** — metadata gia phả, membership, draft, activity và version.
3. **Supabase Storage** — ảnh/file private, export và backup.

Vercel tiếp tục host frontend và API. React UI cùng business logic hiện tại được giữ.

## Kiến trúc mục tiêu

```text
React/Vite browser
   ├── Supabase Auth client: sign-in/session
   └── Authorization: Bearer <Supabase access token>
              ▼
       Vercel Functions
       ├── xác thực JWT/user
       ├── validation nghiệp vụ
       ├── batch orchestration
       └── Supabase client trong user context
              ├── Postgres + RLS
              └── Private Storage + RLS
```

## Authentication boundary

- Browser dùng `@supabase/supabase-js` với Project URL và publishable key.
- Google provider được cấu hình trong Supabase Auth.
- Browser gửi access token đến API bằng `Authorization: Bearer`.
- Vercel API xác thực user trước mọi endpoint workspace.
- Publishable key có thể ở `VITE_*`; secret/service-role key tuyệt đối không được đưa ra browser.
- Service role chỉ được dùng cho migration/admin job đã xác thực và giới hạn phạm vi.

## Authorization boundary

Postgres RLS là lớp bảo vệ bắt buộc, không chỉ dựa trên việc UI ẩn nút.

Role nghiệp vụ:

- `owner`: full workspace, members, import/restore.
- `editor`: direct batch commit và review contributor draft.
- `contributor`: đọc + tạo/submitted draft, không commit canonical trực tiếp.
- `viewer`: chỉ đọc/export.

Mọi table thuộc workspace phải có `workspace_id` và policy dựa trên `auth.uid()` + `workspace_members`.

## Data model khái quát

```text
auth.users
   │
   ├── user_profiles
   └── workspace_members ── workspaces
                               ├── family_profiles
                               ├── persons
                               ├── relationships
                               ├── media
                               ├── activity_events
                               ├── draft_submissions
                               ├── draft_operations
                               ├── workspace_snapshots
                               └── migration_runs
```

## Version và transaction

- `workspaces.data_version bigint` là version canonical.
- Mỗi batch commit gửi `base_version`, `commit_id` và operations.
- Commit chạy trong một Postgres transaction/RPC.
- `commit_id` unique để idempotent retry.
- Các thay đổi không cùng field/entity được phép merge theo operation semantics hiện tại.
- Conflict trả payload có base/local/remote values; không xóa draft client.
- Activity và `data_version` được cập nhật trong cùng transaction.

## Storage design

Bucket private đề xuất:

- `family-media`
- `family-exports`
- `family-backups`

Object key:

```text
<workspace-id>/<profile-id>/<person-id>/<media-id>/original.webp
<workspace-id>/<profile-id>/<person-id>/<media-id>/thumb.webp
```

- Không dùng public bucket cho ảnh gia đình.
- RLS của `storage.objects` kiểm tra segment workspace trong object key.
- Tree dùng thumbnail; original chỉ tải khi mở gallery.
- Upload dùng staging key; metadata chỉ commit sau khi upload được xác minh.
- Signed URL phải ngắn hạn nếu API chọn mô hình signed access.

## API strategy

Giữ URL API hiện tại ở mức có thể để giảm thay đổi UI:

```text
/api/workspaces
/api/workspaces/:id/family
/api/workspaces/:id/family/commit
/api/workspaces/:id/photos
/api/workspaces/:id/backups
/api/workspaces/:id/members
```

Implementation được chọn qua repository adapter/feature flag trong migration. Không để UI gọi trực tiếp table tùy tiện nếu điều đó bỏ qua validation nghiệp vụ hiện có.

## Backup và portability

- `FamilyData` JSON vẫn là export contract.
- Snapshot JSON được tạo sau destructive commit hoặc theo lịch phù hợp.
- Backup object lưu ở private Storage, metadata lưu trong `workspace_snapshots`.
- Google Drive được giữ read-only trong thời gian rollback sau cutover.

## Feature flags

Đề xuất server-side:

```text
DATA_BACKEND=drive|supabase
AUTH_BACKEND=google-drive-oauth|supabase
MEDIA_BACKEND=drive|supabase
```

Nếu cần client flag để render auth, flag chỉ chọn UI flow; quyết định quyền và backend luôn do server xác nhận.

## Không làm trong migration cốt lõi

- Realtime collaborative cursor/presence.
- Public social family network.
- Telegram storage.
- Xóa ngay code/backup Google Drive.
- Thay đổi thuật toán layout/kinship/calendar.
- Chuyển Vite sang Next.js.

## Nguồn kỹ thuật chính thức

- Supabase React Auth: https://supabase.com/docs/guides/auth/quickstarts/react
- Google provider: https://supabase.com/docs/guides/auth/social-login/auth-google
- RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Secure data/key handling: https://supabase.com/docs/guides/database/secure-data
- Storage access control: https://supabase.com/docs/guides/storage/security/access-control
- Private buckets: https://supabase.com/docs/guides/storage/buckets/fundamentals
- Database migrations: https://supabase.com/docs/guides/deployment/database-migrations
