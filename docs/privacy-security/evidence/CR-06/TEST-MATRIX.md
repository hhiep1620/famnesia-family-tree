# CR-06 Threat-linked Test Matrix

| Threat/requirement | Expected result | Evidence |
|---|---|---|
| Member self-claim | Pending only; no contact grant | `member_person_binding.test.sql` |
| Viewer/contributor self-confirm | Owner-required denial | `member_person_binding.test.sql` |
| Direct authenticated DML | Privilege denied | pgTAP and migration structural test |
| Missing/cross-workspace target | Proposal denied | `member_person_binding.test.sql` |
| Owner confirmation | Confirmed with next binding revision | `member_person_binding.test.sql` |
| Client-chosen fingerprint | Impossible; values copied from `crypto_principals` | SQL and `memberPersonBinding.test.ts` |
| Duplicate/conflicting active identity | Partial unique indexes reject | Migration and pgTAP flow |
| Rebind | Prior binding superseded only when new binding confirms | `member_person_binding.test.sql` |
| Revoke | No active binding; revision increments | `member_person_binding.test.sql` |
| Stale revision | Transition rejected atomically | `member_person_binding.test.sql` |
| Retry/replay | Same transition is idempotent; one event | `member_person_binding.test.sql` |
| Audit plaintext | Schema/parser contain opaque IDs and fixed reason codes only | `memberPersonBinding.test.ts` |

These local fixtures do not prove deployed Preview identity/session behavior.
