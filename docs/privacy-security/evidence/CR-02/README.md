# CR-02 Evidence — Cryptographic and Key Contract

## Scope

CR-02 freezes the platform-Web-Crypto contract, typed content envelope, key hierarchy, nonce/retry rules, trust/freshness/recovery contracts and synthetic known-answer tests. It deliberately does not add a Drive vault, Supabase encrypted schema, repository migration or production encryption.

## Artifacts

- [Cryptographic contract](./CRYPTO-CONTRACT.md)
- [Test vectors and threat-linked matrix](./TEST-VECTORS.md)
- [Recovery failure matrix](./RECOVERY-FAILURE-MATRIX.md)
- Typed implementation: [`src/crypto/contract.ts`](../../../../src/crypto/contract.ts)
- Executable vectors: [`test/cryptoContract.test.ts`](../../../../test/cryptoContract.test.ts)
- Key/trust/recovery vectors: [`test/keyContract.test.ts`](../../../../test/keyContract.test.ts)

## Locked decisions pending owner approval

1. V1 suite is P-256 ECDH/ECDSA, HKDF-SHA-256 and AES-256-GCM through Web Crypto.
2. JCS/I-JSON UTF-8 is the canonical authenticated/signed representation.
3. Each device writer derives a distinct AEAD subkey; within that writer a durable 96-bit monotonic counter allocates nonces, and retries reuse persisted ciphertext.
4. Encryption/unwrapping and policy signing use separate user key pairs; portable principal ID is independent from Supabase auth UUID.
5. Genesis trust is pinned outside the server; normal root rotation is old/new co-signed, while lost/compromised root requires explicit re-enrollment and content rekey.
6. Recovery has no operator master key and may result in permanent/partial loss under the documented matrix.

## Validation record

Validated at `2026-08-31T02:50:09Z`:

- `npm test`: 31 files / 147 tests pass; CR-02 target tests 19/19 pass.
- `npm run lint`: pass.
- `npm run build`: pass; existing non-blocking Vite chunk-size warning only.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities.
- `git diff --check`: pass.
- Fresh-context reader test: `PASS` after nonce/key-envelope/freshness/rebind clarifications.
- Internal security review: `PASS` after signed envelope, branded keys, signature-independent checkpoint IDs and strict recovery-envelope fixes.

No crypto dependency was added; implementation uses platform Web Crypto. Local vectors/reviews prove the frozen CR-02 contract and synthetic behavior only; they are not a production security audit or proof of browser/Drive/Supabase integration.

## Gate

Status: `AWAITING_OWNER_APPROVAL`. Do not begin CR-03 until owner approval is recorded here.
