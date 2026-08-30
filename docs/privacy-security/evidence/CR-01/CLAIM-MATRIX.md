# CR-01 Security and Privacy Claim Matrix

## Quy tắc sử dụng

- Claim target chỉ được công bố sau CR-11 production migration + smoke + independent review evidence tương ứng.
- Trước thời điểm đó, UI/homepage phải dùng future-tense hoặc ghi rõ “đang phát triển”; không mô tả production hiện tại là encrypted/E2EE.
- Mỗi claim phải đi cùng assumptions và exclusions; không rút gọn làm thay đổi ý nghĩa.

## Claim matrix

| Claim | Trạng thái | Assumptions | Evidence gate | Exclusions/wording bắt buộc |
|---|---|---|---|---|
| “Dữ liệu gia đình được mã hóa trên thiết bị trước khi lưu lên Famnesia.” | Target được phép | Workspace đã migrate; mọi write/import/draft/backup/media path dùng encrypted repository | CR-05 tests + CR-10 media/backup + CR-11 production audit | Không áp dụng legacy plaintext/export user tự tải; nói rõ metadata tài khoản/quyền vẫn server-readable |
| “Supabase lưu ciphertext và metadata vận hành tối thiểu, không lưu family payload dạng rõ.” | Target được phép | Schema/RPC/log/backup migration hoàn chỉnh | CR-04 schema inventory + CR-11 DB/Storage/log audit | Không nói Supabase không biết account/workspace membership/access pattern |
| “Bản sao database hoặc Storage đơn lẻ không đủ để giải mã dữ liệu gia đình.” | Target được phép | Không raw key/master key trong server artifact; crypto/key contract đúng | CR-02 vectors + CR-03 split material + CR-11 backup test | Passive stored-artifact threat only; không bao gồm malicious JS/runtime hoặc compromised user device |
| “Mỗi thành viên được cấp quyền bằng key envelope; người không có contact key không giải mã được số điện thoại/địa chỉ.” | Target được phép | Binding/grant/rotation đúng; contact field không nằm trong family ciphertext | CR-06/07 negative tests + CR-11 E2E | Người đã xem/copy trước revoke vẫn giữ bản sao; graph có thể vẫn cho biết danh tính/quan hệ |
| “Recovery secret nằm trong Google Drive của user và một file riêng lẻ không đủ giải mã canonical data.” | Target được phép | Normal recovery kết hợp Drive secret + Supabase encrypted private-key material; disaster recovery dùng bundle + credential riêng | CR-03 vectors + multi-principal/partial recovery drills CR-10/11 | Combined Supabase+Drive compromise có thể giải mã theo quyền user; owner không tự mở contact của absent member; succession phải chuẩn bị trước |
| “Famnesia không có master key để reset và đọc dữ liệu của bạn.” | Target được phép | Không escrow/operator key; support process không thu key | CR-02 key inventory + CR-11 secret scan/process review | Đi kèm cảnh báo mất recovery paths có thể mất dữ liệu vĩnh viễn |
| “RLS/private Storage giới hạn ai được truy cập workspace.” | Chỉ được phép sau live verification | Production config/migrations đúng | CR-11 linked production RLS/Storage smoke; source-local tests không đủ | Đây là access control, không phải encryption khỏi operator/provider |
| “Import GEDCOM được xử lý trong trình duyệt và không upload plaintext.” | Chưa được phép cho đến CR-09 | Parser client-only; telemetry/error safe | CR-09 network negative tests | Export plaintext vẫn rời app theo hành động user; GEDCOM không chứa ảnh |
| “Editor có thể sửa trực tiếp nhưng chỉ trên dữ liệu họ được cấp key.” | Chưa được phép cho đến CR-08 | Target role migration, encrypted commit, grants | CR-08 role/crypto E2E + CR-11 migration | Server role không tự trao contact key; không giữ wording draft-approval cũ |

## Wording cấm

| Không được nói | Lý do | Wording thay thế |
|---|---|---|
| “Zero knowledge tuyệt đối” | Web operator có thể phát hành JS độc hại; account/metadata vẫn server-readable | “Protected payload được mã hóa trên thiết bị; xem rõ assumptions và giới hạn của web client.” |
| “End-to-end encrypted” không qualifiers | Có thể bị hiểu bảo vệ mọi metadata, malicious client và exports | Chỉ dùng nếu định nghĩa rõ endpoints, payload nào, gate CR-11 và exclusions; ưu tiên wording cụ thể “mã hóa trên thiết bị trước khi lưu”. |
| “Famnesia không thể truy cập dữ liệu của bạn trong mọi trường hợp” | Runtime/JS độc hại, support debug hoặc compromised client có thể thấy plaintext | “Stored server artifacts alone không đủ giải mã protected payload sau migration.” |
| “Dữ liệu được mã hóa theo từng user” | Canonical family data dùng workspace/content keys và per-recipient envelopes, không phải một bản dữ liệu riêng cho mỗi user | “Dữ liệu được mã hóa bằng workspace/content keys; quyền của từng thành viên được cấp qua key envelope.” |
| “Thu hồi quyền sẽ xóa dữ liệu khỏi thiết bị người kia” | Không thể xóa screenshot/export/cache đã có | “Thu hồi chặn truy cập và key mới; không thu hồi được bản sao đã tải/xem.” |
| “Chỉ bạn sở hữu dữ liệu” | Workspace cộng tác, provider metadata/ToS và exports làm claim sở hữu pháp lý phức tạp | “Bạn kiểm soát recovery material và quyền thành viên theo contract đã công bố.” |
| “Không ai ngoài gia đình biết bạn thuộc gia đình nào” | Supabase/Vercel biết workspace membership metadata | “Nội dung gia đình được mã hóa; metadata tài khoản và membership vẫn cần cho vận hành.” |
| “Mã hóa AES nên dữ liệu an toàn” | Tên algorithm không chứng minh key management, integrity, binding, rollout | Nêu security outcome, assumptions, evidence và versioned crypto contract. |

## Homepage wording cho CR-12

Trước CR-11:

> Bảo mật theo thiết kế đang được triển khai: Famnesia hướng tới mã hóa nội dung gia đình ngay trên thiết bị. Phiên bản hiện tại chưa được quảng bá là zero knowledge hoặc end-to-end encrypted.

Sau CR-11 và chỉ khi evidence pass:

> Nội dung gia đình được mã hóa trên thiết bị trước khi lưu. Famnesia vẫn xử lý metadata tài khoản, quyền thành viên và trạng thái đồng bộ; thiết bị bị chiếm quyền hoặc nội dung đã được người nhận sao chép nằm ngoài phạm vi bảo vệ.

## Approval record — nguồn sự thật duy nhất

Mỗi row chỉ chuyển `Pending` thành `APPROVED` sau một message xác nhận rõ của owner. Agent ghi đúng account/identity do owner xác nhận và UTC timestamp; README không giữ checkbox quyết định trùng lặp.

| Decision | Owner | Date | Result |
|---|---|---|---|
| Claim wording và exclusions | `hoanghiep.0179@gmail.com` | `2026-08-30T14:32:09Z` | `APPROVED` |
| Non-recoverability contract | `hoanghiep.0179@gmail.com` | `2026-08-30T14:32:09Z` | `APPROVED` |
| Không dùng “zero knowledge tuyệt đối” | `hoanghiep.0179@gmail.com` | `2026-08-30T14:32:09Z` | `APPROVED` |
| Graph/names/media là protected payload | `hoanghiep.0179@gmail.com` | `2026-08-30T14:32:09Z` | `APPROVED` |
| Birth/death/lunar/deceased/gender/confidence là family-shared cho mọi workspace-key holder | `hoanghiep.0179@gmail.com` | `2026-08-30T14:32:09Z` | `APPROVED` |
