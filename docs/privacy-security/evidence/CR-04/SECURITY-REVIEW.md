# CR-04 Security Review

Review date: `2026-08-31`. Scope: implementation commit `6c9827b` and its local migration state.

## Review result

No open Critical or High finding was identified within the CR-04 schema/contract scope after local migration, catalog inspection and negative-path tests.

## Checks performed

- Confirmed all 12 new tables both enable and force RLS; PostgreSQL table-owner behavior is therefore not left at the default non-forced setting.
- Confirmed authenticated has no INSERT/UPDATE/DELETE grant on CR-04 encrypted content, key envelope, policy, nonce, invitation, capability or commit tables.
- Confirmed wrapped-key normal read policy compares `recipient_principal_id` with the authenticated active workspace principal; owner status alone does not expose other recipients' envelopes.
- Confirmed all security-definer entrypoints use `search_path = ''`, fully qualified relations and narrow execute grants. Capability mint is service-role only.
- Confirmed commit locks workspace crypto state and atomically checks role, active principal, crypto/schema version, data/key/directory revision, operation shape, row version, exact AAD, recipient/issuer fingerprints, contact authorization scope, nonce replay and commit-payload identity.
- Confirmed the database stores the complete canonical encrypted request alongside its checksum, so a caller cannot reuse a commit ID with different operations while claiming the same checksum.
- Confirmed private field classes are closed and independent; no contact-bundle operation exists.
- Confirmed opaque backup consumes a short-lived capability under row lock, rate-limits rejected attempts, returns original rows/envelopes, preserves absent recipients and emits metadata-only audit records.
- Confirmed generated types came from the successfully migrated local schema; an existing CR-03 text check constraint is narrowed at its repository boundary before use.

## Residual risks and deferred controls

- CR-04 reserves signed authorization storage and version checks; CR-07/09 still need the trusted creation/signature-verification workflow. Service-role compromise remains a server trust-boundary event.
- CR-05 must ensure plaintext never enters these envelope/request fields and must verify signatures before unwrap. SQL cannot determine whether arbitrary ciphertext was produced from prohibited plaintext logging elsewhere.
- The current legacy repository and plaintext tables remain operational until staged migration/cutover. Claims apply only to the new CR-04 path.
- Local tests do not prove Preview/Production configuration parity, real-browser key custody, independent audit or load behavior.
- Opaque backup reveals routing metadata and all ciphertext to the owner by design, but not absent-recipient content keys under normal envelope RLS.

## Gate recommendation

Approve CR-04 for its local contract gate, while retaining Preview smoke, Production migration and repository cutover as explicit future gates. Do not deploy this migration or start CR-05 under this approval alone.

