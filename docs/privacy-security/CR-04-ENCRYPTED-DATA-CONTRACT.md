# CR-04 — Encrypted Data and Supabase Contract

## Prerequisite

- CR-01–03 Done.

## Mục tiêu

Thiết kế schema ciphertext/key envelopes và RLS sao cho Supabase phân phối đúng dữ liệu nhưng không đọc được nội dung gia phả.

## Việc phải làm

- Schema cho encrypted entities/chunks, key envelopes, key versions và migration state.
- Plaintext metadata chỉ theo boundary CR-01.
- RLS: member chỉ đọc ciphertext của workspace; wrapped key chỉ recipient đọc được.
- Contact key envelope tách khỏi workspace key envelope.
- Contact/private ciphertext tách thành row/chunk theo enforceable `field_class`; row metadata và canonical AAD bind workspace, person, field class, key epoch và data version. Batch replace toàn contact bundle bị cấm.
- Key directory/envelopes bind issuer, recipient key fingerprint, purpose, graph/binding/policy version và key epoch.
- Principal directory tách encryption-key fingerprint và policy-signing-key fingerprint; RLS không cho key purpose thay thế lẫn nhau.
- Constraints chống duplicate active grant, cross-workspace recipient và stale key version.
- Activity/log không chứa plaintext summary.
- Invitation tokens hash/single-use/expiry/replay protection; URL/referrer/log redaction.
- Reserve signed-policy-authorization schema/RLS cho contact grant và GEDCOM export: artifact hash/signature, issuer signing fingerprint, recipient, scope/purpose, policy/graph/binding version, expiry và nonce; single-use nonce ledger không chứa family plaintext. CR-07/09 triển khai creation/verification theo purpose tương ứng.
- Signed authorization purpose phải phân biệt `contact_view`, `contact_edit` và `portability_export`; possession của wrapped contact key không thay thế edit/export authorization.
- Snapshot/backups không vô tình giữ legacy plaintext sau migration.
- Định nghĩa audited opaque-backup export RPC/capability cho owner: chỉ copy ciphertext rows/blobs và signed envelopes nguyên bản, kể cả absent-recipient envelope; không unwrap/re-wrap, không mở rộng normal read RLS, có re-auth, workspace scope, rate limit và audit metadata không PII.
- Generated types và schema mapping docs.

## Test bắt buộc

- Owner/editor/viewer/outsider RLS matrix; legacy contributor chỉ tồn tại trong migration fixture.
- Recipient A không đọc envelope B.
- Cross-workspace/key-version insert/update denied.
- Legacy plaintext columns không được trả qua new repository.
- Ciphertext tamper được client phát hiện.
- Stale-directory/ciphertext replay, key substitution và downgrade fixtures fail.
- Opaque-backup path trả đủ encrypted artifact nhưng owner không unwrap được contact key ngoài grant của họ; cross-workspace request và modified envelope fail.
- Malicious client có edit authorization chỉ cho `phone` nhưng target `address`/`private_note` row hoặc cố bundle-replace bị server từ chối trước commit dù server không decrypt payload.

## Acceptance criteria

- Snapshot của schema/code path mới trên synthetic/ephemeral Preview không chứa protected plaintext và không đủ key material để giải mã; production legacy exception vẫn tồn tại đến CR-11 và không thuộc claim này.
- RLS và crypto đều cần thiết; bypass một lớp không đủ đọc dữ liệu.
- Chưa migration production.
