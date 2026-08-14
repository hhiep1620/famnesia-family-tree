# Current System Audit — Famnesia Before Supabase

## Snapshot kiểm kê

- Frontend: React 19 + Vite + TypeScript.
- Hosting/API: Vercel static build + Vercel Functions.
- Canonical metadata: một `family.json` trong Google Drive workspace.
- Media: file ảnh riêng trong Google Drive; JSON lưu stable Drive file ID.
- Auth: Google OAuth Authorization Code Flow chạy server-side.
- Session/token: cookie HttpOnly; Upstash Redis lưu session và refresh token đã mã hóa.
- Quyền: Google Drive permission kết hợp metadata cộng tác trong Redis.
- Shared workspace: Google Picker cấp quyền `drive.file` cho folder người dùng chọn.
- Collaboration V2: owner, contributor cần duyệt, viewer; contributor có Draft Limited Access và mirror cá nhân.
- Concurrency: Drive revision/version, operation queue, batch commit và conflict detection.
- Backup/activity: file trong Google Drive workspace.

## Quy mô source tại baseline CR-01 (2026-08-14)

- Node `25.6.1`, npm `11.9.0`.
- 137 file TypeScript/TSX trước khi thêm repository boundary.
- 26 API modules: 12 route files và 14 server modules trước CR-01.
- 19 test files, 78 tests đều pass ở baseline.
- Package runtime chính: React `19.2.8`, Vite `8.2.1`, TypeScript `6.0.3`, Vitest `4.1.10`, Upstash Redis `1.38.2`.
- Dữ liệu mẫu người dùng được kiểm tra: khoảng 18 KB, 22 người, 28 quan hệ và 2 ảnh tham chiếu.

Baseline commands: `npm test`, `npm run lint` và `npm run build` đều đạt. Build có cảnh báo chunk JavaScript lớn hơn 500 kB nhưng không thất bại.

## Luồng hiện tại

```text
React browser
   │ HttpOnly session cookie
   ▼
Vercel Functions
   ├── Upstash Redis: session, encrypted refresh token, locks/index
   └── Google OAuth access token
          ▼
       Google Drive
       ├── family.json
       ├── photos/
       ├── backups/
       ├── activity/
       └── drafts/
```

## Phần phải giữ

Các module nghiệp vụ dưới đây không được viết lại nếu không có test chứng minh cần thiết:

- Schema và migration `FamilyData`.
- Family graph, units và validation.
- Kinship, lineage, generation và family layout.
- Calendar dương/âm, sinh nhật và ngày giỗ.
- Import/export JSON/Excel và security validation.
- Data quality, duplicate detection và merge logic.
- Draft operations, compaction và conflict semantics.
- UI cây, calendar, detail, search, analytics và responsive CSS.
- Image optimization phía client.

## Phần phải thay hoặc cô lập

- `api/_server/oauth.ts`, Google refresh token và Drive access token lifecycle.
- `api/_server/drive.ts` persistence/media/permission implementation.
- Google Picker và workspace discovery dựa trên Drive.
- Drive permission mapping.
- Drive-specific backup, activity, draft folder và mirror.
- `useDriveImage` và Drive photo proxy.
- Repository hiện tại đang gắn với `/api/workspaces/...` nhưng payload phụ thuộc Drive revision.

## Tính năng hiện tại cần đạt parity

### Auth và workspace

- Google sign-in/sign-out.
- User có thể thuộc nhiều workspace.
- Workspace switcher nhớ lựa chọn.
- Owner/contributor/viewer không vượt quyền.

### Dữ liệu

- CRUD profile, person, relationship và media metadata.
- Batch draft + Save all.
- Cascade delete.
- Conflict không làm mất local draft.
- Import/restore/merge duplicate vẫn atomic.

### Collaboration

- Owner quản lý member.
- Contributor gửi draft, owner/reviewer duyệt.
- Viewer chỉ đọc/export.
- Activity có actor và thời gian.

### Media

- Upload nhiều ảnh.
- Primary photo, caption và delete.
- Không lộ ảnh private qua URL lâu dài.
- Ảnh orphan được dọn có kiểm soát.

### Portability

- Export JSON đầy đủ.
- Excel import/export giữ nguyên.
- Có backup và rollback trước destructive operation.

## Debt/rủi ro cần loại bỏ

- Một file JSON là điểm tranh chấp cho toàn workspace.
- Quyền app phụ thuộc permission semantics của My Drive.
- Shared workspace cần Picker và migration permission phức tạp.
- Mirror tạo bản sao ngoài khả năng thu hồi của owner.
- Drive API vừa làm database vừa làm storage, gây coupling lớn.

## Contract bảo toàn trong migration

- `FamilyData` tiếp tục là định dạng export/import portable.
- ID hiện tại của profile/person/relationship/media phải được giữ trong migration.
- Các derived values không được persist chỉ vì chuyển sang Postgres.
- `updatedAt`, confidence, spouse status, lunar fields và sort order phải giữ semantics.
- Không đổi URL production/domain trong migration hạ tầng.
