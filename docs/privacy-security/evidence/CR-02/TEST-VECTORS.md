# CR-02 Test Vectors and Negative Matrix

All fixed secrets below are synthetic known-answer material and MUST NOT be used outside tests.

## AES-GCM known-answer vector

| Field | Value |
|---|---|
| raw key, base64url | `AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8` |
| nonce, base64url | `ICEiIyQlJicoKSor` |
| plaintext UTF-8 | `Gia phả — Nguyễn 👪` |
| canonical AAD | `{"dataVersion":7,"entityId":"person-test-01","fieldClass":"family-profile","keyEpoch":2,"keyId":"wk-test-01","purpose":"family-content","schemaVersion":1,"workspaceId":"ws-test-01","writerId":"writer-test-01"}` |
| ciphertext + 128-bit tag, base64url | `Yey_0pq37DikXpEXGgA3BfX75WBSa9OfKaSqHHXf7lKmoTEmhLyE5rNVmg` |

Recovery envelope KAT: secret = 32 bytes `0x11`, salt = 32 bytes `0x22`, principal `cp_test`, epoch `1`, nonce = 12 zero bytes, strict `user-private-key-bundle` AAD from the typed envelope, plaintext `private-bundle`; ciphertext+tag is `qPcNiDp4su_cLwybBeFr6_dppGinAuNUFcFjDiRe`. The production KEK is a branded non-extractable envelope key; no raw derived key or direct primitive composition is exposed (all material synthetic/test-only).

Executable source: [`test/cryptoContract.test.ts`](../../../../test/cryptoContract.test.ts).

## Threat-linked matrix

| Threat/requirement | Expected result | Evidence in CR-02 |
|---|---|---|
| Unicode round-trip | exact bytes restored | KAT test |
| payload > 8 MiB | `PLAINTEXT_TOO_LARGE` | boundary test |
| wrong AES key | `AUTHENTICATION_FAILED` | negative test |
| ciphertext/tag or nonce mutation | authentication failure | negative parameterized test |
| AAD/key ID mutation | context mismatch/tag failure | negative test |
| cross-workspace/entity/field swap | context mismatch | negative test |
| valid but stale data | `STALE_DATA_VERSION` | freshness test |
| unknown version/suite/extra fields | fail closed | parser tests |
| canonical property reorder | identical bytes | canonicalization test |
| non-I-JSON number | rejected | canonicalization test |
| concurrent/cross-device nonce allocation | distinct writer subkeys; injective 96-bit counters; no default nonce API | derivation/counter tests; durable IndexedDB allocator integration belongs CR-05 |
| public-key substitution | fingerprint + recipient binding reject | executable key-wrap test; persistent directory integration belongs CR-04 |
| directory replay/root replacement | only contiguous authority-signed chain from pinned content hash accepted; signature bytes do not alter checkpoint ID | executable chain/rotation/identity tests; persistence belongs CR-04/06 |
| shared reader signs directory | wrong public key fails verification | executable signature test; RLS/E2E belongs CR-04/08 |
| old/new normal rotation | dual signature required | executable rotation test |
| first enrollment/server-only root replacement | signature, pinned root, commitment, expiry and single-use required | executable enrollment and rotation tests |
| wrong signing purpose/principal/revoked key | reject before authorization | purpose/principal executable tests; persisted revocation tests belong CR-06/07/09 |
| auth UUID restore | signing + unwrap possession proof both required | executable synthetic rebind proof test; persisted workflow belongs CR-10 |

CR-02 proves the content-envelope primitive and freezes the higher-level contracts. It does not claim that Supabase RLS, Drive, directory persistence, recovery or production migration is already protected.
