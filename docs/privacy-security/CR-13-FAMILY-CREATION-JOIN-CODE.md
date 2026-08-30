# CR-13 — Family Creation Wizard and Join Code

## Prerequisite

- CR-02–08 Done.
- CR này sở hữu route/API `/join/:code`; CR-12 chỉ consume sau khi CR-13 Done.

## Mục tiêu

Tạo một gia đình mới bằng wizard dễ hiểu và cho người thân tìm đúng workspace bằng join link 8 ký tự mà không biến code thành quyền truy cập.

## Boundary đã khóa

- “Gia đình” trong flow join tương ứng một Supabase workspace vì membership/key envelopes được cấp ở workspace scope.
- Homepage create tạo workspace và initial family profile trong một flow. Các profile bổ sung trong cùng workspace dùng chung join code.
- Join code không thay thế email invitation token, đăng nhập, owner approval hay key enrollment.

## Creation wizard

### Bước 1 — Thông tin gia đình

- `Tên gia đình` bắt buộc.
- `Họ gia tộc`, `Quê gốc`, `Mô tả` không bắt buộc.
- Gợi ý URL/code chỉ để chia sẻ; không dùng family name làm code.

### Bước 2 — Bắt đầu dữ liệu

- Chọn một trong ba hướng: `Thêm người đầu tiên`, `Import Excel`, `Để sau`.
- Trước CR-15, `Thêm người đầu tiên` có thể route tới form person hiện hành; CR-15 nâng cấp form nhưng không chặn CR-13 Done.
- `Import Excel` chỉ enable khi CR-16 available; trước đó hiển thị `Sắp có` hoặc ẩn theo capability registry, không mở legacy replace-import.

### Bước 3 — Chia sẻ

- Hiển thị join link, copy và QR nếu QR được triển khai.
- Mời email là tùy chọn, role mặc định `viewer`; owner có thể chọn `editor`.
- Không có toggle public/anonymous trong v1 vì không tương thích target encrypted family access.

## Join-code contract

- Chính xác 8 ký tự, case-sensitive, alphabet `[A-Za-z0-9]` và bắt buộc có ít nhất một chữ hoa, một chữ thường, một chữ số:

```regex
^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])[A-Za-z0-9]{8}$
```

- CSPRNG + rejection sampling; không dùng `Math.random`, timestamp, family name hoặc user ID.
- Server tạo code trong create/rotate transaction để enforce uniqueness; code là case-sensitive routing metadata, không phải family payload hay authorization secret.
- Unique case-sensitive ở database. Collision generate lại trong transaction; không check-then-insert ngoài transaction.
- URL chuẩn: `/join/<code>`. Owner có thể rotate; code cũ hết hiệu lực ngay và route trả lỗi chung.
- Code là routing identifier có entropy giới hạn, không phải bearer authorization secret. Endpoint lookup phải rate-limit, chống enumeration và không trả family metadata cho non-member.

## Join flow

1. Normalize raw code/full URL nhưng giữ nguyên case.
2. Yêu cầu Supabase login nếu chưa có session.
3. Nếu có email invitation hợp lệ cho account, accept invitation rồi chạy key enrollment.
4. Nếu chỉ có family join code, tạo `join_request` pending; không tự cấp membership.
5. Owner chọn `viewer` hoặc `editor`; approval tạo membership và encrypted key envelopes đúng policy.
6. Reject/expired/rotated request không để lại quyền hoặc envelope.

## Schema/API

- `Tên gia đình`, `Họ gia tộc`, `Quê gốc`, `Mô tả` là family-shared protected payload và phải encrypt trước commit; không dùng chúng trong public join lookup.
- Mở rộng encrypted profile schema với `origin`; workspace row chỉ giữ opaque ID/routing metadata, không nhân bản family name dạng rõ để làm selector.
- Join code/rotation epoch/request status là server metadata tối thiểu. Join code không được xuất hiện trong analytics, referrer, exception hoặc activity summary.
- Workspace join-code record có unique case-sensitive constraint, rotation epoch, created/rotated timestamps và trạng thái active.
- `workspace_join_requests`: workspace/user opaque IDs, requested timestamp, status, resolved-by/at và desired role chỉ là request; không chứa family/person plaintext.
- API tách `resolve/request`, `list`, `approve/reject`, `rotate`; owner-only cho quản lý/approve.
- Create dùng client idempotency key và một server transaction nhận encrypted initial-profile envelope; retry không tạo workspace/profile/code thứ hai. Lựa chọn `Import/Để sau` vẫn tạo encrypted empty initial profile hợp lệ.
- Activity dùng opaque IDs và action type, không log raw code/full URL.

## Test bắt buộc

- Property test generator luôn đúng regex và không collision trong fixture lớn.
- Case-sensitive lookup: `aB3cD4eF` khác `Ab3cD4eF`.
- Concurrent create/collision retry chỉ tạo một unique active code mỗi workspace.
- Invalid/expired/rotated/rate-limited code trả generic response; không enumerate family.
- Raw code/full URL/OAuth return-to hoạt động desktop/mobile.
- Join code một mình không cấp RLS row, ciphertext hoặc key envelope.
- Owner approve viewer/editor, reject, duplicate request, revoked member và rejoin.

## Acceptance criteria

- Tạo workspace + profile không để trạng thái nửa chừng; retry idempotent.
- Mỗi workspace có đúng một active join code 8 ký tự và owner rotate được.
- Người có code nhưng chưa được approve không đọc được dữ liệu gia đình.
