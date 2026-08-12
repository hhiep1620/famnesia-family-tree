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
└── photos/
```

Redis không chứa dữ liệu gia phả. Redis chỉ giữ session có TTL và Google refresh token đã mã hóa AES-256-GCM.

## Quyền cộng tác

- `owner`: đọc/sửa, ảnh, import/replace, restore và quản lý thành viên.
- `editor`: đọc/sửa, ảnh và tạo backup; không import thay thế, restore hoặc quản lý thành viên.
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
SESSION_SECRET=...
TOKEN_ENCRYPTION_KEY=...
SESSION_MAX_AGE_SECONDS=604800
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
VITE_USE_MOCK_DATA=false
```

Cài Upstash Redis từ Vercel Marketplace và kết nối vào project `family-tree`; integration sẽ inject URL/token. Production cố ý từ chối chạy auth nếu không có persistent store, tránh session bị mất khi serverless instance restart.

Không đưa `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY` hoặc Redis token vào biến `VITE_*`.

## Deploy

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
- `/api/workspaces/:id/family`, `/photos`, `/backups`, `/members`

Mọi response API nhạy cảm đều `Cache-Control: no-store`; thao tác thay đổi dữ liệu kiểm tra same-origin để chống CSRF. Save dùng revision để trả `409 FAMILY_DATA_CONFLICT` nếu có phiên khác vừa ghi.

## Quy tắc family.json

- `schemaVersion` hiện tại là `1`.
- ID profile, person và relationship phải duy nhất; tham chiếu phải tồn tại và cùng profile.
- Không cho self-parent, self-spouse, quan hệ trùng hoặc vòng lặp tổ tiên.
- Trạng thái hôn phối: `married`, `partner`, `separated`, `divorced`, `widowed`, `unknown`.
- Ảnh chỉ lưu `photoFileId`; tuổi, thế hệ và quan hệ với chủ thể được suy diễn khi chạy.
