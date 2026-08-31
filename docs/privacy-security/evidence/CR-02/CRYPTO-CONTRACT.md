# Famnesia Cryptographic Contract v1

## Trạng thái và phạm vi

Tài liệu này khóa wire contract cho CR-02. Nó **không** khẳng định dữ liệu production đã được mã hóa: repository/schema/Drive vault/migration lần lượt thuộc CR-03–05 và rollout thật chỉ thuộc CR-11.

Normative keywords `MUST`, `MUST NOT`, `SHOULD` có nghĩa bắt buộc trong implementation v1.

## Algorithm suite

Suite ID: `FAMNESIA-P256-AESGCM-HKDF-SHA256-V1`.

| Mục đích | Primitive | Tham số | Lý do |
|---|---|---|---|
| Content AEAD | AES-256-GCM | nonce 96 bit; tag 128 bit | Web Crypto native; confidentiality + integrity + AAD |
| Key agreement/wrapping | ECDH P-256 → HKDF-SHA-256 → AES-256-GCM | ephemeral sender key; salt 256 bit; purpose-bound info | Platform support rộng; recipient-bound envelope |
| Policy/directory signature | ECDSA P-256 + SHA-256 | Web Crypto raw IEEE-P1363 signature | Purpose separation from ECDH key |
| Fingerprint | SHA-256 over canonical SPKI bytes | prefix `sha256:` + base64url | Stable public-key identity |
| Canonical form | RFC 8785 JCS subset | UTF-8, I-JSON only | Deterministic AAD/signature bytes |
| Recovery derivation | HKDF-SHA-256 | random 256-bit recovery secret; random 256-bit salt; fixed info | Recovery secret is high entropy, never password/email |

Web Crypto is the only cryptographic implementation allowed in application code. No custom cipher, MAC or curve arithmetic. Algorithm identifiers are exact; aliases and unknown versions fail closed.

## Key hierarchy and purpose separation

| Key | ID/purpose | Nơi tồn tại dạng rõ | Rotation trigger |
|---|---|---|---|
| Recovery secret | `recovery:<principal>:<epoch>` | Drive vault + unlocked client memory | Drive/account concern, explicit user rotation |
| User private-bundle KEK | derived, never persisted | unlocked client memory | recovery-secret rotation |
| User unwrapping key pair | `user-unwrap:<principal>:<epoch>` | private only in encrypted bundle/client memory; public in directory | private-key compromise |
| User policy signing pair | `user-sign:<principal>:<epoch>` | same storage boundary, distinct key pair | signing compromise/normal rotation |
| Workspace data key | `workspace:<workspace>:<epoch>` | authorized client memory only | member removal/compromise |
| Person-private/contact key | `contact:<workspace>:<person>:<epoch>` | authorized policy recipients only | audience/policy/binding change removing access |
| Media key | `media:<workspace>:<epoch>` | authorized client memory only | member removal/media compromise |

Raw private/content keys MUST be non-extractable after import/unlock where Web Crypto permits. During first provisioning only, a newly generated private key may be extractable inside one atomic client ceremony: export JWK → encrypt bundle → re-import non-extractable → destroy all references to JWK/extractable handle. The general application API receives only the re-imported handle. Export is otherwise allowed only inside the reviewed encrypted private-bundle/recovery path. Keys, plaintext, recovery material and decrypted JWK MUST NOT enter logs, errors, analytics, URLs, localStorage or BroadcastChannel. ECDSA signature bytes are never identifiers/idempotency keys, so signature malleability cannot create protocol identity; verification is against the canonical signed payload and trusted key.

The portable crypto principal ID is a random 128-bit identifier (`cp_` + base64url), independent of Supabase UUID/email. Rebinding to a new auth UUID requires a server challenge signed by the current policy signing key plus proof that the client can unwrap a challenge envelope addressed to the unwrapping key. Either proof alone is insufficient.

## `EncryptedEnvelopeV1`

```ts
interface EncryptedEnvelopeV1 {
  version: 1
  suite: 'FAMNESIA-P256-AESGCM-HKDF-SHA256-V1'
  nonce: Base64UrlNoPad       // exactly 12 bytes
  ciphertext: Base64UrlNoPad  // ciphertext || 16-byte GCM tag
  aad: {
    workspaceId: OpaqueId
    entityId: OpaqueId
    fieldClass: OpaqueFieldClass
    schemaVersion: PositiveInt
    dataVersion: PositiveInt
    keyId: OpaqueId
    keyEpoch: PositiveInt
    writerId: OpaqueId
    purpose: 'family-content' | 'person-private' | 'contact' |
             'media-manifest' | 'user-private-key-bundle'
  }
}
```

The parser rejects extra/missing fields, padding/non-base64url characters, invalid identifiers, non-positive versions/epochs, wrong nonce size, short ciphertext, unknown version or suite. Decrypt requires an independently expected AAD context; trusting only the envelope’s own AAD would permit a whole-envelope entity swap.

Maximum single envelope plaintext is 8 MiB. Larger media is chunked under the CR-10 media contract, with each chunk independently authenticated and bound to index/count.

## Canonical encoding and AAD

All authenticated/signed objects are restricted to I-JSON and canonicalized with RFC 8785 rules, then UTF-8 encoded. `undefined`, bigint, NaN, infinity, duplicate keys and non-shortest/ambiguous encodings are rejected before crypto. Base64url is RFC 4648 URL alphabet without padding.

AAD is the canonical bytes of the exact `aad` object. Every read supplies expected workspace/entity/field/schema/data/key/epoch/purpose from the repository call site. A mismatch fails before decryption; a modified embedded AAD also fails the GCM tag.

## Nonce allocation and retries

Random-only IV generation across offline/concurrent tabs/devices is not sufficient as an architectural guarantee. Each device/browser profile creates a random 256-bit opaque `writerId` on first unlock and registers it in the signed key directory; duplicate registration is rejected and a new/offline device cannot write until registration succeeds. For every root content key epoch it derives a non-extractable writer AEAD subkey with HKDF-SHA-256: salt = UTF-8 `writerId`; info = JCS `{"keyEpoch":n,"keyId":"…","label":"famnesia:writer-aead:v1"}`. Recipients derive the same subkey from the authorized root key and authenticated `writerId`. Therefore registered writers on different devices use different AES keys.

Within one writer subkey, V1 uses a 96-bit unsigned monotonic counter encoded big-endian as the nonce:

- the counter is allocated atomically in blocks through one IndexedDB read-write transaction shared by tabs for `(writerId,keyId,epoch)`;
- storage reset creates and registers a new writer ID and hence a new subkey; restoring an existing writer identity also restores its authenticated high-water mark and may only resume above it.

Each encryption intent persists `(writerId, keyId, epoch, counter, idempotencyToken, envelope)` before network send. A retry reuses the already-produced envelope; it MUST NOT encrypt again with the same nonce. A new plaintext/change receives a new counter. Counter exhaustion, high-water rollback or inability to durably reserve a block causes `NONCE_STATE_UNAVAILABLE`; create a new writer identity/subkey or rotate the content-key epoch before writing. The encryption helper has no random/default nonce path and requires an allocator-produced nonce.

Application encryption accepts only the opaque/branded `WriterAeadKey` returned by `deriveWriterAeadKey`; a generic `CryptoKey` or root content key is not a valid parameter. The handle carries immutable writer/key/epoch context checked against AAD at runtime. This prevents accidentally applying per-writer counters under a shared root AES key.

Service workers/workers use the same allocator. localStorage/BroadcastChannel may announce invalidation only and never carry raw key/nonce reservation state.

## Wrapped-key envelope and directory

A recipient key envelope binds: version/suite, envelope ID, recipient portable principal ID, recipient unwrapping-key fingerprint, workspace/entity scope, wrapped-key ID/purpose/epoch, issuer principal/signing fingerprint, directory revision, expiry (where applicable), ephemeral P-256 public key, HKDF salt, GCM nonce and wrapped bytes. HKDF `info` is JCS bytes of all routing fields plus `famnesia:key-wrap:v1`.

The issuer signs the JCS envelope excluding `signature`. Verification order is: strict parse → pinned trust chain/directory freshness → issuer key purpose/revocation → signature → recipient/context match → ECDH/HKDF unwrap. Public-key substitution or using a key under the wrong purpose fails.

The authenticated key directory is signed by a dedicated workspace integrity-authority signing key, not a MAC shared with readers. The genesis fingerprint is pinned in the owner Drive vault and recovery bundle. Normal authority rotation requires signatures from both old and new keys over the same transition. A server-provided replacement without the old signature is rejected. Lost/compromised genesis requires explicit member re-enrollment and workspace/content-key rotation; it is not a silent recovery.

Policy signatures for grants, edit/export authorization, member-person binding and checkpoints MUST bind portable principal ID, signing fingerprint, purpose, workspace/scope, policy/binding/graph revision, nonce, expiry and key epoch. Encryption/unwrapping keys cannot authorize policy.

## First enrollment and freshness

Owner creates an invitation document signed by the pinned authority, containing workspace ID, genesis fingerprint, owner principal/signing fingerprint, invitation ID, expiry and nonce. On the owner device, a fresh 256-bit `clientNonce` is generated and commitment `SHA-256(JCS(invitation) || clientNonce)` is stored with the server invitation. The owner sends `invitationId + clientNonce + commitment` in the URL fragment/out-of-band channel; fragments are not sent to the server. The joining client fetches by invitation ID, checks single-use/expiry, recomputes the commitment, verifies owner signature and fingerprint against the committed invitation, and only then pins genesis. Any mismatch/reuse blocks enrollment. The server never supplies `clientNonce` or the pinned fingerprint through the fetch response.

Each accepted mutation advances a signed checkpoint `(workspaceId, revision, directoryRevision, keyEpochs/stateHash, previousCheckpointHash, timestamp)`. Verification starts from the externally pinned checkpoint hash/revision and accepts only an ordered, authority-signed chain where every revision increments exactly by one, directory revision never decreases and `previousCheckpointHash` equals SHA-256 of the domain-separated canonical signed content `{version,purpose,signerPrincipalId,signerKeyFingerprint,payload}` of the prior checkpoint. The raw ECDSA `signature` field is excluded from checkpoint identity and verified separately, so signature malleability cannot create a second chain ID. Authority key purpose/fingerprint/revocation are checked for every link. The latest checkpoint is pinned in Supabase and a user-controlled artifact (Drive/recovery bundle). If sources disagree or a link is missing/invalid, reads may show only a blocking recovery screen; writes/key changes are fenced. If server and every external checkpoint are jointly lost or rolled back, absolute freshness cannot be proven from that snapshot.

## Lifecycle, fencing and garbage collection

- A rotation creates epoch `n+1`, publishes signed transition/envelopes, then sets a `cutoverRevision`.
- Writers at/after cutover MUST use epoch `n+1`; server metadata rejects old-epoch writes. Readers may retain old epoch keys only for explicitly retained history/backups.
- Rotation jobs are idempotent by random operation ID and resume from signed cursor/checkpoint. Re-running cannot create another epoch.
- Normal signing rotation is old/new co-signed. Compromise rotation marks the old key revoked at a revision, forces re-enrollment where chain continuity is unavailable, and rotates affected content keys.
- Recipient public-key rotation rewraps current keys; it does not re-encrypt content. Workspace/contact/media-key rotation creates new ciphertext epoch for future/current canonical state.
- Superseded envelopes/ciphertext are garbage-collected only after all active recipients acknowledge the checkpoint and the configured recovery window expires. Retained backup keys are encrypted in the disaster bundle, scoped by retention and never served as current grants.
- Revocation prevents new access/state. It cannot retract plaintext, screenshots, exports or ciphertext+keys already received.

## Minimal encrypted private-bundle record for CR-03/04

Supabase needs only: `principal_id`, `bundle_version`, `crypto_version`, `kdf_suite`, `salt`, `nonce`, `ciphertext`, `public_unwrap_key`, `public_signing_key`, fingerprints, epochs, `created_at`, `superseded_at`. The encrypted payload contains private JWK material and key history required by policy; it is an `EncryptedEnvelopeV1` with purpose `user-private-key-bundle`, `workspaceId="principal"`, `entityId=<portable principal ID>`, `fieldClass="private-key-bundle"`, `keyId=<recovery KEK ID>`. Recovery KEK uses HKDF-SHA-256 with the random 32-byte recovery secret, random 32-byte salt and exact JCS info `{"label":"famnesia:recovery-kek:v1","principalId":"…","recoveryEpoch":n}`. Derivation returns the same branded, purpose-bound, non-extractable handle accepted by the strict envelope API; application code cannot use it with direct AES-GCM composition or another purpose. Recovery secret is never uploaded.

## Self-contained recovery bootstrap

The JCS manifest is exact-shape `RecoveryBundleManifestV1`:

```ts
interface RecoveryBundleManifestV1 {
  format: 'famnesia-recovery'
  version: 1
  cryptoSuite: 'FAMNESIA-P256-AESGCM-HKDF-SHA256-V1'
  principalId: string
  recoveryEpoch: number
  unwrapFingerprint: string
  signingFingerprint: string
  encryptedPrivateBundleArtifactId: string
  genesisFingerprint: string
  directoryCheckpointArtifactId: string
  freshnessCheckpointArtifactId: string
  artifacts: Array<{
    artifactId: string
    class: 'private-bundle' | 'key-envelope' | 'directory' | 'checkpoint' | 'ciphertext' | 'media'
    ciphertextSha256: string
    byteLength: number
  }>
}
```

Every referenced artifact is physically included in the container; IDs are unique and every included artifact appears exactly once in the manifest. Hashes cover stored ciphertext bytes, never plaintext. Wrapped key envelopes, pinned genesis/directory/checkpoint chain and encrypted content remain in their native signed/encrypted formats. The bundle contains no raw recovery secret or operator escrow key. Bootstrap requires a separate high-entropy recovery credential, verifies manifest completeness/hashes, validates the complete trust/freshness chain, proves signing and unwrapping-key possession, and only then permits auth-UUID rebinding. CR-10 adds container packaging, media chunking, retention and drills without weakening this contract.

## Fail-closed errors

Public errors use fixed codes only: `UNSUPPORTED_CRYPTO_VERSION`, `UNSUPPORTED_CRYPTO_SUITE`, `INVALID_ENVELOPE`, `AAD_CONTEXT_MISMATCH`, `AUTHENTICATION_FAILED`, `STALE_DATA_VERSION`, `STALE_DIRECTORY`, `TRUST_ROOT_MISMATCH`, `KEY_PURPOSE_MISMATCH`, `KEY_REVOKED`, `NONCE_STATE_UNAVAILABLE`, `RECOVERY_PROOF_REQUIRED`. They MUST NOT interpolate user content, keys, provider payloads or raw crypto exceptions.

## Normative references

- [W3C Web Cryptography Level 2](https://www.w3.org/TR/webcrypto-2/)
- [NIST SP 800-38D — AES-GCM](https://csrc.nist.gov/pubs/sp/800/38/d/final)
- [RFC 5869 — HKDF](https://www.rfc-editor.org/rfc/rfc5869)
- [RFC 8785 — JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785)
