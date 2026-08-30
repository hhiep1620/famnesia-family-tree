# CR-15 — Relationship-Aware Person Entry and Birth Precision

## Prerequisite

- CR-04–08 Done.

## Mục tiêu

Làm lại flow thêm/sửa người để quan hệ được nhập cùng lúc, đặc biệt khi thêm con phải nhìn thấy và chọn được cả bố lẫn mẹ; đồng thời hỗ trợ nhập nhanh chỉ bằng năm sinh mà không tạo sinh nhật giả.

## Form structure

1. Thông tin cơ bản: họ tên, biệt danh, giới tính, ngày/năm sinh, trạng thái sống/mất.
2. Quan hệ gia đình: bố, mẹ, vợ/chồng và context người liên quan.
3. Thông tin riêng/contact: theo CR-07, không render nếu thiếu view grant và không edit nếu thiếu signed edit authorization.
4. Ghi chú/ảnh và trường mở rộng.

## Data classification

- Name, nickname, gender, birth/death, precision và relationships: family-shared protected payload.
- Phone/address/contact email: contact-restricted; note riêng: person-private; ảnh: media.
- Form state là plaintext tạm trong browser memory; không analytics/autosave plaintext. Offline draft chỉ được phép khi có encrypted-cache contract.

## Relationship entry

- Khi mở `Thêm con` từ person card, form luôn hiển thị hai selector `Bố` và `Mẹ`; source gender `male` preselect Bố, `female` preselect Mẹ. Với `unknown/other`, bắt user chọn vai `Bố/Mẹ` trước khi preselect; không tự suy đoán.
- Hai selector có search, avatar, năm sinh và relation hint để phân biệt trùng tên.
- Cho phép `Chưa rõ/không có trong cây`; ít nhất một parent phải được chọn khi action là `Thêm con`.
- Có action inline `Tạo người còn thiếu`, nhưng người mới chỉ được ghi khi user xác nhận toàn form.
- Generic `Thêm người` cũng cho chọn bố/mẹ/vợ-chồng; nhiều spouse phân biệt status và thứ tự.
- Không hard-block theo giới tính: mismatch giữa label bố/mẹ và gender chỉ cảnh báo/xác nhận vì dữ liệu có thể unknown/other hoặc chưa chuẩn hóa.
- Cấm cùng một person làm cả bố và mẹ, tự-parent, ancestry cycle, cross-profile relation và duplicate relation.
- Create/update person cùng mọi relation là một idempotent encrypted transaction; lỗi không để orphan person/relation.

## Birth-date precision

- Thay raw sentinel date bằng canonical structured partial date: `{ year, month?, day?, precision: 'day' | 'month' | 'year' }`; unknown là `null`. Precision tách biệt `birthDateConfidence`.
- UX hiển thị day/month mặc định `01-01` khi user bắt đầu từ năm, nhưng hai control ở trạng thái `ước lệ/chưa xác nhận`. Nếu user chỉ nhập/paste/autofill năm và không bật xác nhận ngày/tháng, storage chỉ giữ `{ year, precision: 'year' }` — không lưu 01-01 như fact.
- User chọn rõ `Chỉ biết năm`, `Biết tháng` hoặc `Biết đủ ngày`; mode là nguồn sự thật, không suy precision chỉ từ việc control từng bị chạm. `Biết tháng` lưu year+month; `Biết đủ ngày` validate cả ba phần.
- UI card/detail chỉ hiển thị phần chính xác: `1990`, `05/1990` hoặc `01/05/1990`.
- Tuổi hiện tại có thể tính theo năm khi precision `year`; birthday reminder chỉ tạo khi precision `day`. Không tạo sinh nhật 01/01 giả.
- GEDCOM export dùng `YYYY`/`MMM YYYY`/full date theo precision; Excel/JSON round-trip giữ precision.
- Inventory và migrate mọi date consumer: calendar/reminder, age, analytics/KPI, search, sort/filter, duplicate detection, tree card, JSON/Excel/GEDCOM và tests. Các consumer phải dùng shared partial-date API; cấm đọc raw compatibility string trực tiếp.
- Backfill legacy ISO birth date thành precision `day`; chỉ hạ xuống `year/month` qua explicit import/user correction, không đoán mọi `01-01` cũ là sentinel.

## Edit semantics

- Sửa bố/mẹ hiển thị diff quan hệ sẽ thêm/xóa trước khi lưu.
- Nếu thay parent làm thay đổi kinship/contact audience, chạy preview/re-evaluation CR-07 và key rotation trước cutover.
- Editor commit trực tiếp theo CR-08 nhưng vẫn phải qua conflict/version validation.

## Test bắt buộc

- Add child từ father/mother/unknown-gender context; spouse suggestion và optional unknown parent.
- Add/edit both parents, multiple spouse, duplicate names, missing relation, cycle/cross-profile rejection.
- Atomic failure/retry không tạo duplicate person/relation.
- Year-only UI mặc định 01-01 nhưng storage chỉ có `{year, precision=year}`; hiển thị `YYYY`, tính tuổi theo năm và không tạo event 01/01.
- User sửa ngày/tháng chuyển precision đúng; JSON/Excel/GEDCOM round-trip.
- Contact audience preview/rotation khi đổi parent; unauthorized editor không sửa restricted fields.
- Static search/test chứng minh calendar, dashboard, analytics, search, sort/filter và import/export không dùng sentinel/raw date bỏ qua precision.

## Acceptance criteria

- User có thể thêm một người và quan hệ bố/mẹ/vợ-chồng trong một flow rõ ràng.
- Dữ liệu thiếu ngày/tháng không bị biến thành ngày sinh xác nhận sai.
- Person và relationships luôn commit nhất quán trong cùng revision.
