# CR-08 test matrix

| Area | Evidence | Result |
|---|---|---|
| Target roles and contributor disposition | `shared_workspace_approval.test.sql` | Pass |
| Editor delegation and checkpoint signatures | `collaborationContract.test.ts`, `collaborationBoundary.test.ts` | Pass |
| Owner/editor direct encrypted commit | `encrypted_collaboration.test.sql` | Pass |
| Viewer denial and editor scope | `encrypted_collaboration.test.sql` | Pass |
| Disjoint row merge and same-row conflict | `encrypted_collaboration.test.sql` | Pass |
| Dependency conflict and stale membership/key epoch | `encrypted_collaboration.test.sql` | Pass |
| Idempotent retry and checkpoint result | `encrypted_collaboration.test.sql`, `encryptedFamilyRepository.test.ts` | Pass |
| Contact view/edit separation | `encrypted_collaboration.test.sql`, CR-07 tests | Pass |
| Pending draft non-application and disabled mutation | `shared_workspace_approval.test.sql` | Pass |
| Passive snapshot confidentiality | CR-04/05 encrypted contract tests | Pass locally |

These are structural, cryptographic and synthetic tests. They do not prove deployed Preview/Production parity or resistance to a compromised browser/backend.
