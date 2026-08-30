# CR-10 — Recovery, Encrypted Disaster Backup and Media

## Prerequisite

- CR-03–09 Done.

## Mục tiêu

Đảm bảo user có thể phục hồi dữ liệu mà không tạo backdoor cho Famnesia; hoàn thiện encrypted media contract đã được CR-01 khóa.

## Việc phải làm

- Tạo `per-user recovery backup` chứa encrypted private-key blob, portable crypto principal ID, public-key fingerprint, retained envelopes và signed freshness/trust checkpoint; không chứa recovery secret hoặc raw keys.
- Tạo `workspace disaster bundle` chứa chính encrypted family/contact/media records và media blobs cần giữ, signed key directory, retained envelopes, roles/memberships, person bindings, policy/grant versions và workflow metadata; manifest chỉ để kiểm kê/integrity, không thay thế ciphertext/blob.
- Bundle builder dùng audited opaque-backup capability của CR-04 để copy nguyên ciphertext/envelope của absent member mà không cấp owner contact grant; client stream kết quả thẳng vào encrypted bundle.
- Không tạo owner escrow cho contact key của member. Giữ contact ciphertext và envelope gốc; khi restore, member bind lại bằng proof of private-key possession. Phần không còn holder hợp lệ phải được báo là unrecoverable/pending member return.
- Recovery kit và restore trên thiết bị mới; checksum/tamper detection.
- Workspace owner recovery policy: không có operator master key.
- Key rotation history tối thiểu để mở backup theo retention đã định; revoked member không được nhận backup/envelopes mới, nhưng lịch sử họ đã có không thể thu hồi.
- Media: client encrypt trước upload và decrypt sau download; media key riêng. Thumbnail server-side không hoạt động trên ciphertext nếu không có trusted processor, nên tạo thumbnail client-side rồi mã hóa riêng.
- Filename, caption, EXIF và dimensions classification phải theo CR-01; strip EXIF mặc định nếu không có lý do giữ.
- GEDCOM import tiếp tục không import ảnh, bất kể media decision.
- Delete account/workspace, Drive key deletion và retention contract.
- Disaster drills theo failure matrix: mất Supabase, mất Drive, mất Google/owner account, mất mọi thiết bị và revoked member; ghi RPO/RTO/recoverable/unrecoverable.

## Test bắt buộc

- Backup/restore cross-device.
- Restore vào tenant/Supabase project trống chỉ từ user-owned bundles + Drive/recovery kits; tái tạo roles, memberships, bindings, signed directory, envelopes và policies trước khi mở write.
- Wrong/missing key fail closed.
- Old backup với rotated key theo retention contract.
- Media luôn là ciphertext; signed URL chỉ trỏ ciphertext và không để lộ plaintext media/thumbnail.
- Recovery artifacts không chứa contact plaintext.
- Tampered/replayed/old manifest, missing identity và revoked envelope fail theo contract.
- Multi-member clean-tenant restore giữ contact ciphertext nhưng không cấp owner khả năng giải mã contact của member; returning member reclaim sau proof of key possession.
- Opaque-backup capability cross-workspace/modified-request denied; response inspection không chứa raw key/contact plaintext và owner không unwrap được absent-member contact envelope.

## Acceptance criteria

- User có đường recovery đã thử nghiệm.
- UI nói rõ trường hợp không thể recovery.
- Media privacy claim khớp implementation thực tế.
