# CR-08 security review

## Confirmed locally

- The generated `workspace_role` enum contains exactly `owner`, `editor` and `viewer`.
- Contributor memberships are downgraded to viewer during cutover; no implicit editor promotion exists.
- Draft mutation RPCs are removed, draft client calls are absent from the active repository contract, and legacy draft HTTP operations return a blocking 410.
- Editor delegation is owner-signed and bound to workspace, editor principal, scopes, membership epoch and a short expiry.
- Checkpoint intent is actor-signed, bound to the exact parsed encrypted request checksum, prior checkpoint and external anchor; the API recomputes the request checksum before trusted registration.
- Commit state is locked and checks membership/key/checkpoint epochs, dependencies, row versions, operation targets, contact grants and idempotency.
- Trusted registration functions are service-role-only; authenticated clients receive no direct execute grant.

## Residual gates

The browser must still wire a concrete signing/checkpoint coordinator before encrypted mode can be enabled for a real workspace. Preview multi-tab/session testing, browser storage/network inspection, migration rehearsal, load testing, independent review and Production rollout remain CR-11 work.
