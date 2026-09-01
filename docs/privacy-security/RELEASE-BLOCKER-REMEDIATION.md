# Release-blocker remediation design

## Understanding summary

- Fix every P0/P1 finding from the 2026-09-01 repository review on the current branch.
- Keep the deployed application test-only until encrypted runtime and clean Preview evidence exist.
- Fail closed: Supabase must never fall back to plaintext family, contact, media or Draft storage.
- Preserve the existing owner/editor/viewer authorization model and owner approval for join-code requests.
- Repair recovery, portability, GEDCOM and partial-date contracts before enabling their production UI.
- Do not migrate or delete real data and do not modify `famnesia-template-v3.xlsx`.
- Finish with automated checks, a pushed branch and a Vercel Preview deployment.

## Assumptions and non-functional requirements

- Preview validation uses synthetic data and at most two test identities; production migration remains CR-11 gated.
- Existing Supabase RLS and crypto migrations are the server authority; protected plaintext tables are legacy-only.
- A locked or incompletely enrolled workspace shows a recovery/setup state instead of readable family data.
- Import/export and join endpoints use bounded inputs, generic lookup failures and idempotent database transactions.
- Current scale limits remain 20,000 people, 50,000 relationships and 4 MiB per media original.
- Bundle and route changes must keep the Vercel Hobby deployment at one function.

## Considered approaches

1. **Fail-closed cutover (selected).** Integrate the existing encrypted repository for canonical workspaces and block legacy plaintext paths in Supabase Preview. Lowest disclosure risk and preserves the CR-11 migration gate.
2. Dual-read fallback. Read ciphertext first and plaintext second. Rejected because a missing key or damaged ciphertext could silently disclose or overwrite legacy plaintext.
3. Keep plaintext runtime and relabel the product. Rejected because it conflicts with the approved privacy boundary and does not resolve the P0.

## Implementation design

1. Add a single runtime mode contract. Supabase Preview accepts only encrypted canonical workspaces; legacy Drive remains an explicit rollback stack. Plaintext Supabase family/media/Draft calls fail with a stable locked error.
2. Add client unlock/enrollment orchestration around the active recovery identity, recipient-bound workspace-key envelope and `WorkspaceKeySession`. Keys remain memory-only and can transfer only through the scoped BroadcastChannel contract.
3. Move media and local Draft payloads to ciphertext envelopes before persistence. Metadata remains limited to opaque IDs, versions, sizes and checksums.
4. Make workspace creation, join-code generation and owner membership atomic. Preserve return-to across OAuth, resolve codes generically, create pending requests, and expose owner approve/reject/rotate operations.
5. Enforce exact disaster-bundle shape, profile-bounded portability output, lossless GEDCOM parent/date handling and structured partial dates in the canonical schema.
6. Gate public claims from the capability registry. Features without an executable flow remain planned/beta and are not presented as available.
7. Add regression tests for each reproduced failure plus route-level Vercel checks. Deploy only after all local and database checks pass.

## Decision log

| Decision | Alternatives | Reason |
|---|---|---|
| Fail closed on missing encryption | Plaintext fallback | Prevents silent disclosure and downgrade writes |
| Keep production migration out of scope | Automatic migration | User authorized Preview, not real-data cutover |
| Preserve case-sensitive 8-character routing code | Invitation token as join code | Code locates a workspace but never authorizes access |
| Store partial dates structurally | Sentinel `01-01` | Prevents fabricated birthdays and precision loss |
| Disable incomplete flows | Publish local contracts as available | Public claims must match executable behavior |

