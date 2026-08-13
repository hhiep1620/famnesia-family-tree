# Famnesia

*Too many relatives. Not enough memory.*

Ứng dụng gia phả responsive bằng React, Vite, Vercel Functions và Google Drive. Frontend không nhận Google access/refresh token; toàn bộ OAuth, session, kiểm tra quyền và Drive API chạy ở server.

## Kiến trúc

```text
React browser ──cookie HttpOnly──> Vercel Functions ──OAuth token──> Google Drive
                                     │
                                     └── Upstash Redis: session + token đã mã hóa
```

Google Drive vẫn là nguồn dữ liệu duy nhất:

```text
Famnesia/
├── family.json
├── backups/
├── photos/
└── activity/
    └── YYYY-MM.jsonl (tối đa 20 hoạt động gần nhất)
```

Redis không chứa dữ liệu gia phả. Redis chỉ giữ session có TTL và Google refresh token đã mã hóa AES-256-GCM.

## Quyền cộng tác

- `owner`: đọc/sửa, ảnh, import/replace, restore và quản lý thành viên.
- `editor`: đọc/sửa, ảnh, xử lý chất lượng dữ liệu và gộp thành viên; không import thay thế, restore hoặc quản lý thành viên.
- Tài khoản được mời sẽ tự mở workspace được chia sẻ nếu đó là workspace dùng được duy nhất. Famnesia không tạo thêm workspace cá nhân rỗng trong trường hợp này; các workspace cá nhân rỗng đã tạo trước đây cũng tự chuyển sang một workspace được chia sẻ duy nhất nếu không có Draft.
- `viewer`: chỉ đọc và export.

Giao diện ẩn thao tác không hợp lệ, nhưng Vercel Function luôn kiểm tra lại quyền thật trên Google Drive ở mỗi request. Không dựa vào role do browser gửi lên.

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
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
VITE_USE_MOCK_DATA=false
```

Cài Upstash Redis từ Vercel Marketplace và kết nối vào project `family-tree`; integration sẽ inject URL/token. Production cố ý từ chối chạy auth nếu không có persistent store, tránh session bị mất khi serverless instance restart.

Không đưa `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY` hoặc Redis token vào biến `VITE_*`.

### Kết nối workspace được chia sẻ bằng Google Picker

Famnesia giữ scope OAuth `drive.file`. Người được mời chọn thư mục gốc Famnesia một lần qua Google Picker; backend xác minh đúng workspace trước khi ghi nhớ và chuyển sang gia đình đó.

Trong cùng Google Cloud project đang chứa OAuth Client:

1. Bật **Google Picker API**.
2. Tạo **API key** loại Browser, giới hạn **Websites** theo HTTP referrer:
   - `https://famnesia-family-tree.vercel.app/*`
   - `http://localhost:3000/*`
3. Giới hạn API key chỉ được gọi **Google Picker API**.
4. Gán key cho `GOOGLE_PICKER_API_KEY`. `GOOGLE_CLOUD_PROJECT_NUMBER` là Project number trong **IAM & Admin → Settings**; có thể bỏ qua nếu client ID bắt đầu bằng project number.

API key được gửi tới trình duyệt theo yêu cầu của Google Picker, vì vậy giới hạn referrer và API là bắt buộc. OAuth access token chỉ được cấp từ endpoint cùng origin, dùng tức thời cho Picker và không lưu vào localStorage.

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
