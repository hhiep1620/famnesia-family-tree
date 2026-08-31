# CR-04 Validated Design — Encrypted Relational Contract

## Understanding summary

- Supabase distributes ciphertext and routing metadata but does not receive protected family/contact/media plaintext or raw content keys.
- The target schema separates family-shared entities, field-scoped private/contact rows, recipient-bound key envelopes, the principal directory and signed policy authorizations.
- RLS and cryptography are independent controls: workspace membership permits ciphertext reads, while recipient-bound envelopes determine who can decrypt.
- Owner/editor may commit family-shared encrypted rows; viewer is read-only. Contact writes additionally require a verified signed authorization for the exact person and field class.
- CR-04 creates the schema, transaction/RLS contract, generated types, client-side parsers and synthetic tests. CR-05 connects the encrypted repository and migration harness.
- Legacy plaintext remains until CR-11 and is explicitly outside the encrypted-path claim. CR-04 does not migrate or deploy Production data.

## Assumptions and non-functional requirements

- Correctness and auditability take priority over minimizing table count.
- Target scale is tens of thousands of people per workspace. Rows are indexed by workspace/entity/field and mutations do not rewrite a whole-family blob.
- Stable opaque IDs, versions, purposes, hashes and timestamps may remain plaintext; names, dates, contacts, notes and operation payloads may not.
- Every encrypted mutation is atomic, version-fenced and idempotent by operation/commit ID.
- Direct authenticated DML is denied for encrypted content and routing tables; reviewed RPCs perform mutations.
- A passive database/storage snapshot must not be sufficient to decrypt protected content. Malicious frontend code, compromised devices and plaintext already viewed/exported remain outside the claim.
- Local structural tests are not Production RLS, scale or deployment evidence.

## Approaches considered

1. **Relational ciphertext contract — selected.** Separate typed tables allow PostgreSQL to enforce workspace, recipient, key purpose, epoch and private field scope.
2. **Generic encrypted-artifact table — rejected.** It reduces migrations but moves critical type/scope checks into polymorphic triggers and weakens auditability.
3. **Workspace-level encrypted chunks — rejected.** It cannot enforce contact field scope or support efficient partial concurrency without redesign.

## Final architecture

### Identity and directory

- `crypto_principals` binds one portable principal to an auth user and keeps unwrapping/signing public keys and fingerprints separate.
- `workspace_principal_directory` enrolls principals into a workspace at an explicit directory revision. Active member/principal bindings are unique.
- `workspace_crypto_states` fences crypto/schema version, workspace key epoch, data, directory, policy, graph and binding revisions, plus migration state.

### Ciphertext and keys

- `encrypted_entities` stores one family-shared ciphertext record per opaque entity and enforceable shared field class.
- `encrypted_private_fields` stores one ciphertext record per opaque person and private field class (`phone`, `email`, `address`, `private_note`). Bundle replacement is not a supported operation.
- `encrypted_key_envelopes` stores signed/wrapped workspace, contact or media keys. An active recipient grant is unique by workspace/key/purpose/epoch/recipient.
- Canonical AAD columns are immutable and must exactly match the embedded `EncryptedEnvelopeV1` context.

### Policy, invitations and backup

- `signed_policy_authorizations` reserves verified artifacts for `contact_view`, `contact_edit` and `portability_export`; key possession never substitutes for edit/export authorization.
- `authorization_nonce_ledger` consumes operation nonces once without storing family plaintext.
- `crypto_invitations` stores only token/commitment/artifact hashes, expiry and consumption state.
- `opaque_backup_capabilities` is minted only by trusted server code after re-authentication. A single-use, short-lived capability allows an owner-only RPC to return original ciphertext, directory, policy and envelope rows without unwrap/re-wrap.
- `opaque_backup_audit` records workspace, actor, counts, status and timestamps only.

## RLS and transaction design

- All target tables use `ENABLE` and `FORCE ROW LEVEL SECURITY`; grants and policies are explicit.
- Members may read workspace ciphertext/directory. Normal envelope reads are recipient-only. Outsiders receive no rows.
- Authenticated users have no direct insert/update/delete grants on encrypted content, envelopes, policies or backup capabilities.
- `commit_encrypted_workspace` locks `workspace_crypto_states`, validates actor role/principal, expected revisions, operation shape, AAD, key epoch and idempotency, then applies the complete batch or rejects it.
- Private operations require a verified, unexpired `contact_edit` authorization whose actor, person, field class and policy/graph/binding/key versions match. Its nonce is inserted before the row write; any replay or mixed-scope batch aborts the transaction.
- Security-definer functions use an empty search path, fully qualified relations and narrowly granted execution. Ordinary helpers remain security-invoker where possible.

## Failure and replay semantics

- Unknown crypto/schema version, malformed base64url, AAD mismatch, stale data/directory/policy/binding/key version, key-purpose substitution or cross-workspace reference fails closed.
- Commit IDs are unique per workspace. An identical checksum returns the prior result; reuse with different content fails.
- Row-version mismatch aborts the batch. There is no partial commit.
- Invitation and authorization nonces are single-use. Expired/revoked artifacts cannot be consumed.
- Opaque backup capabilities are workspace-bound, owner-bound, expiring and single-use; failure is audited without PII.

## Test strategy

- Structural SQL tests inspect table shape, exact grants, forced RLS, immutable routing fields and function privilege/search-path rules.
- Parser/crypto tests cover tamper, downgrade, AAD/entity swap, public-key substitution and stale versions.
- RLS fixtures cover owner/editor/viewer/outsider and recipient A/B. Legacy contributor appears only as a denied migration fixture.
- Transaction fixtures cover cross-workspace inserts, stale epochs, duplicate commits, nonce replay, `phone` authorization targeting `address`, mixed-scope batches and ciphertext-only backup completeness.
- Real Supabase RLS and browser integration remain Preview/Production gates when the local database stack is available.

## Decision log

| Decision | Alternatives | Reason |
|---|---|---|
| Relational tables by security purpose | Generic artifacts; workspace chunks | Enables enforceable RLS, keys and field scopes |
| Separate shared and private ciphertext | Single person bundle | Prevents bundle replacement from bypassing field authorization |
| Separate unwrapping and signing directory fields | One generic public key | Prevents key-purpose substitution |
| RPC-only encrypted writes | Direct DML with policies | Provides atomic version/scope/AAD checks |
| Recipient-only normal envelope reads | Workspace-wide envelope reads | Minimizes grant metadata and preserves least privilege |
| Trusted-server backup capability | Client-declared re-auth timestamp | Client input cannot prove re-authentication |
| Preserve opaque absent-recipient envelopes in backup | Re-wrap to owner | Avoids owner escrow and privilege expansion |
| No Production migration in CR-04 | Immediate cutover | Keeps schema contract separate from repository and real-data rollout |

Design status: `VALIDATED_FOR_IMPLEMENTATION` by owner direction to complete CR-04 autonomously on `2026-08-31`.
