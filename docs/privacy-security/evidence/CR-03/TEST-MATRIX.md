# CR-03 Threat-linked Test Matrix

| Requirement/threat | Expected result | Executable/local evidence |
|---|---|---|
| First-device create | Separate private keys and 256-bit secret; private bundle encrypted | `recoveryBootstrap.test.ts` |
| Second-device restore | AEAD/fingerprint verification; restored private keys non-extractable | `recoveryBootstrap.test.ts` |
| Supabase-only attacker | Encrypted backup has no recovery secret | `recoveryBootstrap.test.ts` |
| Drive-only attacker | Vault has no encrypted private-key bundle/raw content key | `recoveryBootstrap.test.ts` |
| Supabase store loss | Per-user encrypted backup + Drive vault restores identity fixture | `recoveryBootstrap.test.ts` |
| Wrong Drive account | Explicit account mismatch | `googleDriveKeyVault.test.ts` |
| Missing/corrupt/duplicate artifact | No automatic selection or overwrite | `googleDriveKeyVault.test.ts` and strict manifest parser |
| Expired Drive token | `DRIVE_RECONNECT_REQUIRED` before Drive read/write | `googleDriveKeyVault.test.ts` |
| Revoked cached token | Clear cache after 401; next user action uses a fresh token | `googleDriveKeyVault.test.ts` |
| Secret leakage through Famnesia API | All vault calls target Google Drive directly | `googleDriveKeyVault.test.ts` |
| Unknown create outcome/reload | Keep pending record; verify existing vault; create only once | `recoveryVaultCoordinator.test.ts` |
| Confirmed missing vault after failed create | Recheck Drive, then delete only pending state; existing/unknown state is retained | `recoveryVaultCoordinator.test.ts` |
| User skips either download or acknowledgment | Bundle remains `pending_drive` | `recoveryVaultPanel.test.ts`, `recoveryVaultCoordinator.test.ts` |
| Drive trust-pin tampering | Authenticated copy in encrypted private bundle causes restore failure | `recoveryBootstrap.test.ts`, `recoveryVaultCoordinator.test.ts` |
| Public/private key substitution | Restore rejects key-pair mismatch before use | `recoveryBootstrap.test.ts` |
| Server substitutes genesis fingerprint | Commitment/fingerprint mismatch fails | CR-02 `keyContract.test.ts`; vault manifest pins accepted trust only |
| Authenticated user reads/rebinds another user bundle | Forced RLS and immutable identity fields | `cryptoPrivateKeyMigration.test.ts`; real Supabase RLS smoke still required |

Local fetch mocks and SQL inspection do not replace Production OAuth, RLS or browser smoke evidence.
