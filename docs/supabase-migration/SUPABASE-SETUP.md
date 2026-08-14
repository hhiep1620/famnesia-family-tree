# Supabase Setup for Famnesia

Tài liệu này chuẩn bị nền tảng Supabase nhưng **không đổi backend production**. Cho đến khi từng phase migration được kiểm thử và cutover có phê duyệt, ba selector phải tiếp tục là:

```dotenv
DATA_BACKEND=drive
AUTH_BACKEND=google-drive-oauth
MEDIA_BACKEND=drive
```

## 1. Chạy Supabase local

Yêu cầu Docker-compatible runtime đang chạy (Docker Desktop, OrbStack hoặc tương đương), sau đó:

```bash
npm install
npm run supabase:start
npm run supabase:status
npm run supabase:reset
```

- Studio: `http://127.0.0.1:54323`
- API: `http://127.0.0.1:54321`
- Mailpit: `http://127.0.0.1:54324`
- Dừng stack: `npm run supabase:stop`

`supabase status` in URL và key local. Chỉ copy các giá trị này vào `.env.local`; không commit file đó.

```dotenv
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY từ supabase status>
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_PUBLISHABLE_KEY=<cùng PUBLISHABLE_KEY>
SUPABASE_SECRET_KEY=<SECRET_KEY từ supabase status>
```

CLI hiện tại phát hành key mới có prefix `sb_publishable_` và `sb_secret_`. Factory cũng chấp nhận local legacy `anon`/`service_role` JWT để hỗ trợ project cũ. Tuyệt đối không đặt secret key hoặc service-role JWT vào biến `VITE_*`.

## 2. Tạo Supabase project remote

1. Tạo một organization/project mới trong Supabase Dashboard.
2. Chọn region gần người dùng chính và ghi lại region trong runbook cutover.
3. Trong **Project Settings → API Keys**, lấy:
   - Project URL;
   - Publishable key (`sb_publishable_...`);
   - Secret key (`sb_secret_...`) chỉ dành cho server/migration.
4. Không dùng secret key trong React, log, screenshot hoặc Preview link công khai.
5. Liên kết CLI khi bắt đầu remote schema verification:

   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   ```

Không chạy `db push`, không thay đổi production và không bật backend selector trong phase foundation này.

## 3. Cấu hình môi trường

### Local

Copy `.env.example` thành `.env.local`, điền endpoint/key local từ `npm run supabase:status`, nhưng vẫn giữ backend là Drive. Khi một CR yêu cầu thử riêng repository Supabase, chỉ đổi selector trong phiên local/Preview dành cho migration.

### Vercel Preview

Sau khi có remote development project, cấu hình các biến sau cho **Preview**:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
```

`SUPABASE_SECRET_KEY` phải là Sensitive. Preview tiếp tục dùng Drive selectors cho đến khi CR tương ứng yêu cầu kiểm thử Supabase.

### Vercel Production

Chỉ thêm Production URL/key sau khi remote project, RLS và rollback đã được kiểm thử. Việc có biến Supabase **không đồng nghĩa cutover**; selector Drive vẫn giữ nguyên cho tới CR10 và cần phê duyệt production riêng.

Ví dụ lệnh nhập secret an toàn từ clipboard (không để secret trong shell history):

```bash
pbpaste | npx vercel env add SUPABASE_SECRET_KEY production --sensitive --force --yes --scope j4-f-vibe-coding
```

Kiểm tra lại clipboard không có newline thừa trước khi dùng. Publishable key không phải bí mật, nhưng vẫn phải cấu hình đúng environment.

## 4. Client factory và nguyên tắc bảo mật

- `src/services/supabase/browserClient.ts`: lazy singleton cho browser, chỉ đọc `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY`.
- `api/_server/supabase/serverClient.ts`: client theo request với access token của user; không dùng chung client giữa request serverless.
- `api/_server/supabase/adminClient.ts`: client server-only dùng secret key cho migration/admin có kiểm soát.
- Validation không đưa giá trị key vào error hoặc status.
- Không import admin client từ `src/` hay bất kỳ bundle browser nào.

## 5. Kiểm tra foundation

```bash
npm test
npm run lint
npm run build
npm run supabase:status
npm run supabase:reset
```

Sau khi CR03 tạo schema, sinh type bằng:

```bash
npm run supabase:types
```

Foundation local hoàn tất không chứng minh remote Supabase đã đúng. Remote verification cần project URL/key thật và được thực hiện ở phase schema/auth tương ứng.
