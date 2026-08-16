# CR-01 — Baseline, Repository Boundary and Migration Flags

## Mục tiêu

Tạo điểm xuất phát đáng tin cậy và tách business/UI khỏi implementation Google Drive trước khi thêm Supabase. Phase này không thay đổi hành vi production và không cần Supabase account.

## Prerequisite

- Đọc `00-INDEX.md`, `01-CURRENT-SYSTEM.md`, `02-TARGET-ARCHITECTURE.md` và `TASK-STATUS.md`.
- Working tree phải được kiểm tra; không ghi đè thay đổi không liên quan.
- Production hiện vẫn dùng Drive.

## Việc phải làm

### 1. Baseline thực tế

- Ghi Node/npm version và package versions quan trọng.
- Chạy và lưu kết quả:

```bash
npm test
npm run lint
npm run build
```

- Kiểm kê API routes, source/test count và env keys hiện tại.
- Cập nhật `01-CURRENT-SYSTEM.md` nếu khác source.

### 2. Lập dependency map

Tìm và phân loại mọi tham chiếu trực tiếp đến:

- Google Drive.
- Google OAuth/access token/refresh token.
- Google Picker.
- Upstash session/collaboration locks.
- Drive file/revision/photo ID.

Tạo `DRIVE-DEPENDENCY-MAP.md` trong cùng thư mục, gồm file, trách nhiệm và replacement phase.

### 3. Repository boundary

Thiết kế interface trung lập cho:

- Auth/session.
- Workspace listing/access.
- Family read/commit.
- Media upload/read/delete.
- Members/invitations.
- Draft review.
- Backup/snapshot/activity.

Ưu tiên giữ `FamilyRepository` public API để UI ít thay đổi. Drive implementation hiện tại phải implement interface mới mà không đổi behavior.

### 4. Backend selectors

Thêm parser có validation cho:

```text
DATA_BACKEND=drive|supabase
AUTH_BACKEND=google-drive-oauth|supabase
MEDIA_BACKEND=drive|supabase
```

Default phải là `drive`, `google-drive-oauth`, `drive`. Giá trị không hợp lệ phải fail fast ở server; không âm thầm fallback Supabase/Drive.

### 5. Contract tests

Tạo test cho repository contract và flag parser. Drive adapter phải vượt test hiện hành.

## Không làm

- Không cài Supabase.
- Không đổi login UI.
- Không tạo SQL schema.
- Không đổi response shape của API.
- Không deploy/đổi env production.
- Không xóa module Drive/Picker/Redis.

## Acceptance criteria

- Production behavior không đổi khi không có flag mới.
- UI không import trực tiếp Drive server modules.
- Drive backend chạy qua boundary rõ ràng.
- Invalid backend flag bị chặn với thông báo cấu hình rõ.
- Baseline test/lint/build đạt.
- Có dependency map đầy đủ và mapping phase.

## Validation

```bash
npm test
npm run lint
npm run build
git diff --check
```

Smoke test local Drive/mock flow nếu credential sẵn có; không tuyên bố live Drive pass nếu chưa chạy.

## Handoff bắt buộc

Agent kết thúc bằng:

- Files changed.
- Baseline results.
- Repository interfaces được tạo.
- Drive dependency chưa được tách.
- Commit/hash nếu có.
- Update `TASK-STATUS.md`: Phase 01 Done, Phase 02 next.

## Stop conditions

- Baseline test đang fail từ trước và chưa xác định nguyên nhân.
- Interface buộc thay đổi business behavior.
- Có dirty changes trùng file không thể bảo toàn.
