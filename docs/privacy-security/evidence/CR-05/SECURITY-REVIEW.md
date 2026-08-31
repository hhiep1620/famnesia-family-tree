# CR-05 Security Review

Review date: `2026-08-31`. Scope: implementation commit `805ea92` and its local migration state.

## Review result

No open Critical or High finding was identified within the local CR-05 scope after cryptographic boundary tests, repository wire inspection, migration isolation checks, database lint/pgTAP and full application validation.

## Controls confirmed

- The Supabase store accepts ciphertext DTOs only and performs direct encrypted table/RPC calls; it does not import `FamilyData` or the plaintext API body helper.
- Every content envelope binds workspace, opaque entity, class, schema/data version, key ID/epoch, per-tab writer and purpose. Decrypt also checks the keyed opaque ID and encrypted complete-record manifest.
- Root workspace key material is imported non-extractable, raw input bytes are zeroed, no persistence API is used and each tab has a distinct writer subkey/nonce counter.
- Contact/private fields fail before AEAD or network work. Synthetic legacy contacts are counted from raw input, stripped, and quarantined; the keyed source manifest still binds unknown legacy email fields.
- Commit recovery accepts only the requested commit ID and exact next version. Offline/unknown/conflict paths never call the plaintext repository.
- The legacy repository kill switch executes before plaintext workspace discovery or draft initialization. Encrypted mode has no dual-write or automatic legacy fallback.
- The migration SQL adds only contract shape. It performs no DML, workspace discovery or cutover.
- Supabase auth initialization retries a missing initial persisted session, deduplicates refreshes, ignores stale hook refresh completions and propagates sign-out.

## Residual risks and deferred controls

- Local unit tests model tab handoff and auth races; a deployed Preview test with real browser tabs, storage and network inspection remains required before any cutover.
- Workspace envelope signature verification/unwrapping and contact grants depend on CR-03 and future CR-06/07 integration; this repository therefore receives an already verified/unlocked key session and cannot independently unlock a workspace.
- The synthetic repository path intentionally rejects commits above 500 operations. Normal 50,000-person incremental batching/load behavior needs Preview scale proof and later incremental operation integration.
- Same-origin malicious script can observe plaintext already displayed and participate in BroadcastChannel; XSS/device compromise remains outside the passive-server confidentiality claim and still requires normal CSP/dependency controls.
- Legacy plaintext tables and routes still exist in `legacy` mode until CR-11. The kill switch prevents their use only when the encrypted/disabled mode is selected.
- No Production deployment, real data migration or independent security assessment occurred.

## Gate recommendation

Approve CR-05 for its local implementation gate only. Keep Preview multi-tab/network inspection, scale validation, CR-06/07 key-policy integration and CR-11 real migration/cutover as explicit later gates.
