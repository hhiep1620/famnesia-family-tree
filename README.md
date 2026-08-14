# Famnesia

*Too many relatives. Not enough memory.*

> Kế hoạch thay Google Drive bằng Supabase được tách thành các change request nhỏ cho AI Agent tại [docs/supabase-migration/00-INDEX.md](docs/supabase-migration/00-INDEX.md). Tài liệu này mô tả hệ thống production hiện tại; bộ migration mô tả kiến trúc đích và thứ tự chuyển đổi an toàn.

Ứng dụng gia phả responsive bằng React, Vite, Vercel Functions và Google Drive. Frontend không nhận Google access/refresh token; toàn bộ OAuth, session, kiểm tra quyền và Drive API chạy ở server.

## Kiến trúc

```text
React browser ──cookie HttpOnly──> Vercel Functions ──OAuth token──> Google Drive
                                     │
                                     └── Upstash Redis: session + workflow metadata
```

Google Drive vẫn là nguồn dữ liệu duy nhất:

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

Redis không chứa dữ liệu gia phả hay ảnh. Redis giữ session có TTL, Google refresh token đã mã hóa AES-256-GCM, draft index/checksum/revision, trạng thái review và mirror generation.

## Quyền cộng tác

- `owner`: đọc/sửa, ảnh, import/replace, restore và quản lý thành viên.
- `contributor` (hiển thị **Editor cần duyệt**): được chỉnh sửa Draft cục bộ, tải ảnh tạm và gửi owner duyệt; không thể ghi trực tiếp vào `family.json`.
- Tài khoản được mời sẽ tự mở workspace được chia sẻ nếu đó là workspace dùng được duy nhất. Famnesia không tạo thêm workspace cá nhân rỗng trong trường hợp này; các workspace cá nhân rỗng đã tạo trước đây cũng tự chuyển sang một workspace được chia sẻ duy nhất nếu không có Draft.
- `viewer`: chỉ đọc và export.

Giao diện ẩn thao tác không hợp lệ, nhưng Vercel Function luôn kiểm tra lại quyền thật trên Google Drive ở mỗi request. Không dựa vào role do browser gửi lên.

Khi approval V2 được bật, contributor chỉ có `reader` trên workspace gốc và `writer` trực tiếp trên folder Draft Limited Access của chính họ. Owner có thể duyệt/từ chối toàn bộ hoặc từng operation; từ chối luôn cần lý do, còn operation phụ thuộc được tự động chọn để dữ liệu sau duyệt vẫn hợp lệ. Một khóa workflow ngắn hạn trong Redis ngăn revision mới chen vào lúc owner đang duyệt; nội dung hoặc ảnh bị sửa trực tiếp trong Drive sẽ thất bại kiểm tra checksum.

Mỗi contributor có mirror do chính họ sở hữu tại `Famnesia Mirrors/<family-name>`. Mirror chỉ chứa dữ liệu chính thức, đồng bộ tăng dần tối đa 20 file hoặc 7 giây mỗi request và giữ 20 snapshot JSON/manifest. Thu hồi quyền workspace chỉ dừng đồng bộ; owner không thể xóa mirror đã nằm trong Drive contributor.

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

Nền tảng Supabase local cho quá trình migration (chưa thay backend Drive):

```bash
npm run supabase:start
npm run supabase:status
npm run supabase:reset
```

Hướng dẫn Project URL, publishable/secret key và cách cấu hình Local/Preview/Production nằm tại [docs/supabase-migration/SUPABASE-SETUP.md](docs/supabase-migration/SUPABASE-SETUP.md).

Công cụ import/đối soát Drive bundle nằm tại [SUPABASE-DRIVE-MIGRATION.md](docs/supabase-migration/SUPABASE-DRIVE-MIGRATION.md). Cutover Production, freeze, remote RLS evidence, rollback và cleanup gate nằm tại [SUPABASE-CUTOVER-RUNBOOK.md](docs/supabase-migration/SUPABASE-CUTOVER-RUNBOOK.md); runbook không tự cấp quyền thay đổi Production.

Supabase Google Auth, callback/origin và compatibility giữa hai stack được mô tả tại [docs/supabase-migration/SUPABASE-AUTH.md](docs/supabase-migration/SUPABASE-AUTH.md). Production hiện vẫn dùng Google Drive OAuth; mixed auth/data/media backend bị chặn để không làm mất provider credential.

Chỉ phát triển UI bằng dữ liệu mẫu, không cần OAuth:

```bash
VITE_USE_MOCK_DATA=true npm run dev:ui
```

## Biến môi trường Vercel

Production cần:

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

Ba backend selector mặc định giữ nguyên stack Drive hiện tại. Giá trị hợp lệ là `DATA_BACKEND=drive|supabase`, `AUTH_BACKEND=google-drive-oauth|supabase` và `MEDIA_BACKEND=drive|supabase`; backend Supabase chỉ được bật sau khi phase migration tương ứng hoàn tất.

Các biến Supabase dùng tên `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` và `SUPABASE_SECRET_KEY`. Secret key là server-only và tuyệt đối không được đặt trong biến `VITE_*`.

### Kết nối workspace được chia sẻ bằng Google Picker

Famnesia giữ scope OAuth `drive.file`. Người được mời chọn thư mục gốc Famnesia một lần qua Google Picker; backend xác minh đúng workspace trước khi ghi nhớ và chuyển sang gia đình đó.

Trong cùng Google Cloud project đang chứa OAuth Client:

1. Bật **Google Picker API**.
2. Tạo **API key** loại Browser, giới hạn **Websites** theo HTTP referrer:
   - `https://famnesia-family-tree.vercel.app`
   - `https://famnesia-family-tree.vercel.app/*`
   - `http://localhost:3000`
   - `http://localhost:3000/*`
3. Giới hạn API key chỉ được gọi **Google Picker API**.
4. Gán key cho `GOOGLE_PICKER_API_KEY`. `GOOGLE_CLOUD_PROJECT_NUMBER` là Project number trong **IAM & Admin → Settings**; có thể bỏ qua nếu client ID bắt đầu bằng project number.

API key được gửi tới trình duyệt theo yêu cầu của Google Picker, vì vậy giới hạn referrer và API là bắt buộc. OAuth access token chỉ được cấp từ endpoint cùng origin, dùng tức thời cho Picker và không lưu vào localStorage.

`GOOGLE_PICKER_API_KEY` phải là Browser API key thật bắt đầu bằng `AIza`; placeholder hoặc OAuth client secret sẽ bị server từ chối trước khi mở Picker.

### Bật Draft Approval V2

Tính năng được deploy mặc định ở trạng thái tắt. Sau khi kiểm tra Picker bằng hai tài khoản và cấu hình Redis Production:

1. Giữ `COLLAB_APPROVAL_V2_ENABLED=false`, deploy và smoke test đăng nhập/Pick workspace.
2. Đổi biến Production thành `true` rồi redeploy.
3. Owner mở app để migration idempotent các writer cũ: tạo Draft Limited Access, cấp writer trực tiếp và hạ quyền root xuống reader.
4. Kiểm tra bằng ba tài khoản owner/contributor A/contributor B; mỗi contributor chỉ được mở Draft của chính mình.

Nếu migration một thành viên thất bại, backend vẫn chặn commit trực tiếp và giao diện đánh dấu `cần migration lại`; owner mở lại mục thành viên để retry.

## Deploy

Production được kết nối với repository GitHub `hhiep1620/famnesia-family-tree`. Mỗi lần push vào nhánh `main`, Vercel tự build và deploy lên `https://famnesia-family-tree.vercel.app`. Các nhánh khác và pull request tạo Preview Deployment.

Flow thông thường:

```bash
git add .
git commit -m "Mô tả thay đổi"
git push origin main
```

Deploy thủ công chỉ dùng khi cần:

```bash
npx vercel link --project family-tree --scope j4-f-vibe-coding
npx vercel deploy --prod --scope j4-f-vibe-coding
```

Sau khi thêm/sửa env phải redeploy. Chỉ dùng production alias ổn định trong `GOOGLE_REDIRECT_URI`; preview deployment cần redirect URI riêng nếu muốn đăng nhập trên preview.

## Kiểm tra

```bash
npm test
npm run lint
npm run build
```

Các endpoint quan trọng:

- `/api/auth/login`, `/callback`, `/session`, `/logout`, `/reconnect`
- `/api/workspaces`
- `/api/workspaces/:id/family` (gồm dữ liệu và activity), `/photos`, `/backups`, `/members`
- `/api/workspaces/:id/family?resource=drafts|collaboration-status`
- `/api/workspaces/:id/family?operation=draft-submit|draft-review|mirror-sync`

Mọi response API nhạy cảm đều `Cache-Control: no-store`; thao tác thay đổi dữ liệu kiểm tra same-origin để chống CSRF. Save dùng revision để trả `409 FAMILY_DATA_CONFLICT` nếu có phiên khác vừa ghi.

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
- Ảnh nằm riêng trong Google Drive; `media` chỉ lưu stable Drive file ID. Tuổi, thế hệ, họ nội/ngoại, vai vế, lịch lặp và analytics được suy diễn khi chạy.
- Xóa thành viên là thao tác cascade trong một lần lưu: tự xóa quan hệ, tham chiếu ảnh và bỏ chọn chủ thể; activity log tự giới hạn còn 20 sự kiện mới nhất.
- `confidence` có thể lưu cho ngày sinh, ngày mất và quan hệ; duplicate score và data-quality score không được persist.
