# Supabase Auth Setup and Compatibility

CR04 thêm Supabase Google Auth phía sau `AUTH_BACKEND=supabase`; production vẫn giữ toàn bộ Drive stack cho đến cutover được phê duyệt.

## Backend combinations được hỗ trợ

Chỉ hai combination hoàn chỉnh được parser chấp nhận:

```dotenv
# Rollback/current production
DATA_BACKEND=drive
AUTH_BACKEND=google-drive-oauth
MEDIA_BACKEND=drive

# Target stack sau khi tất cả repository/storage phase hoàn tất
DATA_BACKEND=supabase
AUTH_BACKEND=supabase
MEDIA_BACKEND=supabase
```

Mixed mode bị chặn vì Supabase session không chứa Google Drive access/refresh token, còn Google subject không phải immutable `auth.users.id` dùng cho RLS. Trong CR04, target combination chỉ dùng để smoke test auth; family repository sẽ tiếp tục báo chưa được triển khai cho đến CR05–CR08.

## Google Cloud và Supabase Dashboard

1. Trong Google Auth Platform tạo OAuth Client loại **Web application** dành cho Supabase Auth (có thể cùng Cloud project nhưng không yêu cầu Drive scope).
2. Data Access chỉ cần:
   - `openid`;
   - `.../auth/userinfo.email`;
   - `.../auth/userinfo.profile`.
3. Authorized JavaScript origins:
   - `http://localhost:3000`;
   - `https://famnesia-family-tree.vercel.app`;
   - Preview origin cụ thể nếu kiểm thử Preview.
4. Authorized redirect URI của Google **không phải** route callback cũ của Famnesia. Dùng callback hiển thị trong **Supabase Dashboard → Authentication → Providers → Google**, dạng:

   ```text
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

   Local provider dùng `http://127.0.0.1:54321/auth/v1/callback`.
5. Nhập Google Client ID/Secret vào Supabase Google provider rồi bật provider.
6. Trong **Authentication → URL Configuration**:
   - Site URL production: `https://famnesia-family-tree.vercel.app`;
   - Redirect allow list: `https://famnesia-family-tree-*-neptworks.vercel.app/**` cho Preview của đúng project/team và các origin localhost cần kiểm thử. Không dùng wildcard rộng hơn phạm vi này.

Không yêu cầu `drive.file`, không yêu cầu offline access và không lưu `provider_token`/`provider_refresh_token`. Browser dùng PKCE để callback chỉ mang authorization code dùng một lần thay vì access/refresh token trong URL; SDK tự trao đổi code và quản lý Supabase session.

## Local Google provider

Config giữ Google provider bật để `supabase config push` không vô tình tắt provider hosted. Trước khi start local hoặc push config, cung cấp Client ID và secret qua biến môi trường:

```bash
export SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID='<google-client-id>'
export SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET='<google-client-secret>'
npm run supabase:stop
npm run supabase:start
```

Không commit Client Secret. Khi Google local chưa cấu hình, dùng email/password smoke test dưới đây.

## Email/password local smoke

Lấy key local từ `npx supabase status -o env`, ánh xạ `API_URL`, `PUBLISHABLE_KEY`, `SECRET_KEY` vào ba biến app rồi chạy:

```bash
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_PUBLISHABLE_KEY='<local publishable key>' \
SUPABASE_SECRET_KEY='<local secret key>' \
npm run supabase:auth:smoke
```

Script tạo một test user ngẫu nhiên, sign in, gọi Auth server để xác thực token, kiểm tra `user_profiles`, sign out rồi xóa user. Không chạy script này trên production nếu không có phê duyệt riêng.

## Request authentication

- Browser gửi Supabase access token qua `Authorization: Bearer ...` cho `/api`.
- Server gọi `auth.getUser(accessToken)`; đây là network verification tới Supabase Auth, không tin JWT/body email do client tự khai.
- `user_profiles` được trigger tạo khi Auth user xuất hiện và được request verifier upsert lại theo chính `auth.uid()`.
- Authorization của workspace dùng UUID `auth.users.id`, không dùng email.
- POST vẫn phải qua same-origin check; API không mở CORS cross-origin.
- Secret key chỉ tồn tại trong server/admin smoke/migration, không nằm trong bundle browser.

## Preview checklist

Sau khi có development Supabase project và cấu hình ba selector target trong Preview:

1. Google sign-in quay lại đúng Preview origin.
2. Refresh trang vẫn restore Supabase session.
3. `/api/auth/session` nhận Bearer token và trả đúng user.
4. Token thiếu/hỏng/hết hạn trả `401`.
5. Sign out xóa session browser; protected API sau đó trả `401`.
6. Kiểm tra consent screen không có Google Drive scope.

Preview thật đã xác minh Google callback về đúng Vercel origin, restore session, đọc workspace đã migrate và không yêu cầu Google Drive scope. Role matrix/RLS remote đầy đủ vẫn cần tài khoản member và outsider riêng.
