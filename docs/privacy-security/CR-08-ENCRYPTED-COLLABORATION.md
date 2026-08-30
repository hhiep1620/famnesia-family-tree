# CR-08 — Encrypted Direct Collaboration

## Prerequisite

- CR-05–07 Done.

## Mục tiêu

Giữ invitation và cộng tác nhiều người khi server không đọc được payload, với ba role đích `owner | editor | viewer`. Editor hợp lệ ghi trực tiếp, không có role “Editor cần duyệt” và không có owner draft-approval flow.

## Role contract

- `owner`: sửa trực tiếp, quản lý member, policy, backup/restore, workspace và key lifecycle.
- `editor`: sửa trực tiếp family-shared data/media; contact/private chỉ sửa khi có signed edit authorization riêng, không chỉ vì có view key. Editor không quản lý member, restore/delete workspace hoặc tự mở rộng key grant.
- `viewer`: chỉ đọc/decrypt dữ liệu đã được cấp; không commit.
- Legacy `contributor` không được tự động nâng quyền. Khi migrate, mặc định chuyển thành `viewer`; owner phải explicit promote thành `editor` sau khi xem danh sách ảnh hưởng.

## Việc phải làm

- Editor nhận workspace/media/contact grants đúng quyền trước khi edit.
- Editor commit encrypted operations trực tiếp qua cùng transaction pipeline với owner: schema validation phía client, expected revision, idempotent commit ID, dependency closure, backup/activity và conflict handling.
- Server enforce role, workspace, key epoch, expected revision và idempotency nhưng không giả vờ semantic validation plaintext.
- Contact field mà editor không có cả view grant và field-scoped edit authorization phải read-only/omitted; không cho blind overwrite hoặc xóa ciphertext.
- Direct commit khai báo target ciphertext row/field class đã bind AAD; server verify target nằm trong signed edit scope và cấm replace contact bundle nhiều field.
- Member removal/role change chặn session/API ngay, rotate/revoke key phù hợp và fence write bằng membership/key epoch.
- Operation/key-directory dùng signed checkpoint gắn với external/user-controlled anchor của CR-02 để phát hiện valid replay/rollback; hash chain không có authenticated anchor là không đủ.
- Xóa UI/API polling và trạng thái `Draft Inbox`, `draft-submit`, `draft-review`, `needs_changes`, mirror dành riêng contributor sau migration/retention window.
- Pending legacy draft phải được owner export/review hoặc discard trước role cutover; không tự apply.
- Activity ghi actor/operation metadata tối thiểu, không plaintext family/contact.

## Test bắt buộc

- Owner/editor direct commit; viewer denied.
- Hai editor concurrent edit: disjoint operations merge an toàn; conflict cùng entity trả trạng thái rõ và không mất dữ liệu.
- Retry cùng commit ID chỉ apply một lần; network outcome unknown có status lookup.
- Editor không thể quản lý member, restore/delete workspace, tự cấp contact grant hoặc sửa contact họ không decrypt được.
- Removed/demoted editor và stale key epoch không commit được.
- Legacy contributor migration mặc định viewer; chỉ explicit owner promotion mới cho direct edit.
- Inventory mọi role-bearing artifact: pending invitation, join request, cached capability, session claim, mirror state và invitation token. Pending `contributor` invitation/request mặc định revoke hoặc rewrite thành viewer chỉ sau owner confirmation; không bao giờ map ngầm sang editor.
- Pending draft không bị tự apply và draft endpoints bị disable sau cutover.
- Race test invitation phát trước cutover nhưng accept/retry/replay trong hoặc sau cutover không tạo contributor/editor ngoài owner decision.
- Passive database/Storage snapshot không đủ giải mã canonical/operation payload; malicious frontend/backend active attack vẫn là residual risk đã công bố.

## Acceptance criteria

- End-to-end owner/editor/viewer flow pass trên Preview.
- Không còn nhãn hoặc capability “Editor cần duyệt” trong schema đích, API, UI và generated types.
- Direct-edit không làm yếu contact-policy, encryption, audit hoặc optimistic-concurrency contract.
