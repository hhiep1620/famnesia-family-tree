# Current System and Threat Baseline

## Baseline hiện tại

Famnesia dùng Supabase Auth, Postgres, private Storage và RLS. Domain `FamilyData` hiện gồm profile, person, relationship, media reference và settings; Postgres giữ các trường gia phả ở dạng đọc được. Workspace hỗ trợ owner/editor/contributor/viewer, invitation, transactional commit, draft approval, activity và backup.

Đây là baseline code hiện tại, không phải target role model. Quyết định mới trong CR-08 loại `contributor`/draft approval và chỉ giữ `owner | editor | viewer`, trong đó editor commit trực tiếp.

JSON/Excel là portability contract hiện tại. GEDCOM chưa được parse hoặc serialize.

## Nỗi lo cần giải quyết

Người dùng không muốn nhà vận hành Famnesia, database administrator hoặc kẻ lấy được database backup đọc được dữ liệu gia đình. Ngoài ra, thành viên trong cùng workspace không mặc nhiên được xem mọi số điện thoại, địa chỉ hoặc thông tin riêng của họ hàng xa.

## Tài sản cần bảo vệ

| Lớp | Ví dụ | Mức mặc định |
|---|---|---|
| Identity/workspace metadata | user ID, login email, workspace ID, role, invitation state | Server cần đọc để auth/RLS; login email khác contact email trong gia phả |
| Family graph | người, tên, ngày sinh/mất, quan hệ, gia tộc | Mã hóa client-side |
| Person-private | note riêng, thông tin bổ sung nhạy cảm | Cùng person-private/contact key trong v1; field-level audience khác nhau là CR tương lai |
| Contact-restricted | phone, email, address | Per-person contact key |
| Media | ảnh hiện có, caption, EXIF, thumbnail | Mã hóa client-side bằng media key; GEDCOM import không nhập ảnh |
| Workflow metadata | revision, status, operation ID, timestamps | Chỉ metadata tối thiểu dạng rõ |

## Adversary model

Phải bảo vệ trước:

- Database/backup/Storage bị đọc trái phép.
- Nhân sự vận hành chỉ có quyền hạ tầng nhưng không có user keys.
- Thành viên workspace không được cấp contact key.
- Cross-workspace request và sai RLS.
- Ciphertext/key envelope bị thay thế, replay hoặc đảo giữa entity/workspace.
- Public key bị thay thế, ciphertext hợp lệ cũ bị replay/rollback hoặc crypto version bị downgrade.
- Key bị mất, stale grant và revoke không rotate.

Không thể hứa bảo vệ tuyệt đối trước:

- Thiết bị, trình duyệt hoặc Google account của user đã bị chiếm quyền.
- Thành viên đã xem rồi chụp/copy dữ liệu trước khi bị revoke.
- Nhà vận hành cố ý phát hành JavaScript độc hại để lấy key lúc runtime.

Để giảm giới hạn cuối, cần mã nguồn mở, CSP nghiêm ngặt, dependency review, reproducible build và về dài hạn cân nhắc signed desktop client. Không được quảng bá “zero knowledge tuyệt đối” khi chỉ có web client do cùng nhà vận hành deploy.

## Security outcomes bắt buộc

- Supabase không đủ dữ liệu để tự giải mã family payload.
- Google Drive file riêng lẻ cũng không đủ để tự giải mã.
- Client cần cả recovery secret từ Drive và encrypted key material từ Supabase.
- Encrypted recovery bundle do user sở hữu phải đủ bootstrap khi Supabase bị mất hoàn toàn.
- Một workspace member không có contact key không thể giải mã contact ciphertext, kể cả tự gọi API hoặc sửa UI.
- Import GEDCOM dạng rõ không rời khỏi browser trước khi được mã hóa.
- Mọi export tích hợp GEDCOM/JSON/Excel chỉ chứa dữ liệu nằm trong signed export scope và user hiện tại được phép giải mã.
- Luồng export chính thức kiểm tra quyền riêng với quyền xem. Đây là product-policy/audit control, không phải bảo đảm mật mã chống sao chép sau khi plaintext đã được hiển thị cho user.
