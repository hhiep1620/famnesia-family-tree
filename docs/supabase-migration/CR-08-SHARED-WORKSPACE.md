# CR-08 — Shared Workspace, Invitations, Roles and Draft Approval

## Mục tiêu

Thay Google Drive permission/Picker/Limited Access bằng membership và RLS của Supabase, đồng thời giữ contributor approval workflow.

## Prerequisite

- Phase 07 Done.
- Owner/editor/contributor/viewer policies pass.
- Auth user provisioning ổn định.

## Role contract

| Role | Read | Direct commit | Submit draft | Review draft | Members | Import/restore |
|---|---:|---:|---:|---:|---:|---:|
| owner | yes | yes | optional | yes | yes | yes |
| editor | yes | yes | optional | yes | no | no |
| contributor | yes | no | yes | no | no | no |
| viewer | yes | no | no | no | no | no |

## Việc phải làm

### 1. Workspace creation

- Signed-in user tạo workspace và trở thành owner trong cùng transaction.
- Không tạo workspace rỗng tự động khi user chỉ đang nhận invitation, trừ UX đã quyết định/test.
- Workspace switcher dùng database memberships.

### 2. Invitations

- Owner tạo invite theo normalized email + role + expiry.
- Token lưu hash, không lưu plaintext.
- Invite single-use/idempotent.
- User phải đăng nhập email phù hợp hoặc flow đổi account rõ ràng.
- Accept tạo membership transactionally và revoke invite.
- Revoke/expiry được kiểm tra server-side.

Email delivery có thể out-of-scope MVP: UI cung cấp copy invite link an toàn. Nếu thêm email, không tự thêm nhà cung cấp không được user duyệt.

### 3. Member management

- Owner list/add/change role/remove member.
- Không xóa/hạ quyền owner cuối cùng.
- Không self-lockout nếu không có ownership transfer flow.
- Removal có hiệu lực ngay qua RLS.
- Activity ghi actor/action, không log token.

### 4. Contributor draft

- Contributor tạo/update own draft operations.
- Submit chuyển trạng thái pending và khóa revision payload phù hợp.
- Contributor không sửa submitted draft trong lúc review; có withdraw/resubmit rõ.
- Owner/editor list và đọc submitted drafts.
- Draft A không lộ cho contributor B.

### 5. Review

- Duyệt toàn bộ hoặc selected operations với dependency closure.
- Reject cần reason.
- Approval dùng batch commit transaction ở Phase 06.
- Conflict với canonical mới nhất trả UI resolve, không ghi partial ngoài selected valid closure.
- Ảnh contributor được promote/finalize chỉ khi operation được duyệt.

### 6. Loại bỏ coupling Picker

Khi Supabase modes bật đầy đủ, UI không yêu cầu Google Picker hoặc Drive folder permission. Drive shared flow vẫn giữ cho rollback đến Phase 10.

## Test bắt buộc

- Invitation create/accept/expire/revoke/replay.
- Wrong email denied.
- Owner role protections.
- Role matrix APIs + RLS.
- Contributor A/B draft isolation.
- Editor review allowed; viewer denied.
- Selected approval dependencies.
- Reject reason required.
- Removal immediately denies next request.
- Multi-workspace switch.

## Không làm

- Không guest secret/public share trong core phase.
- Không realtime presence.
- Không production cutover.
- Không xóa Drive Picker yet.

## Acceptance criteria

- Một user mới có thể nhận link, login, join và thấy đúng workspace.
- Không cần Drive permission/Picker trong Supabase mode.
- Role matrix đúng ở UI, API và RLS.
- Contributor workflow end-to-end pass với ảnh và conflict.
- Owner/editor không trở thành bottleneck duy nhất nếu editor được review.
- Drive collaboration regression vẫn khả dụng khi rollback flag.

## Validation

```bash
npx supabase db reset
npx supabase test db
npm test
npm run lint
npm run build
git diff --check
```

Manual test bằng bốn accounts/sessions: owner, editor, contributor và viewer.

## Handoff bắt buộc

- Invitation URL/expiry contract.
- Role/RLS test evidence.
- Draft review evidence.
- Email delivery decision.
- Update `TASK-STATUS.md`: Phase 08 Done, Phase 09 next.
