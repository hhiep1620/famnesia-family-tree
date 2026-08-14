# CR-02 — Supabase Foundation and Local Environment

## Mục tiêu

Thêm Supabase toolchain, local config, typed clients và env contract nhưng chưa chuyển auth/data/media runtime khỏi Drive.

## Prerequisite

- Phase 01 Done.
- Repository boundary và backend selectors tồn tại.
- Có thể làm local-only nếu chưa có remote Supabase project.

## Việc phải làm

### 1. Toolchain

- Khởi tạo Supabase CLI config trong `supabase/`.
- Pin/use CLI theo cách reproducible; không phụ thuộc global install không được ghi lại.
- Thêm scripts phù hợp, ví dụ local start/stop/reset/type generation, nhưng không phá scripts hiện tại.

### 2. Dependencies

- Thêm `@supabase/supabase-js` tương thích React/Vite và Vercel Functions.
- Không thêm `@supabase/ssr` nếu phase chưa chọn cookie SSR architecture.
- Không cài Clerk.

### 3. Environment contract

Cập nhật `.env.example` và docs:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

Quy tắc:

- Browser chỉ nhận URL + publishable key.
- `SUPABASE_SECRET_KEY`/legacy service-role chỉ ở server và chỉ dùng khi phase yêu cầu.
- Không log key.
- Config Supabase chỉ bắt buộc khi selector tương ứng chọn Supabase.

### 4. Client factories

Tạo factory tách biệt:

- Browser auth client.
- Server user-context client nhận Bearer JWT.
- Admin/migration client chỉ server-side, không được import từ `src/` browser graph.

Không tạo singleton server mang session của request trước sang request sau.

### 5. Health/config diagnostics

- Tạo validation thuần cho Supabase env.
- Có endpoint/diagnostic không nhạy cảm hoặc test để xác nhận URL/config; không trả secret.
- Remote check chỉ thực hiện nếu user cung cấp project.

### 6. Documentation

Tạo `SUPABASE-SETUP.md` mô tả:

- Tạo project và chọn region.
- Lấy Project URL/publishable key.
- Local CLI workflow.
- Env local/Preview/Production.
- Secret handling.
- Chưa đổi production backend ở phase này.

## Không làm

- Không cấu hình Google provider production.
- Không tạo business tables ngoài migration placeholder.
- Không sửa auth UI.
- Không bật bất kỳ Supabase selector nào trong production.
- Không dùng Dashboard remote để tạo schema thủ công.

## Acceptance criteria

- Project build được khi không có Supabase env và backend vẫn là Drive.
- Khi selector Supabase được chọn nhưng env thiếu, server/client báo lỗi cấu hình rõ.
- Browser bundle không chứa secret key.
- Local Supabase config có thể start/reset nếu Docker/runtime sẵn có.
- Setup doc đủ để một agent mới kết nối remote mà không đoán.

## Validation

```bash
npm test
npm run lint
npm run build
npx supabase --version
npx supabase start
npx supabase db reset
git diff --check
```

Nếu local Supabase không chạy vì Docker thiếu, ghi blocker; không giả pass.

## Handoff bắt buộc

- Supabase package/CLI versions.
- Env names đã thêm.
- Local/remote verification nào đã chạy.
- Không tiết lộ giá trị secret.
- Update `TASK-STATUS.md`: Phase 02 Done hoặc blocker.
