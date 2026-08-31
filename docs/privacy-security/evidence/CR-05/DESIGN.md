# CR-05 Validated Design — Browser Encrypted Repository and Synthetic Migration

## Understanding summary

- Build a browser-native repository that receives only ciphertext/routing metadata from Supabase, decrypts in memory and validates `FamilyData` before rendering.
- Validate, classify and encrypt every write before calling the CR-04 transaction RPC; Famnesia API routes must not receive family plaintext.
- Keep the legacy repository behind an explicit kill switch. Dual-read is migration-only and dual-write is forbidden.
- Never persist decrypted data or raw/private/content keys in localStorage, IndexedDB, Cache API or service-worker storage.
- Quarantine legacy contact data and reject new contact/private values until CR-06/07 bindings, policy and grants exist; workspace-key fallback is forbidden.
- Run migration only against synthetic/local/ephemeral Preview fixtures with per-class reconciliation, keyed integrity and idempotent resume.
- Repair current multi-tab auth/session restoration as a prerequisite, while treating an authenticated-but-locked workspace separately from logout.

## Assumptions and non-functional requirements

- Target scale is approximately 50,000 people per workspace and CR-04 batches contain at most 500 operations.
- Plaintext exists only in unlocked browser memory. Offline encrypted writes fail explicitly rather than queueing plaintext.
- Supabase browser auth remains the identity/session authority and is expected to persist across tabs.
- An unlocked same-origin peer may transfer non-extractable `CryptoKey` handles through `BroadcastChannel`; no key bytes are serialized or persisted.
- If no unlocked peer exists, the user must unlock through the CR-03 recovery path; this is `WORKSPACE_LOCKED`, not `AUTH_SESSION_MISSING`.
- Owner maintains the contract. Real workspace migration and Production cutover remain CR-11 work.

## Approaches considered

1. **Browser-native encrypted repository — selected.** Direct ciphertext SELECT/RPC calls keep the plaintext trust boundary in the browser and make network assertions testable.
2. **Famnesia API as ciphertext relay — rejected.** Adds DTO/logging surface without improving confidentiality and duplicates authorization plumbing.
3. **Encryption adapter around the legacy repository — rejected.** The existing `FamilyData`/backup/draft interfaces make plaintext fallback and dual-write too easy.

## Architecture

- `WorkspaceKeySession` owns the active principal, non-extractable keys, workspace key epoch and writer nonce allocation in memory.
- `WorkspaceKeyChannel` uses an authenticated workspace/principal-scoped BroadcastChannel request/response handshake to copy non-extractable key handles to another same-origin tab. It never stores key material.
- `EncryptedFamilyCodec` maps `family_profile`, `person_core`, `relationship`, `media_manifest` and `workspace_settings` records, verifies exact AAD/version bindings, and reconstructs `FamilyData` only after complete reconciliation.
- `SupabaseEncryptedFamilyStore` accepts and returns ciphertext DTOs only. It must not import `FamilyData`.
- `EncryptedFamilyRepository` coordinates auth, key session, store and codec. It validates decrypted output and fail-closes on missing/extra/duplicate records.
- `SyntheticMigrationHarness` consumes only an injected synthetic source and checkpoint store. It cannot discover Production workspaces.

CR-05 adds `workspace_settings` to the encrypted entity enum because CR-01 explicitly classifies timezone, locale and duplicate suppressions as ciphertext. The encrypted path never reads these values from legacy plaintext workspace columns.

## Data flow and failure semantics

### Load

1. Restore the Supabase session without treating the initial async state as logout.
2. Reuse an in-memory key session or request a non-extractable handle from an unlocked peer.
3. Read crypto state, directory, the caller's recipient envelope and encrypted records.
4. Verify issuer signature, unwrap, validate AAD/revisions and decrypt.
5. Reconcile record counts/IDs, reconstruct and run `requireValidFamilyData` before returning.

### Write

1. Validate `FamilyData` and reject all non-empty contact/private values with `CONTACT_POLICY_NOT_READY`.
2. Classify shared records and encrypt them for the next data version with the current workspace key epoch.
3. Build a canonical commit request and call `commit_encrypted_workspace` directly through Supabase.
4. Retry only with the identical commit ID/payload. Conflict, stale version, offline or unknown outcome never falls back to plaintext.
5. Encrypted mode disables the current plaintext IndexedDB draft path.

### Migration

- A workspace has one stable key-set identity in its checkpoint. Resume with another key set fails.
- Each data class has source count, encrypted count, quarantine count and keyed reconciliation digest.
- Integrity uses HMAC/keyed digest derived from workspace material; unkeyed hashes of names/dates/contact values are forbidden.
- Contact is quarantined before encryption. Media/workflow classes report independently.
- Rollback marks the run stopped and retains encrypted rows/checkpoints; it never silently reads stale legacy plaintext.
- `VITE_FAMILY_REPOSITORY_MODE` is the central kill switch. Any non-legacy value blocks the legacy API path before workspace discovery, which also prevents the existing plaintext IndexedDB draft flow from starting.

## Auth and multi-tab behavior

- Auth initialization has explicit `loading`, `authenticated` and `anonymous` states plus single-flight refresh.
- Cross-tab SDK events update identity without clearing a valid session during startup races.
- `AUTH_SESSION_MISSING` and `WORKSPACE_LOCKED` are separate errors and UI states.
- Workspace ID may remain in localStorage because it is allowed opaque routing metadata. Decrypted family data and keys may not.

## Test strategy

- Auth: initial restore race, tab event, single-flight refresh, logout propagation and authenticated-but-locked distinction.
- Repository: load/save/conflict/offline/unknown outcome, tamper, stale revisions, missing records and validation after decrypt.
- Privacy: request inspection contains ciphertext only; no plaintext draft/cache writes; no server API call for encrypted family data.
- Key session: non-extractable peer handoff, wrong workspace/principal/epoch rejection and no persistence calls.
- Contact: create/update phone, email, address, note and bundle-style payload fail before encryption/network.
- Migration: per-class reconciliation, keyed digest, interruption/resume, key-set mismatch, isolation, rollback and kill switch.

## Decision Log

| Decision | Alternatives | Reason |
|---|---|---|
| Browser-native Supabase repository | API relay; legacy adapter | Smallest plaintext trust boundary |
| Separate ciphertext-only store | Store accepts `FamilyData` | Enforce network boundary by type and module dependency |
| Non-persistent BroadcastChannel key handoff | Store keys; force logout/unlock every tab | Multi-tab usability without at-rest key material |
| Add `workspace_settings` encrypted class | Legacy plaintext settings; overload profile | CR-01 requires settings ciphertext and explicit schemas audit better |
| Separate portable principal ID from per-tab writer ID | Reuse principal as nonce writer | Each tab needs an independent nonce namespace while authorization remains bound to the stable principal |
| Reject all contact before CR-07 | Workspace-key fallback; partial allow | Prevent irreversible over-broad encryption/grants |
| Synthetic injected migration source | Workspace discovery | Makes real-data migration impossible by construction in CR-05 |
| Metadata-only checkpoint with keyed digest | Plaintext fingerprint | Avoid low-entropy dictionary leakage |
| No encrypted-path offline queue yet | Plaintext IndexedDB draft | No encrypted cache contract exists |
| Repair auth restore separately from key unlock | Treat lock as logout | Preserves identity semantics and diagnoses multi-tab failures correctly |

Design status: `VALIDATED_FOR_IMPLEMENTATION` by owner on `2026-08-31`.
