# CR-04 — Supabase Auth with Google Behind a Feature Flag

## Mục tiêu

Thêm Supabase Auth Google flow mà không làm mất khả năng rollback về Google Drive OAuth. Chưa chuyển canonical data khỏi Drive ở phase này.

## Prerequisite

- Phase 03 Done.
- Supabase local schema/RLS pass.
- User đã cấu hình hoặc sẵn sàng cấu hình Google provider trong Supabase.
- `AUTH_BACKEND` selector tồn tại.

## Việc phải làm

### 1. Supabase auth adapter

Implement auth contract:

- Load current session/user.
- Google sign-in.
- Sign-out.
- Refresh token/session theo Supabase SDK.
- Auth state change handling.
- Normalize user shape để UI hiện tại ít đổi.

### 2. Google provider

Document/configure đúng:

- Google Client ID/Secret trong Supabase provider settings.
- Authorized origin cho local và production.
- Supabase callback URL từ Dashboard.
- Supabase Site URL và redirect allow list.

Không reuse Drive scopes. Supabase Google login chỉ yêu cầu identity scopes cần thiết.

### 3. API authentication

- Khi `AUTH_BACKEND=supabase`, API nhận Bearer access token.
- Xác thực token/user mỗi request.
- Không tin user ID/email do request body gửi.
- Same-origin/CORS policy vẫn rõ ràng.
- Không dùng secret key trong browser.

### 4. User provisioning

- Khi user đăng nhập lần đầu, tạo/upsert `user_profiles` theo `auth.uid()`.
- Không tự tạo workspace production nếu invitation/shared membership đang chờ mà UX không yêu cầu.
- Email chỉ là thuộc tính; authorization dùng immutable user UUID.

### 5. UI

- Giữ brand/login screen hiện tại.
- Thay implementation qua adapter, không đưa Supabase mặc định UI nếu làm lệch thiết kế.
- Loading/error/logout không tạo loop.
- Hiển thị lỗi redirect/config dễ hiểu.

### 6. Compatibility mode

- Drive auth flow vẫn chạy khi selector chọn `google-drive-oauth`.
- Không được chọn `AUTH_BACKEND=supabase` cùng `DATA_BACKEND=drive` trong production nếu Drive API vẫn cần Google Drive token, trừ một bridge được thiết kế rõ và test. Parser phải cảnh báo/chặn combination không hỗ trợ.

## Test bắt buộc

- Auth adapter unit tests.
- Session restore sau refresh.
- Logout xóa access state.
- Invalid/expired token trả 401.
- User A không được nhận identity User B.
- Drive auth regression khi flag cũ.
- Local Supabase email/test auth nếu Google local chưa cấu hình.

## Không làm

- Không đổi DATA_BACKEND hoặc MEDIA_BACKEND production.
- Không xóa OAuth/Redis code.
- Không migrate members.
- Không dùng service role cho normal user request.

## Acceptance criteria

- Supabase auth hoạt động local/Preview khi flag bật.
- Drive auth hoạt động như trước khi flag tắt.
- Google login redirect quay đúng domain.
- API xác thực Supabase token và RLS user context đúng.
- Không có Drive scope/refresh token mới trong Supabase auth flow.
- Build không leak secret.

## Validation

```bash
npm test
npm run lint
npm run build
git diff --check
```

Manual Preview:

1. Sign in Google.
2. Refresh page, session còn hợp lệ.
3. Sign out.
4. Truy cập protected API bằng token thiếu/hỏng bị 401.
5. Kiểm tra redirect production/preview theo config.

## Handoff bắt buộc

- Google/Supabase dashboard steps còn phải làm.
- Auth modes đã test.
- Supported backend combinations.
- Update `TASK-STATUS.md`: Phase 04 Done hoặc blocker.
