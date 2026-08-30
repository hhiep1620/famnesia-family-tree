# Famnesia Privacy, Encryption and GEDCOM — AI Agent Work Pack

## Mục đích

Bộ tài liệu này chia chương trình bảo vệ dữ liệu cá nhân của Famnesia thành các change request có thể triển khai và kiểm tra độc lập. Mục tiêu đã khóa:

- Supabase tiếp tục là datastore vận hành, nhưng không giữ payload gia phả dạng rõ.
- Mã hóa/giải mã payload gia phả diễn ra trên client.
- Mỗi người dùng giữ recovery secret trong Google Drive của chính họ; raw workspace key không được lưu trực tiếp trong Drive.
- Thông tin liên hệ dùng khóa riêng để thành viên quá xa về quan hệ không thể giải mã.
- GEDCOM chỉ dùng cho import/export; không import ảnh từ GEDCOM/GEDZIP.
- CR-12–16 bổ sung homepage, onboarding, dashboard, nhập người và Excel; không được làm yếu security contract CR-01–11.

Tất cả tài liệu trong thư mục này là kế hoạch. Chưa phase nào được xem là đã triển khai chỉ vì tài liệu tồn tại.

## Tài liệu nền

1. [01-CURRENT-SYSTEM-AND-THREATS.md](./01-CURRENT-SYSTEM-AND-THREATS.md) — baseline, dữ liệu cần bảo vệ và giới hạn của web E2EE.
2. [02-TARGET-ARCHITECTURE.md](./02-TARGET-ARCHITECTURE.md) — key hierarchy, encrypted records, selective disclosure và GEDCOM boundary.
3. [TASK-STATUS.md](./TASK-STATUS.md) — checklist ngắn phải cập nhật sau mỗi phase.

Nếu source code mâu thuẫn với tài liệu, agent phải dừng, ghi bằng chứng và cập nhật kiến trúc trước khi tiếp tục.

## Thứ tự change request

| Phase | File | Kết quả chính |
|---:|---|---|
| 01 | [CR-01-THREAT-MODEL-AND-BOUNDARY.md](./CR-01-THREAT-MODEL-AND-BOUNDARY.md) | Threat model, phân loại dữ liệu và security claims được phép công bố |
| 02 | [CR-02-CRYPTO-AND-KEY-CONTRACT.md](./CR-02-CRYPTO-AND-KEY-CONTRACT.md) | Crypto envelope, key hierarchy, versioning và test vectors |
| 03 | [CR-03-DRIVE-KEY-VAULT.md](./CR-03-DRIVE-KEY-VAULT.md) | Recovery secret trong Drive, reconnect và recovery kit |
| 04 | [CR-04-ENCRYPTED-DATA-CONTRACT.md](./CR-04-ENCRYPTED-DATA-CONTRACT.md) | Plaintext/ciphertext schema boundary và Supabase RLS cho key envelopes |
| 05 | [CR-05-ENCRYPTED-REPOSITORY-MIGRATION.md](./CR-05-ENCRYPTED-REPOSITORY-MIGRATION.md) | Client encrypted repository và migration harness, chưa migrate dữ liệu thật |
| 06 | [CR-06-MEMBER-PERSON-BINDING.md](./CR-06-MEMBER-PERSON-BINDING.md) | Liên kết tài khoản với nhân vật được owner xác nhận |
| 07 | [CR-07-CONTACT-PRIVACY.md](./CR-07-CONTACT-PRIVACY.md) | Contact key riêng, affinal boundary và custom allowlist |
| 08 | [CR-08-ENCRYPTED-COLLABORATION.md](./CR-08-ENCRYPTED-COLLABORATION.md) | Ba role owner/editor/viewer, editor commit trực tiếp trên ciphertext |
| 09 | [CR-09-GEDCOM-PORTABILITY.md](./CR-09-GEDCOM-PORTABILITY.md) | GEDCOM không ảnh và common export policy cho GEDCOM/JSON/Excel |
| 10 | [CR-10-RECOVERY-BACKUP-MEDIA.md](./CR-10-RECOVERY-BACKUP-MEDIA.md) | Self-contained recovery, encrypted disaster backup và encrypted media |
| 11 | [CR-11-ROLLOUT-AUDIT.md](./CR-11-ROLLOUT-AUDIT.md) | Migration dữ liệu thật, production rollout, audit và observation |

## Product change request

| Phase | File | Kết quả chính |
|---:|---|---|
| 12 | [CR-12-HOMEPAGE-ONBOARDING.md](./CR-12-HOMEPAGE-ONBOARDING.md) | Public homepage, năm giá trị cốt lõi, feature list và entry CTA |
| 13 | [CR-13-FAMILY-CREATION-JOIN-CODE.md](./CR-13-FAMILY-CREATION-JOIN-CODE.md) | Creation wizard và join code mixed-case 8 ký tự |
| 14 | [CR-14-FAMILY-DASHBOARD-MULTI-VIEW.md](./CR-14-FAMILY-DASHBOARD-MULTI-VIEW.md) | Dashboard và bốn view danh sách/cây/mindmap/bong bóng |
| 15 | [CR-15-RELATIONSHIP-AWARE-PERSON-ENTRY.md](./CR-15-RELATIONSHIP-AWARE-PERSON-ENTRY.md) | Form thêm người theo quan hệ và birth-date precision |
| 16 | [CR-16-SIMPLE-EXCEL-IMPORT.md](./CR-16-SIMPLE-EXCEL-IMPORT.md) | Excel một sheet người, normalize và merge vào cây hiện tại |

Không tự chuyển sang phase tiếp theo. Mỗi phase phải có commit/handoff riêng và giữ production trên contract cũ cho đến CR-11. CR-12–16 có thể được phát triển theo dependency ghi trong từng file, nhưng security claim/encrypted write chỉ được bật theo rollout gate CR-11.

CR-05 không được migrate workspace thật. Dữ liệu thật chỉ được migrate ở CR-11, sau khi member binding, contact grants, encrypted direct collaboration và recovery đã hoàn thành.

## Quy tắc cho CR giao diện và tính năng bổ sung sau

CR sản phẩm mới phải khai báo:

- Dữ liệu mới thuộc lớp `server-metadata`, `family-shared`, `person-private` hay `contact-restricted`.
- Ai tạo khóa, ai được cấp key envelope và khi nào rotate/revoke.
- Tách riêng `view permission` và `export permission`; có key để xem không mặc nhiên được export plaintext.
- `Export permission` chỉ kiểm soát luồng export chính thức của Famnesia; không thể ngăn tuyệt đối người đã giải mã để xem tự sao chép dữ liệu ngoài ứng dụng.
- Dữ liệu có được xuất GEDCOM hay là metadata riêng của Famnesia.
- Search, calendar, analytics chạy trên client hay cần index không nhạy cảm.
- UI ẩn dữ liệu có đi kèm cryptographic denial hay chỉ là presentation rule.

Không chấp nhận CR chỉ “ẩn bằng UI” đối với trường cần bảo mật.

## Definition of Done chung

- Trước CR-11, các tiêu chí “không plaintext” chỉ áp dụng code path/schema mới và synthetic/ephemeral Preview surfaces trong phạm vi phase. Production legacy plaintext được ghi là exception chưa bảo vệ, giữ nguyên cho rollback và không được dùng để claim mục tiêu đã đạt.
- Acceptance criteria và negative tests của phase đạt.
- Không plaintext family/contact data trong database, logs, analytics, filenames hoặc error payload ngoài boundary đã duyệt.
- Mỗi security claim có assumptions, evidence và exclusions; không dùng từ “backend compromise” chung chung.
- Không key/secret mới trong Git, `VITE_*`, localStorage hoặc telemetry.
- `npm test`, `npm run lint`, `npm run build` và `git diff --check` pass, hoặc blocker được ghi chính xác.
- Migration có rollback và không làm mất dữ liệu hiện tại.
- `TASK-STATUS.md` và handoff được cập nhật.

## Artifact và evidence contract

Mỗi phase tạo `docs/privacy-security/evidence/CR-XX/README.md` làm canonical handoff và link mọi artifact của phase (inventory, diagram, schema, truth table, version matrix, test vector, log đã redacted và review decision). `TASK-STATUS.md` phải link tới README này cùng commit hash; không rải evidence chỉ trong chat hoặc temporary output. Secret, raw key, plaintext family/contact và production token không được đưa vào evidence.
