# CR-05 Evidence — Client Encrypted Repository and Synthetic Migration

## Scope and outcome

CR-05 adds a browser-native ciphertext repository, in-memory workspace-key sessions, cross-tab non-extractable key handoff, a synthetic-only migration harness, contact quarantine and an explicit legacy plaintext kill switch. It also hardens Supabase auth restoration so opening or switching tabs does not convert a recoverable session race into logout.

No real workspace was read or migrated. No Preview or Production deployment was performed. The legacy path remains the default until a separately approved cutover.

Implementation commit: `805ea92`.

## Artifacts

- [Validated design and Decision Log](./DESIGN.md)
- [Threat-linked test matrix](./TEST-MATRIX.md)
- [Migration audit](./MIGRATION-AUDIT.md)
- [Security review](./SECURITY-REVIEW.md)
- Client codec and key session: `src/crypto/encryptedFamilyCodec.ts`, `src/crypto/workspaceKeySession.ts`
- Ciphertext repository/store: `src/services/encryptedFamilyRepository.ts`, `src/services/encryptedFamilyStore.ts`
- Migration harness: `src/migration/syntheticEncryptedMigration.ts`
- Database adjustment: `supabase/migrations/20260831000300_encrypted_repository_contract.sql`

## Locked behavior

1. Family plaintext enters only the codec in unlocked browser memory; the Supabase store contract cannot import `FamilyData`.
2. Load authenticates every envelope, reconciles the encrypted manifest and validates reconstructed `FamilyData` before returning it.
3. Save rejects contact/private values, encrypts all operations and commits with data/key revision fences and an idempotent commit ID.
4. Offline encrypted writes fail explicitly and create no plaintext queue or draft.
5. `VITE_FAMILY_REPOSITORY_MODE=encrypted-synthetic|disabled` blocks the legacy API path before workspace discovery; there is no automatic fallback or dual-write.
6. Migration accepts only an injected `famnesia-synthetic-v1` fixture, binds resume to one keyed source/key-set identity, quarantines contact and retains ciphertext on stop.
7. Auth session and workspace-key lock are separate states. Supabase refresh is single-flight; another unlocked tab may transfer only a non-extractable key handle.

## Validation record

Validated locally at `2026-08-31T13:37:20Z`:

- `npm test`: 42 files / 197 assertions pass.
- `npm run supabase:test`: 6 files / 183 pgTAP assertions pass; the encrypted contract file now has 24 assertions.
- `npm run supabase:lint`: no schema errors.
- `npm run lint`: pass with no warnings.
- `npm run build`: pass; existing non-blocking Vite chunk-size warning only.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities.
- `git diff --check`: pass.

## Evidence boundary and gate

This is local structural, cryptographic, repository and synthetic migration evidence. It does not prove a deployed Preview/Production environment, real multi-account browser behavior, 50,000-person scale, real workspace migration or an independent security audit. Real migration remains prohibited until CR-11 after CR-06–10.

Status: `APPROVED`.

| Owner | Decision | Recorded at |
|---|---|---|
| `hoanghiep.0179@gmail.com` | Approved CR-05 local implementation gate | `2026-08-31T14:50:02Z` |
