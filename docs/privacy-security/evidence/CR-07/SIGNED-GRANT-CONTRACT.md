# CR-07 Signed Policy and Grant Contract

## Policy artifact

The policy principal signs an exact canonical artifact containing policy/workspace/profile/person/field IDs, audience, sorted custom allow/deny and recipient principal lists, subject binding ID, policy/graph/binding revisions, target contact-key epoch, random nonce and expiry.

For a confirmed subject, the signer must be the subject's pinned signing principal. For an unbound subject, only the workspace owner's active principal may act as steward. The authenticated endpoint verifies token-to-principal ownership, pinned fingerprint, ECDSA signature, exact revisions and expiry before invoking a service-role-only registration RPC.

Registration creates a pending policy. It does not expose a key. The policy becomes active only in the transaction that commits replacement ciphertext and the exact wrapped-envelope recipient set.

## View grant

A view grant consists of:

- confirmed CR-06 binding ID/version and pinned recipient unwrap fingerprint;
- exact person, field, key ID and contact-key epoch;
- active policy ID and its policy/graph/binding revisions;
- recipient-only signed wrapped-key envelope.

Revoked grant and envelope rows are hidden at RLS. Key removal always accompanies a new field epoch and ciphertext.

## Edit authorization

View-key possession does not authorize writes. The policy principal separately signs one actor/person/field authorization containing policy/graph/binding/key revisions, random nonce and expiry of at most ten minutes. The trusted endpoint verifies signature and signer identity, while the service RPC verifies the actor still has owner/editor role.

`commit_contact_field_write` requires the exact authorization and active field state, binds ciphertext AAD to the field/key/epoch/next data revision and atomically consumes the nonce. Clear uses the same authorization. Wrong field, expired artifact, stale revision, viewer role, replay and bundle-shaped substitution fail before mutation.
