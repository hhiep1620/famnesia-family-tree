# CR-06 Evidence — Member to Person Binding

## Outcome

CR-06 implements an opaque, revision-fenced member-to-person binding lifecycle. Members propose their own principal binding; owners confirm, reject, rebind or revoke through RPC-only transitions. Confirmed artifacts pin the active unwrapping and signing fingerprints from the server directory and expose the stable binding revision required by CR-07.

Implementation commit: `9770e50`.

No real workspace was inspected or migrated, and no Preview/Production deployment occurred.

## Artifacts

- [Validated design](./DESIGN.md)
- [Threat-linked tests](./TEST-MATRIX.md)
- [Security review](./SECURITY-REVIEW.md)
- Migration: `supabase/migrations/20260831000400_member_person_binding.sql`
- Client parser/repository: `src/identity/memberPersonBinding.ts`, `src/services/memberBindingRepository.ts`
- Executable RLS/RPC fixture: `supabase/tests/database/member_person_binding.test.sql`

## Validation

- `npm test`: 43 files / 200 assertions pass.
- `npm run supabase:test`: 7 files / 205 pgTAP assertions pass; CR-06 contributes 22.
- `npm run supabase:lint`: no schema errors.
- `npm run lint`: pass.
- `npm run build`: pass; existing non-blocking Vite chunk-size warning only.
- `git diff --check`: pass after generated-type normalization.

Status: `IMPLEMENTED`. Owner authorized automatic continuation into CR-07 on `2026-08-31`; CR-07 still requires its own final evidence gate.
