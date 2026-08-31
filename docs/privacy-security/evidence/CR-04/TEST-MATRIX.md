# CR-04 Threat-linked Test Matrix

| Requirement/threat | Expected result | Executable evidence |
|---|---|---|
| Owner/editor/viewer workspace reads | Read encrypted content | `encrypted_data_contract.test.sql` |
| Outsider workspace read | Zero ciphertext rows | `encrypted_data_contract.test.sql` |
| Viewer/legacy contributor write | Commit denied | `encrypted_data_contract.test.sql` |
| Direct authenticated encrypted DML | No grant / denied | pgTAP plus `encryptedDataMigration.test.ts` |
| Recipient A reads envelope B | Zero rows | `encrypted_data_contract.test.sql` |
| Cross-workspace AAD substitution | Transaction rejected | `encrypted_data_contract.test.sql`, `encryptedDataContract.test.ts` |
| Stale key/directory revision | Transaction rejected | `encrypted_data_contract.test.sql`, `encryptedDataContract.test.ts` |
| Recipient public-key substitution | Transaction rejected | `encrypted_data_contract.test.sql`, key-contract tests |
| Entity/person/field AAD substitution | Parser/database constraint rejects | `encryptedDataContract.test.ts`, crypto-contract tests |
| Crypto version/suite downgrade or tamper | Parser/decryption rejects | `encryptedDataContract.test.ts`, `cryptoContract.test.ts` |
| Contact authorization for `phone` targets `address` | Rejected before row mutation | `encrypted_data_contract.test.sql`, `encryptedDataContract.test.ts` |
| Contact bundle replacement | Operation/parser has no bundle field class/type | `encryptedDataContract.test.ts` |
| Authorization nonce replay | Entire second transaction rejected | `encrypted_data_contract.test.sql` |
| Commit retry with different payload | Server-stored canonical request detects reuse | migration constraint/RPC and structural test |
| Opaque backup omits absent-recipient envelope | Backup contains both recipient fixtures | `encrypted_data_contract.test.sql` |
| Backup capability replay | Second use rejected | `encrypted_data_contract.test.sql` |
| Owner normal RLS expands to all envelopes | No; recipient policy remains unchanged | catalog inspection plus pgTAP recipient matrix |
| Protected plaintext column appears in new schema | Closed schema map has no protected-value columns | catalog inspection and `SCHEMA-MAP.md` |
| Legacy plaintext returned by new repository | CR-05 gate; no repository exists in CR-04 | Explicitly not claimed by this CR |

Local pgTAP exercises PostgreSQL policies and privileges, but it is not evidence that the same migration/configuration is deployed to Production.

