# CR-06 Security Review

Review date: `2026-08-31`. Scope: implementation commit `9770e50` and local database state.

## Result

No open Critical or High finding was identified within the CR-06 local contract scope.

## Confirmed controls

- Both binding tables enable and force RLS; authenticated users have SELECT only and no direct mutation grants.
- Actor principal and owner authority are derived from `auth.uid()` and the active workspace directory, never accepted from the request.
- Proposals require existing encrypted profile/person record IDs and can target only the caller's principal.
- Confirmation pins current directory-owned unwrapping/signing fingerprints. Extra client fields and malformed artifacts fail parsing.
- Partial unique indexes prevent ambiguous pending/confirmed principal/profile and person/profile identities.
- Confirm, rebind and revoke lock workspace crypto state and increment the binding revision; stale transitions fail before mutation.
- Rebind keeps the old confirmed binding until owner confirmation, then supersedes it atomically.
- Transition IDs bind a server-computed request hash and return the stored result on exact retry.
- Audit records contain opaque IDs, states, revisions and fixed reason codes only.

## Residual risks

- Profile/person membership is owner-attested because their association remains inside encrypted person content; PostgreSQL confirms both opaque records exist but cannot inspect the encrypted association.
- Single-owner workspaces necessarily allow that owner to confirm their own proposal. Stronger separation would require an additional trustee/product decision.
- CR-07 must verify policy signatures and trace every relation-derived grant to the exact confirmed binding/fingerprint/revision.
- Real multi-account Preview testing, scale tests, independent audit and Production parity remain unproven.

## Recommendation

Use CR-06 as the binding authority for CR-07 synthetic/local work. Do not grant contact keys from pending, rejected, revoked or superseded rows, and do not migrate real contact data yet.
