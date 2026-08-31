# CR-05 Threat-linked Test Matrix

| Requirement/threat | Expected result | Executable evidence |
|---|---|---|
| Ciphertext load and schema validation | Reconstruct valid `FamilyData` only after decrypt | `encryptedFamilyRepository.test.ts` |
| Missing/duplicate/extra record | Encrypted manifest reconciliation rejects | `encryptedFamilyRepository.test.ts` |
| Tamper/future/cross-workspace row | Reject before render | `encryptedFamilyRepository.test.ts` |
| Mixed unchanged row versions | Old rows at or below workspace version decrypt | `encryptedFamilyRepository.test.ts` |
| Save/revision conflict/offline | Commit, conflict or explicit offline failure; no fallback | `encryptedFamilyRepository.test.ts` |
| Unknown commit outcome | Recover only exact commit ID and result version | `encryptedFamilyRepository.test.ts` |
| Plaintext on request wire | Names/settings/edits absent from commit DTO | `encryptedFamilyRepository.test.ts` |
| Contact create/update before CR-07 | Phone/email/address/note rejected before encryption/network | `encryptedFamilyRepository.test.ts` |
| Ciphertext store imports plaintext model/API helper | Forbidden structurally | `encryptedFamilyRepository.test.ts` |
| Legacy plaintext kill switch | Encrypted/disabled modes reject legacy path | `encryptedFamilyRepository.test.ts`, `familyRepository.ts` |
| Cross-tab key reuse | Transfer non-extractable key handle; unique tab writer | `workspaceKeySession.test.ts` |
| Workspace/principal/epoch substitution | Key handoff rejected | `workspaceKeySession.test.ts` |
| Initial auth storage race | Refresh recovers persisted Supabase session | `supabaseAuth.test.ts` |
| Concurrent refresh/logout event | One refresh flight; sign-out propagated | `supabaseAuth.test.ts` |
| Synthetic-only migration | Invalid marker/workspace rejected | `syntheticEncryptedMigration.test.ts` |
| Contact/workflow quarantine | Independent counts; no values in ciphertext/checkpoint | `syntheticEncryptedMigration.test.ts` |
| Interrupted resume/idempotency | Same key set resumes; second key set rejected | `syntheticEncryptedMigration.test.ts` |
| Low-entropy source fingerprint | HMAC manifest changes even for legacy email change | `syntheticEncryptedMigration.test.ts` |
| Rollback | Marks stopped and retains ciphertext | `syntheticEncryptedMigration.test.ts` |
| Per-tab writer nonce namespace in DB | Generated AAD writer ID differs from stable principal ID | `encrypted_data_contract.test.sql` |
| Schema migration discovers/mutates data | No DML or workspace discovery | `encryptedRepositoryMigration.test.ts` |

Local tests do not prove Preview browser storage/network panels or Production parity.
