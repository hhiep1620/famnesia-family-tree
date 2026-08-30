# CR-11 — Real-Data Migration, Production Rollout and Audit

## Prerequisite

- CR-01–10 Done trên local/Preview.
- Migration reconciliation và rollback rehearsal pass.
- Independent implementation security review trên Preview pass; mọi Critical và mọi High vi phạm stop condition/security outcome phải đóng trước migration. Chỉ High không thuộc các nhóm này mới có thể được user chấp nhận như residual risk bằng văn bản, kèm scope và expiry/revisit date.
- User cấp explicit Production authorization.

## Mục tiêu

Chuyển workspace hiện tại sang encrypted storage có freeze, backup, observation và independent security review.

## Rollout

1. Xác minh independent review gate và signed review artifact, rồi freeze write; tạo rollback backup ở client và mã hóa ngay bằng one-time migration key được wrap vào owner recovery artifact. Plaintext không đi qua API/log/cache/shared cloud và chỉ tồn tại trong bộ nhớ client trong thời gian cần thiết.
2. Xác minh owner Drive key/recovery kit trước khi mã hóa.
3. Restore rehearsal self-contained bundle vào clean environment.
4. Dry-run migration và reconcile riêng family-shared/contact/media/workflow counts.
5. Migrate từng workspace idempotently; contact dùng CR-07 grants, không workspace-key fallback; không xóa plaintext trước verification.
6. Smoke owner/editor/viewer, legacy-contributor migration, multi-device restore, contact boundary và GEDCOM.
7. Bật encrypted-only write; theo dõi auth/Drive/RLS/decrypt/rotation errors không PII.
8. Sau rollback window và xác nhận riêng, scan rồi purge plaintext trong DB/index/WAL/PITR/Storage/log/cache/backups theo retention/legal decision; artifact rollback cũng hết hạn/purge theo custody contract và có evidence. Ghi rõ bề mặt provider-managed nào không thể purge tức thì và ngày hết retention.

## Audit bắt buộc

- Crypto/key management review độc lập.
- Dependency/SBOM và secret scan.
- RLS/key-envelope penetration scenarios.
- Browser network/log/database/backup plaintext inspection.
- Claim → assumptions → evidence → exclusions matrix và canary scan trên từng persistence/logging surface.
- Web malicious-update limitation được công bố trung thực.
- Recovery và revoke drill.

## Rollback

- Dừng encrypted writes.
- Không bỏ các encrypted revisions phát sinh.
- Khôi phục legacy path chỉ khi có reconciliation/translation plan.
- One-time migration key do owner custody, có TTL, recovery wrapping, access log và destruction evidence; không tự động upload plaintext backup lên shared infrastructure.

## Acceptance criteria

- Không unexplained reconciliation difference.
- Database/Storage/log inspection không thấy protected plaintext.
- Unauthorized/distant member không decrypt contact.
- Owner khôi phục được trên thiết bị mới.
- GEDCOM import/export không ảnh pass; JSON/Excel export dùng cùng signed scope và không bypass contact policy.
- View grant không tự cho phép luồng GEDCOM export tích hợp; không claim ngăn user đã xem plaintext tự sao chép ngoài ứng dụng.
- Security/privacy documentation phản ánh đúng giới hạn thực tế.
- Owner restore chỉ phải mở được own principal và workspace-shared payload họ có grant; absent-member contact ciphertext được bảo toàn nhưng không cấp owner contact key.
- CR-11 chỉ `Done` sau khi rollback artifact và mọi provider-managed plaintext copy hết retention, được rescan/purge có evidence. Trước đó trạng thái là `Observation`, dù encrypted production cutover đã thành công.

## Stop conditions

- Missing owner recovery kit.
- Drive reconnect không ổn định.
- Key rotation/revoke fail.
- Cross-user envelope leak hoặc plaintext leak.
- Chưa có explicit production authorization/audit owner.
- Independent security review chưa pass; còn Critical, còn High vi phạm stop condition/security outcome, hoặc High khác chưa được đóng/chấp nhận theo residual-risk contract.
- Chưa khóa được custody/TTL của rollback backup hoặc retention của provider-managed plaintext surfaces.
