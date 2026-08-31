# CR-07 Security Review

Review date: `2026-08-31`. Scope: implementation commit `a64463a` and local database state.

## Result

No open Critical or High finding was identified within the local CR-07 contract scope after policy truth-table tests, cryptographic negative paths, trusted-boundary inspection, RLS/RPC failure injection and full repository validation.

## Confirmed controls

- Relationship topology is evaluated only in the unlocked browser; the server receives opaque recipients and signed revision metadata, not the graph or contact values.
- Policy and edit artifacts require authenticated signer ownership, the active pinned signing fingerprint, ECDSA verification and exact policy/graph/binding/key revisions.
- Trusted registration RPCs are service-role-only. Authenticated callers cannot mark their own artifacts verified.
- Each field has an independent random key, AAD scope, epoch, ciphertext row and recipient grant set.
- Pending policy does not activate until new ciphertext and the exact recipient envelope set commit atomically.
- Audience contraction always advances the field-key epoch. Old grants/envelopes are revoked and RLS hides them.
- Contact write and clear require owner/editor role plus a separate exact-field, short-lived, one-time signed authorization.
- Restricted contacts are removed before `Person` reaches search, analytics, cards or accessibility consumers; only successfully decrypted fields are merged.
- The CR-04 routing trigger was hardened after rotation tests exposed record-type field resolution on private-row updates.

## Residual risks and deferred gates

- The audience preview component and encrypted contact repository are implemented but not wired into the current legacy application screen because CR-11 cutover is intentionally prohibited. Preview end-to-end UI wiring remains a gate before real use.
- The policy engine accepts a parent-edge kind overlay; legacy parent edges default to biological because the current FamilyData relationship schema lacks explicit adoptive/step metadata.
- Server service-role compromise remains a trusted-verifier boundary event. Database checks still constrain revisions, binding, role, recipient set and field scope but do not independently implement ECDSA.
- Removed recipients may retain contact plaintext they legitimately viewed before revocation; rotation prevents future ciphertext access, not human memory or prior screenshots.
- Real browser multi-account tests, 50,000-person performance, independent audit and Production parity remain unproven.

## Recommendation

Approve CR-07 for its local implementation gate. Do not migrate real contact data or enable encrypted mode for real workspaces before Preview wiring/testing and the later CR-08–11 gates.
