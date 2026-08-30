# Target Privacy Architecture

## Nguyên tắc

1. Auth/RLS quyết định ai được tải ciphertext và key envelope.
2. Cryptography quyết định ai thực sự đọc được nội dung.
3. Presentation rule không được dùng thay authorization hoặc key grant.
4. Raw user private key, workspace key và contact key không đi qua Famnesia API.
5. Mọi ciphertext có version, algorithm, nonce, key ID và authenticated context.

## Key hierarchy

```text
Drive Recovery Secret (mỗi user)
  └── mở User Private Key Bundle đã mã hóa trong Supabase
        ├── User Encryption/Unwrapping Key
        │     ├── unwrap Workspace Data Key
        │     │     └── decrypt family-shared payload
        │     └── unwrap Person Contact Keys được cấp
        │           └── decrypt phone/email/address được phép
        └── User Policy Signing Key
              └── ký grant, deny và export authorization thuộc thẩm quyền
```

- `Drive Recovery Secret`: random, nằm trong file app tạo trên Drive của user.
- `User Encryption/Unwrapping Key Pair`: public key lưu Supabase; private key chỉ lưu dưới dạng encrypted blob.
- `User Policy Signing Key Pair`: key purpose riêng, không tái sử dụng encryption/wrapping key; bind portable crypto principal ID và member-person binding.
- `Workspace Data Key`: random symmetric key, wrap riêng cho từng member public key.
- `Person Contact Key`: symmetric key riêng theo person/audience, chỉ wrap cho user được phép.
- Media key riêng được bắt buộc; CR-10 chốt lifecycle, chunk/upload, thumbnail và backup contract, không tái dùng contact key.

Drive không chứa raw workspace/contact key. Supabase không chứa Drive recovery secret. Việc kết hợp hai nguồn diễn ra trên client.

## Identity, authenticity và freshness

- Encrypted envelope bind recipient ID, recipient public-key fingerprint, workspace, purpose, key epoch, issuer và schema/crypto version.
- Workspace key directory dùng chữ ký bất đối xứng của integrity authority riêng; không dùng MAC chung cho reader vì mọi holder của MAC key đều có thể giả mạo directory.
- Owner tạo genesis trust anchor trên client và pin vào Drive/recovery bundle trước khi publish workspace.
- First-member enrollment dùng owner-signed invitation envelope bind `workspace_id`, genesis signing fingerprint, owner portable-principal/signing fingerprint, expiry và nonce. Client-generated invitation commitment nằm trong URL fragment/out-of-band payload mà server không nhận; member phải verify commitment trước khi pin. Nếu commitment channel bị chiếm quyền thì vẫn là residual risk được công bố.
- Rotation bình thường của signing key phải được key cũ và key mới đồng ký. Mất hoặc nghi compromised root yêu cầu explicit re-enrollment của member và workspace key rotation; server không được tự thay trust root.
- Public-key enrollment/change cần explicit confirmation; server không được tự thay key mà client không phát hiện.
- User policy signing key có fingerprint, enrollment, rotation, revocation và recovery lifecycle riêng; signature bind portable principal, binding version và key purpose.
- Client phải phát hiện valid-but-old ciphertext/key-directory rollback và crypto downgrade, không chỉ phát hiện modified ciphertext.
- Recovery bundle giữ signed checkpoint mới nhất để bootstrap và kiểm tra rollback trên thiết bị mới; checkpoint được pin cả ở server và một artifact user-controlled bên ngoài server.
- Nếu server và mọi external checkpoint cùng bị mất/rollback thì client không thể chứng minh tuyệt đối freshness chỉ từ snapshot đó; giới hạn này phải xuất hiện trong claim matrix.

## Plaintext server metadata tối thiểu

- Workspace/user/member IDs và roles.
- Join code/rotation state và join-request status là routing/access-request metadata; không chứa family name và không tự cấp membership/key.
- Membership-person binding ID sau khi owner xác nhận.
- Data version, schema version, ciphertext version, key IDs.
- Commit status, operation IDs, actor IDs và timestamps; không có plaintext operation payload.
- Key-envelope recipient IDs.
- Hash/checksum không cho phép dictionary attack với dữ liệu low-entropy.

Tên, số điện thoại, ngày tháng, note và GEDCOM plaintext không được dùng trong log, activity summary hoặc object filename.

## Encrypted payload strategy

- Family-shared payload có thể chia theo entity/chunk để không phải rewrite toàn workspace mỗi lần sửa.
- Contact payload phải tách khỏi family-shared payload. V1 có thể dùng chung một person-private/contact key cho phone, contact email, address và private note trong mỗi key epoch, nhưng mỗi enforceable field class phải là ciphertext record riêng có immutable plaintext metadata `person_id + field_class + key_epoch`. Field-specific audience/key là CR tương lai; field-specific write enforcement là bắt buộc ngay v1.
- AES-GCM authenticated data phải bind ít nhất: workspace ID, entity ID, field class, schema version, data version và key ID.
- Mỗi encryption invocation dùng nonce duy nhất với cùng key.
- Unknown/legacy ciphertext version fail closed, không tự đoán thuật toán.
- Multi-tab mặc định unlock riêng từng tab; không truyền raw keys qua localStorage hoặc BroadcastChannel nếu chưa có contract được review.

## Contact access policy

Mỗi member phải bind tới một `person_id`. Client của policy principal tính đường quan hệ và tạo grants; Supabase chỉ phân phối wrapped key đúng recipient qua RLS.

- Person đã bind là principal cho contact policy của chính họ; explicit deny của person thắng owner override.
- Với person chưa bind, chưa có account hoặc đã mất, owner là steward.
- Emergency access không thuộc work pack này.
- Tách `contact_view_grant` khỏi signed `contact_edit_authorization`; có key để decrypt không tự tạo quyền sửa.
- Edit authorization do policy principal ký, bind actor, person/field scope, purpose, policy/graph/binding version, recipient signing fingerprint, expiry và contact-key epoch. Server đối chiếu signed scope với ciphertext row target/AAD field class trước khi update; client semantic validation là lớp bổ sung, không phải enforcement duy nhất.
- Mỗi view grant bind policy version, graph revision, binding version, recipient key fingerprint và contact-key epoch.
- Rotation + re-encryption + replacement grants là state machine có fencing/resume; chỉ xóa grant không đủ revoke.

Default deny khi đường quan hệ vượt affinal boundary, ví dụ:

```text
Tôi → anh họ → vợ anh họ → gia đình của vợ anh họ
```

Owner/person có thể dùng custom allowlist/denylist. Thay đổi quan hệ hoặc policy phải re-evaluate grants và rotate contact key khi có người bị loại.

## GEDCOM boundary

- Import file `.ged` 5.5.1 và FamilySearch GEDCOM 7.0 được parse/preview trong browser; patch release 7.0.x được xử lý theo version matrix đã pin.
- V1 từ chối `.gdz`. Với `.ged`, `OBJE`/`FILE` bị bỏ qua có cảnh báo; không tải, fetch hoặc import ảnh.
- Dữ liệu được map sang domain, validate rồi mã hóa trước khi commit.
- Mọi luồng export tích hợp GEDCOM/JSON/Excel yêu cầu authorization record ký bởi policy principal, bind `workspace_id`, `person_id`/scope, recipient principal, format/purpose, policy version, graph revision, expiry và nonce; sau đó client giải mã, áp dụng common field policy, serialize và download trực tiếp.
- Control này ngăn luồng export chính thức hoạt động trái policy, nhưng không thể ngăn một user đã được phép xem plaintext tự sao chép ngoài Famnesia.
- GEDCOM 7 là output mặc định; 5.5.1 compatibility là quyết định có test matrix riêng.
- Extension Famnesia phải có registry/mapping và round-trip test.

## Revocation và recovery

- Remove member chặn API ngay và rotate mọi key còn cần bảo mật về sau.
- Không thể thu hồi plaintext user đã xem/copy.
- Mất Drive secret và recovery kit có thể làm dữ liệu không thể phục hồi; UI phải nói rõ trước khi bật encryption.
- Không có backdoor master key của Famnesia nếu security claim là operator cannot decrypt.

## Self-contained recovery bundle

Phân biệt hai artifact:

- `Per-user recovery backup`: encrypted private-key blob, portable crypto principal ID, public-key fingerprint, envelopes user được nhận và trust/freshness checkpoint để user tái lập danh tính mật mã.
- `Workspace disaster bundle`: chứa chính encrypted family/contact/media records và media blobs cần giữ, không chỉ manifest/reference; signed key directory, mọi retained key envelope, roles/memberships, person bindings, policy/grant versions và workflow metadata tối thiểu để dựng lại tenant.

Bundle không được tạo owner escrow cho contact key của member. Contact ciphertext được giữ nguyên; member khôi phục quyền khi quay lại và chứng minh possession của private key tương ứng với portable crypto principal ID. Phần contact không có holder hợp lệ được báo là chưa thể giải mã, không âm thầm cấp owner key.

Để tạo disaster bundle, owner được gọi một audited opaque-backup export path chỉ trả ciphertext rows/blobs và signed envelopes nguyên bản, kể cả envelope của absent member. Capability này không trả raw key, không unwrap/re-wrap, không bỏ recipient binding và không thay quyền đọc bình thường; response được stream thẳng vào encrypted bundle phía client.

Recovery secret không nằm trong bundle. Failure matrix phải chốt rõ mất Drive, mất Supabase, mất Google account, mất owner account và mất toàn bộ thiết bị: trường hợp nào recoverable, RPO/RTO nào, trường hợp nào bất khả phục hồi.

## Claim boundary

Claim mục tiêu là: một passive snapshot của database, Storage hoặc backup hạ tầng không đủ giải mã protected payload. Không claim chống được malicious frontend update, compromised device/browser hoặc plaintext user đã tự export.
