# CR-06 Validated Design — Authenticated Member to Person Binding

## Understanding summary

- Bind each authenticated crypto principal to at most one person per family profile so CR-07 can evaluate relationship-based contact access.
- Members propose only their own identity; workspace owners confirm, reject, revoke or approve rebinds.
- Names, email addresses and phone numbers are never matching inputs or audit fields.
- A confirmed binding pins the recipient unwrapping and signing fingerprints plus a stable binding version.
- Binding changes invalidate stale grants and trigger contact-recipient re-evaluation.
- Unbound, pending, rejected and revoked members receive no relationship-derived contact key.
- Real workspace migration and Production deployment remain out of scope.

## Assumptions

- Opaque profile/person IDs are available after the authorized client decrypts the family graph.
- Target scale is approximately 50,000 people per workspace; active-binding lookups must be indexed.
- `crypto_principals` and `workspace_principal_directory` remain the identity/key source of truth.
- Owner `hoanghiep.0179@gmail.com` maintains the contract.

## Approaches considered

1. **Relational state machine with server-pinned artifacts — selected.** Provides enforceable transitions, uniqueness, revision fencing and audit without family plaintext.
2. **Encrypted binding artifacts only.** Rejected because RLS and CR-07 cannot reliably establish active binding scope.
3. **Automatic match from person data.** Rejected because it leaks contact/name semantics and permits false claims.

## Final design

`member_person_bindings` stores workspace, opaque profile/person, principal, lifecycle state, proposal/transition IDs, binding version and pinned directory fingerprints. Partial unique indexes permit one active proposal/binding per principal/profile and one active binding per person/profile.

Members may propose only for `current_crypto_principal`. A workspace owner performs confirm/reject/revoke transitions through fenced RPCs. Confirmation reads fingerprints from the active principal row rather than trusting request values. Rebind creates a new pending row and keeps the current confirmed binding effective until owner confirmation atomically supersedes it.

Every confirmed/rebind/revoke transition locks `workspace_crypto_states`, checks the expected binding revision and increments it. CR-07 grants carry that exact revision and therefore become stale immediately. `member_binding_events` is append-only metadata audit with opaque IDs and fixed reason codes only.

Transition IDs are idempotent: identical retries return the prior result, while payload reuse fails. Cross-workspace/profile, self-claim spoofing, owner spoofing, duplicate targets and stale revisions fail atomically.

## Decision Log

| Decision | Alternatives | Reason |
|---|---|---|
| Relational state machine | Encrypted-only binding | Server can enforce lifecycle and uniqueness without protected plaintext |
| Self-proposal plus owner confirmation | Owner creates claims; self-confirm | Separates knowledge assertion from stewardship approval |
| Pin directory fingerprints on confirm | Client-supplied fingerprints | Prevents recipient-key substitution |
| One active binding per profile | Multiple persons | Gives policy evaluation one unambiguous subject |
| Rebind preserves old binding until confirm | Immediate revoke | Avoids accidental access loss while retaining review |
| Global binding revision fence | Per-row timestamps only | Invalidates all stale relation grants deterministically |

Design status: `VALIDATED_FOR_IMPLEMENTATION` by owner on `2026-08-31`.
