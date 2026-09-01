# CR-08 Validated Design — Encrypted Direct Collaboration

## Understanding summary

- Replace the legacy contributor draft/review model with exactly three target roles: `owner`, `editor` and `viewer`.
- Let owner and editor commit encrypted family-shared data and media directly through the CR-04 transaction pipeline.
- Preserve CR-07 contact privacy: a role or view key alone never authorizes a contact write.
- Fence every write with current membership, key and checkpoint state; retain idempotent recovery for unknown network outcomes.
- Convert legacy contributors to viewer by default and require an explicit owner promotion before direct editing.
- Inventory and disposition every role-bearing artifact before cutover; pending drafts are exported or discarded, never auto-applied.
- Limit CR-08 to local/synthetic implementation evidence. Real-data migration and Preview/Production cutover remain separate gates.

## Assumptions and non-functional requirements

- Plaintext and raw content keys exist only in unlocked browser memory. The server receives ciphertext and minimal routing/integrity metadata.
- The design must remain viable for at least 50,000 people in one workspace; commits are bounded operation batches, not whole-workspace snapshot writes.
- A retry of the same commit is exactly-once by commit ID and request checksum. A client never re-encrypts an outcome-unknown intent.
- Concurrent disjoint edits may merge when every declared dependency version still matches. Same-target conflicts never use last-write-wins.
- Missing or inconsistent membership, key, delegation, checkpoint or external-anchor state fails closed for writes and key changes.
- `hoanghiep.0179@gmail.com` owns contributor/draft migration dispositions and the final deployment gates.
- Active malicious frontend/backend behavior remains a disclosed residual risk; passive database or Storage snapshots must not decrypt canonical or operation payloads.

## Approaches considered

1. **Extend the CR-04 transaction pipeline — selected.** Reuse the encrypted state, commit, envelope and contact-authorization primitives while adding membership fencing and a controlled role cutover.
2. **Build a parallel collaboration V2 schema.** Rejected because dual live systems create more synchronization and split-brain risk than the cleaner rollback boundary justifies.
3. **Authorize every operation with standalone signed capability tokens.** Rejected because revocation and replay management add avoidable complexity and a wider authorization surface.

## Architecture and migration boundary

`workspace_crypto_states` gains a `membership_epoch`, authenticated checkpoint reference and cutover state. Owner/editor commits lock this state and validate current role, membership epoch, key epoch, checkpoint predecessor, operation dependencies and idempotency before applying one atomic batch.

The target role type contains only `owner | editor | viewer`. Before replacing the legacy role type, migration records an immutable inventory of memberships, invitations, join requests, cached capabilities, session claims, mirror state and pending drafts. A contributor membership becomes viewer. A pending contributor invitation/request is revoked by default; it may become viewer only through an explicit recorded owner disposition. No artifact can map contributor to editor implicitly.

Cutover has three phases:

1. `inventory`: block new contributor/draft creation while the owner handles outstanding artifacts.
2. `ready`: require a disposition for every legacy role artifact and every pending draft.
3. `active`: install the clean role type, increment membership epoch, disable draft APIs/UI/polling/mirrors and enable editor direct commit.

Pending drafts may be exported as encrypted owner-review artifacts or discarded. They are never converted to canonical operations automatically. Legacy draft records may remain read-only for a defined retention window; physical deletion is a separate, explicitly approved cleanup.

## Signing, authorization and checkpoints

Each owner/editor uses a principal signing key. An editor key is accepted only with an owner-signed delegation certificate binding workspace, principal, role, operation scope, membership epoch and expiry. The editor never receives the owner authority private key.

The signed commit request binds the commit ID, prior checkpoint, expected membership/key state, exact ciphertext targets, dependency versions and ciphertext hashes. The server verifies the delegation, request signature, current membership and AAD bindings under the workspace lock.

Each accepted mutation advances the CR-02 checkpoint chain. The actor signs the proposed next checkpoint under an active delegation rooted in the pinned owner authority. Clients verify the complete link and update the user-controlled external anchor after success. A missing link, invalid signer, fork or disagreement with the external anchor blocks writes and trust changes rather than selecting the newest server value.

## Direct commit and concurrency flow

1. The client unlocks and verifies the pinned trust, membership and checkpoint chain.
2. It validates plaintext schema, determines exact operations and computes the dependency closure.
3. It durably reserves nonces and persists the encryption intent before any network request.
4. It encrypts each target and signs one bounded request with row/dependency preconditions.
5. The RPC locks workspace state, validates structural and cryptographic bindings, and atomically applies or rejects the complete batch.
6. The client verifies the returned checkpoint and advances local state and its external anchor.

Global data revision is an ordering value, not an unconditional conflict gate. A request based on an older global revision may rebase when all target and declared dependency versions remain current. A changed target or dependency returns an opaque conflict containing only identifiers and versions. Resolution requires reload/decrypt/user choice; the server does not infer plaintext semantics.

Contact operations target exactly one `personId + fieldClass`. They require both an active view grant and an unconsumed signed edit authorization matching actor, policy/graph/binding revisions and key epoch. Owner role does not override CR-07 policy. Bundle replacement and blind clear/overwrite are forbidden.

Media uploads are staged beneath actor and commit IDs. Only a successful encrypted manifest operation attaches staged objects to canonical state. Failed commits leave TTL-bound orphans for idempotent cleanup and never expose a half-attached reference.

## Revocation, invitation races and sessions

Sensitive endpoints never trust a cached role or JWT claim alone. Removal or demotion increments membership epoch, revokes active delegations/capabilities, records invitation disposition and initiates the required key rotation. A request that has not passed the workspace lock fails with stale membership; a request committed before revocation remains in the signed audit chain.

Invitation acceptance is transactional, single-use and bound to the recorded target role. An invitation created before cutover cannot derive a post-cutover editor role. Acceptance/retry/replay returns its prior idempotent result or a revoked/expired error and cannot create a second membership.

## Failure handling and activity

For an unknown network outcome, the client queries by commit ID. `committed` returns the verifiable checkpoint; `not_found` permits retry of the identical ciphertext/signature; `conflict` or `revoked` preserves the local change for explicit resolution but removes it from automatic sending. Checkpoint/anchor failure enters a blocking recovery state.

Activity stores only actor principal, operation class, opaque target ID, revision, timestamp and result code. It never stores family names, relationships, contact values or plaintext summaries.

## Verification gates

Local fixtures must cover owner/editor success, viewer denial, contact scopes, disjoint and same-target concurrency, exactly-once retry, unknown outcomes, remove/demote races, stale epochs, invitation cutover races, contributor-to-viewer migration, explicit promotion, pending-draft non-application, disabled draft surfaces, checkpoint rollback/fork and passive snapshot confidentiality.

Preview owner/editor/viewer end-to-end behavior remains a separate acceptance gate. Real workspace migration, Production deployment and claims of independent security review remain prohibited without new approval.

## Decision Log

| Decision | Alternatives | Reason |
|---|---|---|
| Extend CR-04 pipeline | Parallel V2 schema; standalone capabilities | Reuses hardened primitives and minimizes new trust boundaries |
| Clean three-value target role type | Retain dormant contributor enum value | Keeps schema, API and generated types aligned with the product contract |
| Three-phase cutover | One-shot rewrite | Makes legacy inventory and owner disposition explicit and recoverable |
| Contributor defaults to viewer | Automatic editor promotion | Prevents privilege escalation during migration |
| Delegated editor signing rooted in owner authority | Share owner key; server signing | Preserves direct editing without exposing root authority or trusting the server |
| Row and dependency preconditions | Global-revision rejection; last-write-wins | Allows safe disjoint merge without plaintext semantic validation |
| Contact view plus one-time edit authorization | Role or key possession implies write | Preserves CR-07 field privacy and prevents blind overwrite |
| Fail closed on checkpoint/anchor mismatch | Prefer newest server state | Detects rollback/fork rather than silently accepting it |
| Read-only draft retention | Auto-apply or immediate destruction | Preserves reviewability without contaminating canonical encrypted state |

Design status: `VALIDATED_FOR_IMPLEMENTATION` by owner on `2026-09-01`.
