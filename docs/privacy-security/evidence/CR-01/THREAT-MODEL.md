# CR-01 Threat Model

## Security objective

Sau rollout CR-11, một passive copy của Supabase database, Storage, provider backup hoặc Vercel log không được đủ để khôi phục family/contact/media plaintext. Thành viên chỉ giải mã lớp dữ liệu mà họ được cấp key. Mục tiêu này không thay thế account security, device security hoặc trust vào JavaScript đang chạy.

## Assets

1. Family graph: identities, names, lineage, relationships và subject.
2. Family-shared life facts: birth/death details, gender và family-visible attributes; private note là person-private.
3. Contact-restricted facts: phone/address và các contact field tương lai.
4. Media: original, thumbnail, caption, EXIF/taken date và person binding.
5. Cryptographic material: recovery secret, workspace/person/contact/media keys, key envelopes, recovery kit.
6. Auth material: Supabase session, invitation token, legacy Google access/refresh token.
7. Infrastructure credentials: Supabase service-role, Upstash token, OAuth client secret, session/token-encryption keys và deployment-admin credentials.
8. Integrity/availability: canonical revision, draft/commit ordering, backup/recovery ability.
9. Account PII/workspace metadata: login email/name/avatar, role, membership, timestamps, access patterns.

## Trust assumptions

- Browser/device/OS của user không bị chiếm quyền tại thời điểm unlock.
- User kiểm tra đúng origin Famnesia và TLS/PKI không bị phá.
- JavaScript bundle được deploy là bundle đã review; CSP/dependency controls giảm nhưng không loại bỏ malicious-update risk.
- Web Crypto implementation và secure randomness của browser hoạt động đúng.
- Supabase Auth xác thực identity đúng; RLS là lớp authorization defense-in-depth, không phải confidentiality khỏi operator.
- Google Drive xác thực đúng user và chỉ trả key-vault file được cấp quyền; Google account compromise nằm ngoài bảo đảm E2EE storage-at-rest.
- Người được cấp plaintext/key có thể sao chép; cryptography không thể thu hồi trí nhớ, screenshot hay export đã tải.

## Attacker matrix

| Attacker/scenario | Target protects? | Mechanism/limit |
|---|---:|---|
| Đọc trộm Supabase DB dump/WAL/PITR/replica | Có, đối với protected payload | Chỉ ciphertext + wrapped keys; metadata vẫn lộ |
| Đọc trộm private Storage/backup object | Có | Client-encrypted media/backup; size/timing/path metadata vẫn lộ |
| Vercel/Supabase operator chỉ có stored artifacts | Có, sau CR-11 | Không có recovery secret/raw workspace key; không áp dụng nếu operator thay JS/runtime để đánh cắp key |
| Attacker có Supabase ciphertext/envelopes **và** đúng Drive recovery secret của cùng user | Không bảo đảm confidentiality cho dữ liệu user đó được cấp | Split-material assumption đã bị phá; private key bundle/workspace/contact envelopes có thể mở theo quyền user |
| Supabase/Vercel operator thông đồng với Google-side/account compromise | Không bảo đảm cho principal bị compromise | Hai trust domains cùng mất; claim “stored artifact alone” không áp dụng |
| Service-role/env compromise + Redis legacy Google tokens trong rollback window | Không bảo đảm legacy Drive plaintext; target Supabase ciphertext vẫn phụ thuộc việc attacker có recovery/key material | Rotate/revoke/purge legacy credentials; shorten rollback window; web deploy credential còn có malicious-JS risk |
| Outsider gọi API/cross-workspace | Có | Auth + RLS + envelope recipient binding + AEAD context |
| Workspace viewer không có contact grant | Có | Không nhận contact key envelope; UI bypass không giúp giải mã |
| Thành viên được cấp family key nhưng không contact key | Có cho contact | Family graph plaintext có thể cho họ biết người tồn tại/quan hệ; contact ciphertext vẫn kín |
| Thành viên hợp lệ export/chụp màn hình rồi bị revoke | Không | Revocation chỉ chặn future key/data access; không xóa bản sao đã có |
| Owner/editor cố ý cấp grant sai, export, corrupt hoặc delete ciphertext trong quyền của họ | Không bảo đảm chống authorized misuse/availability loss | Signed policy/audit/backup tạo accountability và recovery, không biến admin độc hại thành trusted actor |
| Revoked member thông đồng với current member | Không bảo đảm dữ liệu current member được phép xem/chia sẻ | Rotation chặn key mới trực tiếp; cryptography không chặn current authorized recipient tái chia sẻ plaintext/key |
| DB attacker thay ciphertext/đảo record/workspace/replay version cũ | Có nếu contract đúng | AEAD binds workspace/entity/type/version + revision/rollback checks; thiết kế ở CR-02/04 |
| Attacker thay public key/envelope recipient | Phải phát hiện | Identity-bound key registration, authenticated rotation và audit ở CR-02/06 |
| Mất recovery secret nhưng còn unlocked device/private recovery kit | Có thể phục hồi | Re-wrap/restore theo CR-03/10 |
| Mất recovery secret + recovery kit + mọi unlocked device/private backup | Không | Permanent data loss by design; không operator master key |
| Compromised browser extension/device/Google account | Không bảo đảm | Có thể đọc memory/Drive secret/keystroke; cần endpoint/device security |
| Operator phát hành malicious JavaScript | Không bảo đảm tuyệt đối | Web origin có thể lấy key sau unlock; transparency/CSP/reproducible build giảm rủi ro |
| XSS/dependency supply-chain trong app | Không bảo đảm nếu chạy cùng origin | CSP, Trusted Types nếu khả thi, dependency pin/audit, no third-party scripts; vẫn là critical residual risk |
| Traffic observer | Nội dung có TLS + ciphertext; metadata lộ | IP, timing, object sizes, routes và account access pattern có thể lộ |
| Denial of service/delete ciphertext | Không bảo đảm availability tuyệt đối | Encrypted backup/recovery; provider/account availability vẫn là dependency |

## Misuse cases bắt buộc test ở các CR sau

- Viewer sửa UI/HTTP để yêu cầu contact ciphertext/key không được cấp.
- Ciphertext của person A được gắn sang person B/workspace khác.
- Server trả old ciphertext + old envelope để rollback trạng thái đã revoke.
- Member bị remove vẫn dùng cached key để đọc ciphertext mới hoặc ciphertext cũ đã tải.
- Invite token bị lộ qua history/referrer/log và replay bởi email khác.
- Error/validation payload phản chiếu tên, phone, note, raw key hoặc plaintext import row.
- Draft/backup/activity/media thumbnail giữ plaintext sau canonical migration.
- Search/calendar/analytics gửi derived family facts sang telemetry.
- Recovery file Drive hoặc Supabase envelope riêng lẻ tự đủ giải mã.
- Import/export chạy qua server hoặc lưu plaintext temporary object ngoài ý muốn.

## Residual privacy leakage được chấp nhận có điều kiện

Ngay cả target vẫn có thể lộ:

- Login email/account avatar, workspace membership và role.
- Số workspace, số encrypted records/objects, ciphertext sizes, revision cadence và access timestamps.
- Invitation target email/status/expiry.
- Opaque member-person binding, việc một opaque person có contact field/grant nào, recipient/policy/key epoch; không lộ value hoặc graph path.
- IP, user agent, route/status/latency trong provider access logs.
- Việc hai user cùng thuộc một workspace.

Không được gọi các metadata này là “anonymous”. Minimize/retention settings phải được audit ở CR-11.

Birth/death/lunar date, deceased status, gender và confidence thuộc `family-shared`: mọi workspace key holder có thể giải mã để chạy tree/calendar/dashboard client-side. Chúng không có audience riêng trong v1; owner phải phê duyệt rõ trade-off này tại CR-01.

## Non-recoverability contract cần owner phê duyệt

1. Famnesia không giữ master key và support/operator không thể reset khóa để đọc dữ liệu.
2. **Normal clean-device recovery** cần Drive recovery secret của user + encrypted private-key bundle/envelopes/checkpoint từ Supabase. Drive file riêng lẻ không chứa raw workspace key và không đủ giải mã.
3. **Supabase-loss recovery** cần per-user recovery backup + workspace disaster bundle + recovery credential/secret tương ứng. Workspace bundle giữ ciphertext và envelopes, không chứa recovery secret.
4. Owner disaster restore bảo toàn contact ciphertext/envelope của absent member nhưng owner không tự giải mã được. Member quay lại phải chứng minh possession của đúng private key; nếu principal/private key của member mất, phần contact đó có thể vĩnh viễn unavailable dù family-shared data của owner phục hồi được.
5. Mất/disable/death owner account không tự chuyển quyền mật mã. Succession cần owner-authorized successor/recovery policy được thiết lập trước; nếu không, administrative control hoặc owner-only key material có thể không phục hồi được.
6. Owner chịu trách nhiệm kiểm thử ít nhất một tổ hợp recovery hoàn chỉnh trên thiết bị sạch trước migration.
7. Nếu mất mọi Drive recovery secret cần thiết, recovery credentials/per-user backups, mọi thiết bị còn unlock và mọi private key holder hợp lệ, toàn bộ hoặc một phần dữ liệu mã hóa có thể mất vĩnh viễn.
8. UI phải nói rõ partial recovery/unrecoverable contact, owner succession và permanent-loss scenarios trước khi migration; không chỉ ghi trong Terms.
9. Support không được yêu cầu user gửi raw recovery secret/private key. Debug artifact không được chứa key/plaintext.

## Revocation contract

- Remove member ngăn API/key-envelope access tương lai.
- Khi threat model yêu cầu ngăn đọc ciphertext tương lai, rotate affected workspace/contact/media keys và re-wrap cho recipients còn hợp lệ.
- Revocation không thể xóa plaintext, screenshot, export, cached ciphertext + key hoặc mirror đã thuộc thiết bị/account của member.
- “Thu hồi quyền” không được quảng bá là “xóa mọi bản sao”.

## Open design delegated to later CRs

CR-01 không chọn algorithm/KDF/envelope format. Các quyết định về algorithm suite, key hierarchy, binding, rotation, recovery file và encrypted schema thuộc CR-02 đến CR-10, nhưng không được làm yếu boundary trong tài liệu này.
