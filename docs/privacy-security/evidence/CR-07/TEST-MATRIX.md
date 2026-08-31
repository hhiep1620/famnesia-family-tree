# CR-07 Threat-linked Test Matrix

| Requirement/threat | Evidence |
|---|---|
| Direct/half/adoptive/step family semantics | `contactPolicy.test.ts`, `TRUTH-TABLE.md` |
| Cousin allowed; cousin spouse/spouse family denied | `contactPolicy.test.ts`, `contact_privacy.test.sql` |
| Multiple blood and affinal paths | `contactPolicy.test.ts` |
| Custom allow/deny; deny precedence | `contactPolicy.test.ts` |
| Unbound member and cyclic graph denied | `contactPolicy.test.ts` |
| Exact signed policy revisions/principal | `contactPolicy.test.ts`, `contact-policy.ts` |
| Authenticated client cannot self-verify grants | `contactPolicyBoundary.test.ts`, pgTAP |
| Per-field independent crypto keys | `contactFieldCrypto.test.ts` |
| Contact plaintext absent from ciphertext/wire | crypto test and pgTAP inspection |
| Atomic initial key/grant activation | `contact_privacy.test.sql` |
| Recipient removal rotates and re-encrypts | `contact_privacy.test.sql` |
| Revoked recipient cannot read old envelope | pgTAP RLS fixture |
| Rotation interruption/retry | missing-set and completed-retry pgTAP paths |
| View grant cannot edit | pgTAP exact authorization fixture |
| Wrong-field/bundle substitution | pgTAP and field-scoped operation types |
| Authorization expiry/replay | pgTAP trusted expiry and nonce ledger |
| Search/analytics/UI derived leakage | `contactPresentation.test.ts` |
| Audience preview and override controls | `contactAudiencePreview.test.ts` |

Local tests do not prove deployed Preview CSP, browser storage/network panels, multi-account sessions or scale.
