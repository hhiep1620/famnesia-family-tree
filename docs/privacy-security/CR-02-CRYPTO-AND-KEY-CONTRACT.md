# CR-02 — Cryptographic and Key Contract

## Prerequisite

- CR-01 Done.

## Mục tiêu

Định nghĩa crypto envelope ổn định, versioned và testable; application code không tự ghép primitive tùy ý.

## Việc phải làm

- Chọn Web Crypto primitives được review: authenticated symmetric encryption, user key wrapping và KDF nếu cần.
- Định nghĩa key IDs, key purpose, key version, nonce generation, authenticated data và encoding.
- Chốt canonical encoding cho AAD/envelope và nonce allocation an toàn khi concurrent tab/offline retry.
- Tạo `EncryptedEnvelopeV1` typed schema; unknown version fail closed.
- Key hierarchy: recovery secret → encrypted user private-key bundle → tách riêng encryption/unwrapping key và policy signing key → workspace/contact/media keys và signed policy artifacts.
- Không dùng user password/email làm encryption key trực tiếp.
- Không reuse nonce với cùng symmetric key.
- Định nghĩa rotation, rewrap, revoke và idempotency.
- Phân biệt recovery-secret rotation, user-key compromise, recipient public-key rewrap, workspace/contact/media key rotation và retained backup keys.
- Định nghĩa epoch, cutover revision, write fencing, resumability và garbage-collection window; revoke chỉ ngăn trạng thái mới, không thu hồi plaintext/lịch sử đã nhận.
- Định nghĩa authenticated key directory dùng chữ ký bất đối xứng của integrity authority riêng; không dùng shared-reader MAC.
- Pin genesis owner/workspace signing fingerprint trong Drive/recovery bundle; normal rotation phải old/new co-sign, còn lost/compromised root phải explicit member re-enrollment và workspace rekey.
- Chốt first-enrollment ceremony: owner-signed invitation envelope + client-generated commitment trong URL fragment/out-of-band channel; không cho server tự cung cấp toàn bộ trust inputs trong cùng một phiên.
- Tách portable crypto principal ID khỏi Supabase auth UUID để restore/migrate tenant có thể bind lại bằng proof of key possession.
- Policy signing key là per-user key purpose riêng, bind portable principal/member-person binding và có enrollment/rotation/revocation/recovery contract; cấm dùng encryption/unwrapping key để ký.
- Định nghĩa external freshness checkpoint, hành vi khi checkpoint không đồng thuận và giới hạn khi cả server lẫn mọi checkpoint user-controlled cùng mất.
- Định nghĩa minimal Supabase contract cho encrypted user-private-key blob để CR-03 không phụ thuộc vòng vào CR-04.
- Định nghĩa self-contained recovery bundle bootstrap contract ngay ở phase này; CR-10 chỉ hoàn thiện retention/drills.
- Tạo deterministic test vectors cho envelope parsing và negative tamper tests.
- Review dependency/supply-chain; ưu tiên platform Web Crypto và không tự viết cipher.

## Test bắt buộc

- Encrypt/decrypt round-trip unicode và payload lớn giới hạn cho phép.
- Wrong key, modified ciphertext/tag/AAD/nonce/key ID đều fail.
- Cross-workspace/entity ciphertext swap fail.
- Public-key substitution, stale valid ciphertext, key-directory replay và crypto downgrade được phát hiện.
- Shared reader không thể ký directory; old/new signing-key rotation pass, server-only root replacement fail.
- Server thay genesis fingerprint/public key trong first enrollment fail commitment verification.
- Grant/export authorization ký bằng encryption key, signing key cũ đã revoke hoặc key của principal khác đều fail.
- Restore sang auth UUID mới chỉ bind lại principal sau proof of private-key possession.
- Version migration/fail-closed.
- Nonce uniqueness test strategy.

## Acceptance criteria

- Có crypto contract độc lập với UI/repository.
- Raw keys không serialise vào logs/errors/localStorage.
- Security review nội bộ pass trước CR-03/04; artifact gồm threat-linked test vectors, algorithm/key lifecycle table và recovery failure matrix.
