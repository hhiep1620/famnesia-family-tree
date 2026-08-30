# CR-16 — Simple Persons-Only Excel Import and Merge

## Prerequisite

- CR-05, CR-07, CR-08, CR-10 và CR-15 Done; production real-data commit chỉ bật sau encrypted-write gate CR-11.
- Active family profile đã được chọn.

## Mục tiêu

Thay template Excel kỹ thuật nhiều sheet bằng một sheet `Danh sách người`, tự gắn vào gia đình hiện tại, tự dựng quan hệ có thể xác định và đưa user qua bước chuẩn hóa/merge trước khi commit.

## Template contract

- Workbook có `Hướng dẫn` và duy nhất một sheet nhập liệu `Danh sách người`; không có `profiles`, `relationships` hoặc `media`.
- Không yêu cầu `profile_id`; import luôn target active family tại thời điểm user mở flow và phải xác nhận lại trước commit.
- Không import ảnh/file/link ngoài.
- Header tiếng Việt, tường minh:

| Cột | Bắt buộc | Quy tắc |
|---|---:|---|
| `Mã người` | Khuyến nghị | Unique trong file; bắt buộc nếu được row khác tham chiếu mà tên không unique |
| `Họ và tên` | Có | Text thuần |
| `Biệt danh` | Không | Text thuần |
| `Giới tính` | Không | Nam/Nữ/Khác/Chưa rõ |
| `Năm sinh` | Không | `YYYY`; tạo precision `year` |
| `Ngày sinh` | Không | `DD/MM/YYYY`; nếu có thì thắng `Năm sinh` và precision `day` |
| `Đã mất` | Không | Có/Không |
| `Ngày mất dương lịch` | Không | `DD/MM/YYYY` |
| `Ngày giỗ âm lịch` | Không | `DD/MM`; chỉ số, không thêm hậu tố tự do |
| `Tháng nhuận ngày giỗ` | Không | Có/Không; chỉ có nghĩa khi đã nhập ngày giỗ âm lịch |
| `Cha (mã hoặc tên)` | Không | Resolve sang row/import hoặc person hiện có |
| `Mẹ (mã hoặc tên)` | Không | Resolve sang row/import hoặc person hiện có |
| `Vợ/Chồng (mã hoặc tên)` | Không | Nhiều giá trị phân cách `;` |
| `Số điện thoại` | Không | Contact-restricted CR-07 |
| `Địa chỉ` | Không | Contact-restricted CR-07 |
| `Ghi chú` | Không | Person-private CR-07 |
| `Vai trò tổ tiên` | Không | `Không` hoặc `Thủy tổ`; map versioned sang `none/founding_ancestor` |
| `Thứ tự anh/chị/em` | Không | Số nguyên dương trong cùng parent set |

Alias header cũ/không dấu có versioned mapping; unknown column được báo và không tự bỏ im lặng.

## Relationship resolution

1. Match exact `Mã người` trong file.
2. Nếu không có mã, match tên normalized duy nhất + năm sinh trong file và active family.
3. Nếu vẫn nhiều hơn một candidate hoặc không tìm thấy, đưa vào `Cần xác nhận`; không tự chọn fuzzy match.
4. Spouse link hai chiều được deduplicate; parent relationship dựng từ cột cha/mẹ.
5. Validate self-link, cycle, cross-profile và duplicate trước preview.

## Import pipeline

1. Upload và security scan hoàn toàn trong browser.
2. Auto normalize header, Unicode, whitespace, gender, boolean, date/precision và phone text.
   Nếu có ngày mất/ngày giỗ nhưng `Đã mất` trống, staging gợi ý chuyển thành `Có` và yêu cầu user xác nhận; không tự sửa âm thầm.
3. Hiển thị staging table theo nhóm `Sẵn sàng`, `Cần xác nhận`, `Lỗi`.
4. User sửa trực tiếp staging rows, map duplicate/relationship và chọn mỗi row là `Thêm mới | Cập nhật | Bỏ qua`.
5. Preview diff tổng: people/relationships/contact changes, warnings và key-policy impact.
6. Tạo encrypted revision checkpoint theo CR-10, rồi encrypt và merge vào active tree bằng một idempotent transaction; không replace toàn family và không tạo/download plaintext backup.

## Duplicate/update policy

- `Mã người` chỉ là local workbook reference trong một import session, không được persist như global identity. Với person hiện có, exact normalized name + birth precision chỉ tạo candidate và user phải xác nhận update.
- Fuzzy match không bao giờ auto-update/merge.
- Update person hiện có phải user xác nhận; blank cell mặc định `không thay đổi`, không xóa field hiện có.
- Xóa field yêu cầu explicit clear marker được document; không dùng ô trống.
- Contact/private cell chỉ được đưa vào transaction khi actor có signed field-scoped edit authorization. Staging mặc định đánh dấu cell không đủ quyền là `Bỏ qua`; user phải xác nhận mọi omission. Nếu còn restricted cell chưa giải quyết, block toàn commit; không split transaction.
- Mỗi contact/private change emit operation tới đúng field-class ciphertext row; import không được gộp nhiều field thành một opaque contact bundle để né server scope check.

## Security

- Workbook được user chọn là plaintext local input; staging state chỉ tồn tại trong browser memory. Mapped name/date/relationship là family-shared, phone/address là contact-restricted và note là person-private.
- Giữ các kiểm tra hiện có: size/row/cell limits, không macro, formula, external link, embedded object hoặc network fetch.
- Spreadsheet formula injection được escape ở template/export và staging render như text.
- Plaintext workbook không gửi lên API/telemetry; parse, normalize và diff trong browser, sau đó encrypt trước commit.

## Test bắt buộc

- Download template mở được trong Excel/LibreOffice/Google Sheets và chỉ có hai sheet đã quy định.
- Vietnamese headers/aliases, Unicode names, year-only/full date, lunar date và multiple spouses.
- Resolve by code/name+year; ambiguous duplicate bắt user chọn.
- Merge vào active family không tạo profile/media, không replace existing people và không đổi family khi active selection thay giữa upload/commit.
- Blank means unchanged; explicit clear; add/update/skip mixed transaction.
- Formula/macro/external link/oversize rejected và no-network assertion.
- Contact unauthorized, cycle, duplicate relationship, interrupted/retried commit.

## Acceptance criteria

- Người dùng chỉ cần điền sheet người với tên trường dễ hiểu.
- Quan hệ rõ ràng được map tự động; trường hợp mơ hồ luôn qua user confirmation.
- Sau import, user có thể chuẩn hóa, thêm mới hoặc cập nhật cây hiện tại trước khi lưu; không còn hành vi replace mặc định.
