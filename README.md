# Famnesia

*Too many relatives. Not enough memory.*

> Kế hoạch Supabase và mã hóa được quản lý tại [docs/supabase-migration/00-INDEX.md](docs/supabase-migration/00-INDEX.md) và [docs/privacy-security/00-INDEX.md](docs/privacy-security/00-INDEX.md). Trạng thái thực tế nằm trong [TASK-STATUS.md](docs/privacy-security/TASK-STATUS.md); CR-11 vẫn là Observation và chưa cho phép real-data Production cutover.

Ứng dụng gia phả responsive bằng React, Vite, Vercel Functions và Supabase/Google Drive. Preview Supabase hiện chỉ mở metadata onboarding (workspace, join request, owner approval) và fail-closed mọi family/media/backup/Draft plaintext cho tới khi encrypted runtime được nối hoàn chỉnh.

## Kiến trúc

```text
Supabase Auth browser ──Bearer──> Vercel Functions ──RLS/RPC──> Supabase metadata
         │
         └── encrypted family runtime gate: closed (no plaintext fallback)

Google Drive rollback stack ──HttpOnly cookie──> Vercel Functions ──Drive API
```

Google Drive là rollback/legacy stack. Supabase schema chứa metadata, key envelopes và encrypted-record contracts; legacy plaintext tables còn tồn tại cho migration nhưng không được gọi qua Supabase request backend trên nhánh này.

```text
Famnesia/
├── family.json
├── backups/
├── photos/
├── activity/
│   └── YYYY-MM.jsonl (tối đa 20 hoạt động gần nhất)
└── drafts/
    └── <member-key>/ (Limited Access)
        ├── active-draft.json
        └── assets/
```

Redis không chứa dữ liệu gia phả hay ảnh. Với Drive rollback stack, Redis giữ session có TTL và Google refresh token đã mã hóa AES-256-GCM.

## Quyền cộng tác

- `owner`: quản lý workspace, join request và membership; data/key actions chỉ bật sau encrypted-runtime gate.
- `editor`: quyền commit trực tiếp theo encrypted collaboration contract; không còn role `contributor`.
- `viewer`: chỉ đọc ciphertext được cấp và chỉ giải mã khi có key hợp lệ.
- Join code 8 ký tự là routing metadata, không phải bearer secret: người dùng đăng nhập, gửi request, owner duyệt membership; bước cấp key vẫn tách riêng.

Giao diện không phải security boundary. Vercel Function xác minh Supabase Bearer token; RLS/RPC kiểm tra lại actor/role. Các endpoint family/media/backup của Supabase trả `423 ENCRYPTED_FAMILY_RUNTIME_REQUIRED` thay vì đọc hoặc ghi bảng plaintext legacy.

## Google OAuth

1. Bật **Google Drive API** trong Google Cloud Console.
2. Tại **Google Auth Platform**, cấu hình Branding và Audience.
3. Tạo OAuth Client loại **Web application**.
4. Thêm **Authorized redirect URIs** chính xác:

   ```text
   http://localhost:3000/api/auth/callback
   https://famnesia-family-tree.vercel.app/api/auth/callback
   ```

5. Thêm **Authorized JavaScript origins** (hữu ích cho cấu hình web app, dù flow hiện tại chạy server-side):

   ```text
   http://localhost:3000
   https://famnesia-family-tree.vercel.app
   ```

Ứng dụng dùng Authorization Code Flow với `access_type=offline`, cookie state ký HMAC và các scope `openid`, `email`, `profile`, `drive.file`.

## Chạy local

```bash
npm install
cp .env.example .env.local
npm run dev:vercel
```

Điền `.env.local` theo file mẫu. Tạo hai secret ngẫu nhiên bằng:

```bash
openssl rand -base64 48
```

`npm run dev:vercel` dùng `vercel dev` tại `http://localhost:3000` để frontend và `/api` chạy cùng origin. Local có thể dùng `SESSION_STORE_DRIVER=memory`; session local sẽ mất nếu tiến trình dev bị dừng. `npm run dev` chỉ chạy Vite và không phục vụ các endpoint `/api`.

Nền tảng Supabase local:

```bash
npm run supabase:start
npm run supabase:status
npm run supabase:reset
```

Hướng dẫn Project URL, publishable/secret key và cách cấu hình Local/Preview/Production nằm tại [docs/supabase-migration/SUPABASE-SETUP.md](docs/supabase-migration/SUPABASE-SETUP.md).

Công cụ import/đối soát Drive bundle nằm tại [SUPABASE-DRIVE-MIGRATION.md](docs/supabase-migration/SUPABASE-DRIVE-MIGRATION.md). Cutover Production, freeze, remote RLS evidence, rollback và cleanup gate nằm tại [SUPABASE-CUTOVER-RUNBOOK.md](docs/supabase-migration/SUPABASE-CUTOVER-RUNBOOK.md); runbook không tự cấp quyền thay đổi Production.

Supabase Google Auth, callback/origin và compatibility giữa hai stack được mô tả tại [docs/supabase-migration/SUPABASE-AUTH.md](docs/supabase-migration/SUPABASE-AUTH.md). Các selector phải là một stack hoàn chỉnh; mixed backend bị chặn.

Chỉ phát triển UI bằng dữ liệu mẫu, không cần OAuth:

```bash
VITE_USE_MOCK_DATA=true npm run dev:ui
```

## Biến môi trường Vercel

Drive rollback stack cần:

```dotenv
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://famnesia-family-tree.vercel.app/api/auth/callback
GOOGLE_PICKER_API_KEY=...
# Tuỳ chọn nếu không thể suy ra từ GOOGLE_CLIENT_ID
GOOGLE_CLOUD_PROJECT_NUMBER=...
SESSION_SECRET=...
TOKEN_ENCRYPTION_KEY=...
SESSION_MAX_AGE_SECONDS=604800
COLLAB_APPROVAL_V2_ENABLED=false
DATA_BACKEND=drive
AUTH_BACKEND=google-drive-oauth
MEDIA_BACKEND=drive
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
VITE_USE_MOCK_DATA=false
```

Cài Upstash Redis từ Vercel Marketplace và kết nối vào project `family-tree`; integration sẽ inject URL/token. Production cố ý từ chối chạy auth nếu không có persistent store, tránh session bị mất khi serverless instance restart.

Không đưa `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY` hoặc Redis token vào biến `VITE_*`.

Giá trị hợp lệ là `DATA_BACKEND=drive|supabase`, `AUTH_BACKEND=google-drive-oauth|supabase` và `MEDIA_BACKEND=drive|supabase`. Preview Supabase đặt cả ba thành `supabase`; family runtime vẫn fail-closed trong code và không có env để bật lại plaintext.

`VITE_JOIN_WORKFLOW_ENABLED=true` chỉ được đặt cho Preview sau khi toàn bộ migration Supabase đã áp trên database Preview cô lập. Mặc định `false` để create/join không gọi nhầm schema legacy hoặc database Production.

Các biến Supabase dùng tên `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` và `SUPABASE_SECRET_KEY`. Secret key là server-only và tuyệt đối không được đặt trong biến `VITE_*`.

### Legacy Google Drive rollback

Google Picker, Draft Approval V2 và mirror chỉ thuộc rollback stack cũ. Không bật chúng trong Supabase Preview và không dùng các luồng đó làm bằng chứng cho encrypted runtime. Nếu phải rollback về Drive, làm theo runbook migration/cutover và cấu hình `GOOGLE_PICKER_API_KEY` với referrer/API restriction phù hợp.

## Deploy

Production được kết nối với repository GitHub `hhiep1620/famnesia-family-tree`. Mỗi lần push vào nhánh `main`, Vercel tự build và deploy lên `https://famnesia-family-tree.vercel.app`. Các nhánh khác và pull request tạo Preview Deployment.

Flow Preview thông thường:

```bash
git add .
git commit -m "Mô tả thay đổi"
git push origin <feature-branch>
```

Deploy thủ công chỉ dùng khi cần:

```bash
npx vercel link --project family-tree --scope j4-f-vibe-coding
npx vercel deploy --scope j4-f-vibe-coding
```

Sau khi thêm/sửa env phải redeploy. Không dùng `--prod` cho nhánh kiểm thử này. Supabase Auth cần thêm Preview domain vào Redirect URLs; app giữ `/join/:code` qua OAuth và quay lại đúng route.

## Kiểm tra

```bash
npm test
npm run lint
npm run build
```

Các endpoint quan trọng:

- `/api/auth/login`, `/callback`, `/session`, `/logout`, `/reconnect`
- `/api/join` (request/list/owner resolve)
- `/api/workspaces`
- `/api/workspaces/:id/family` (gồm dữ liệu và activity), `/photos`, `/backups`, `/members`
- `/api/workspaces/:id/family?resource=drafts|collaboration-status`
- `/api/workspaces/:id/family?operation=draft-submit|draft-review|mirror-sync`

Mọi response API nhạy cảm đều `Cache-Control: no-store`; thao tác thay đổi dữ liệu kiểm tra same-origin để chống CSRF. Trên Supabase Preview, endpoint plaintext family/media/backup bị chặn trước khi chạm repository legacy.

## Dữ liệu và import an toàn

- JSON là định dạng native, Excel `.xlsx` là định dạng nhập liệu hàng loạt. Cả hai được chuẩn hóa về cùng `FamilyData` trước khi kiểm tra.
- Import chỉ dành cho owner, luôn preview và backup trước khi thay thế. Vercel Function chạy lại schema và genealogy validation trước khi ghi.
- Không nhận `.xls`, `.xlsm`, `.xlsb` hoặc `.xlam`; chặn macro, OLE/ActiveX, external link, công thức, workbook quá lớn và ZIP có tỷ lệ giải nén bất thường.
- Text export sang Excel được vô hiệu hóa tiền tố công thức `=`, `+`, `-`, `@`. Nội dung import luôn được render như plain text.
- Giới hạn mặc định: JSON 10 MB, XLSX 20 MB, 20.000 người, 50.000 quan hệ và 50.000 tham chiếu ảnh.

## Quy tắc family.json

- `schemaVersion` hiện tại là `3`; dữ liệu v1/v2 được migrate khi đọc.
- Mỗi profile có `name` chỉnh sửa được và `lineageSurname` tùy chọn để nhóm nhiều gia đình dưới nhãn “Gia tộc họ …”; dữ liệu cũ thiếu trường này vẫn hợp lệ.
- ID profile, person và relationship phải duy nhất; tham chiếu phải tồn tại và cùng profile.
- Không cho self-parent, self-spouse, quan hệ trùng hoặc vòng lặp tổ tiên.
- Trạng thái hôn phối: `married`, `partner`, `separated`, `divorced`, `widowed`, `unknown`.
- Ngày sinh giữ precision bằng `birthDateParts`: year/month/day. Chỉ precision `day` được tạo birthday hoặc tuổi chính xác; không dựng ngày `01-01` giả.
- Media của encrypted target phải là ciphertext; GEDCOM không import ảnh. Tuổi, thế hệ, họ nội/ngoại, vai vế, lịch lặp và analytics được suy diễn khi chạy.
- Xóa thành viên là thao tác cascade trong một lần lưu: tự xóa quan hệ, tham chiếu ảnh và bỏ chọn chủ thể; activity log tự giới hạn còn 20 sự kiện mới nhất.
- `confidence` có thể lưu cho ngày sinh, ngày mất và quan hệ; duplicate score và data-quality score không được persist.
