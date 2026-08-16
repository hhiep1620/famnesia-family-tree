# Google Drive Dependency Map — CR-01

## Boundary sau CR-01

```text
React UI
  ├── AuthRepositoryContract
  └── FamilyRepositoryContract
          ▼
Vercel API routes
          ▼
RequestBackend
  ├── workspaces
  ├── family + activity
  ├── media
  ├── members
  ├── drafts/review/mirror
  └── backups
          ▼
Drive adapter (current) / Supabase adapters (later phases)
```

`api/_server/driveBackend.ts` là nơi duy nhất compose persistence Drive cho API routes. Các module Drive cũ vẫn tồn tại và không đổi behavior; chúng trở thành implementation detail phía sau contract.

## Server dependencies

| File/module | Trách nhiệm Drive/Google/Redis hiện tại | Replacement phase |
|---|---|---:|
| `api/_server/auth.ts` | Đọc cookie, lấy Google session và access token | 04 |
| `api/_server/oauth.ts` | Google OAuth code flow, refresh token và scope `drive.file` | 04, cleanup 10 |
| `api/_server/cookies.ts` | OAuth state và HttpOnly session cookie | 04, cleanup 10 |
| `api/_server/tokenEncryption.ts` | Mã hóa Google access/refresh token | 04, cleanup 10 |
| `api/_server/sessionRepository.ts` | Upstash session, refresh-token index | 04, đánh giá cleanup 10 |
| `api/_server/drive.ts` | Workspace discovery, `family.json`, revision, commit, activity, backup, ảnh, ACL | 05–09, cleanup 10 |
| `api/_server/collaboration.ts` | Draft file/folder, Limited Access, member migration, review, ảnh draft | 06–09, cleanup 10 |
| `api/_server/collaborationRepository.ts` | Upstash draft index, locks và mirror generation | 06, 08, cleanup 10 |
| `api/_server/mirror.ts` | Copy toàn bộ workspace sang Drive contributor | 08–10 |
| `api/_server/collaborationAccess.ts` | Derive role từ Drive capability + Redis record | 03, 08 |
| `api/_server/collaborationIntegrity.ts` | Checksum/dependency closure trung lập một phần; asset integrity còn Drive-specific | 06–08 |
| `api/auth/*` | Google login/callback/logout/reconnect và Picker token exposure | 04, cleanup 10 |
| `api/workspaces/*` | Trước CR-01 import Drive trực tiếp; sau CR-01 gọi `RequestBackend` | Adapter phases 05–08 |

## Frontend dependencies

| File/module | Coupling hiện tại | Replacement phase |
|---|---|---:|
| `src/hooks/useGoogleAuth.ts` | Tên Google-specific; sau CR-01 gọi auth contract | 04 |
| `src/services/authApi.ts` | Endpoint cookie Google hiện tại | 04 |
| `src/services/googleWorkspacePicker.ts` | Picker chọn workspace root và nhận Google token | 08, cleanup 10 |
| `src/components/data/SharedWorkspaceConnector.tsx` | UX kết nối folder Drive | 08, cleanup 10 |
| `src/services/familyRepository.ts` | API facade được giữ; revision/photo response còn legacy Drive shape | 05–07 |
| `src/hooks/useFamilyData.ts` | `driveFileId`, Drive revision và orphan-photo notice | 05–07 |
| `src/hooks/useDriveImage.ts` | Photo endpoint/cache đặt tên Drive-specific | 07 |
| `src/components/family/*`, `src/components/search/*`, `src/components/draft/DraftInbox.tsx` | Nhận `driveFileId`/`photoFileId` từ domain | 05, 07 |
| `src/components/data/DataManagement.tsx` | Drive folder link, backup timestamps và member UI | 05, 08 |

## Portable contract còn mang tên Drive

| Contract/field | Hiện trạng | Quyết định migration |
|---|---|---|
| `FamilyRevision.modifiedTime/version` | Drive version optimistic concurrency | Giữ compatibility adapter; thêm Supabase `dataVersion` ở Phase 05/06 |
| `PersonMedia.driveFileId` | Stable Drive file ID trong export JSON/Excel | Giữ đọc legacy; mapper dùng storage object key trung lập ở Phase 05/07 |
| `FamilyProfile.photoFileId` | Legacy schema v1/v2 | Không xóa migration support; normalized media tiếp tục là nguồn chính |
| `FamilyBackup.id/createdTime/modifiedTime` | Drive file metadata | Map snapshot row/object metadata ở Phase 05/07 |
| `DraftAssetIntegrity.fileId/version/md5Checksum` | Drive file integrity | Map storage object/checksum ở Phase 07/08 |

## Upstash dependencies

- Session/refresh token: thay bằng Supabase Auth ở Phase 04.
- Draft index, workflow locks và mirror generation: thay bằng Postgres transaction/rows ở Phase 06/08.
- Không xóa Upstash trước Phase 10; có thể còn cần trong rollback window.

## Replacement order

1. CR-02 tạo Supabase factories/env nhưng Drive adapter vẫn active.
2. CR-03 dựng schema/RLS, chưa chạm runtime.
3. CR-04 thay auth adapter phía sau `AUTH_BACKEND`.
4. CR-05 thay read path phía sau `DATA_BACKEND`.
5. CR-06 thay commit/activity/backup transaction.
6. CR-07 thay media adapter và neutralize photo identifiers.
7. CR-08 thay Drive ACL/Picker/draft folders bằng membership/RLS.
8. CR-09 chỉ đọc Drive qua migration tool, không còn là runtime canonical path.
9. CR-10 cutover flags đồng bộ; cleanup Drive là commit riêng sau rollback window.
