# CR-04 Evidence — Encrypted Data Contract

## Scope and outcome

CR-04 adds a parallel encrypted relational path for family-shared ciphertext, field-scoped contact/private ciphertext, recipient-bound key envelopes, portable principals, signed policy authorization metadata, replay ledgers and audited opaque owner backup. It does not connect the application repository, migrate legacy plaintext or deploy Production; those remain CR-05/CR-11 gates.

Implementation commit: `6c9827b`.

## Artifacts

- [Validated design and Decision Log](./DESIGN.md)
- [Schema and access map](./SCHEMA-MAP.md)
- [Threat-linked test matrix](./TEST-MATRIX.md)
- [Security review](./SECURITY-REVIEW.md)
- Migration: [`supabase/migrations/20260831000200_encrypted_data_contract.sql`](../../../../supabase/migrations/20260831000200_encrypted_data_contract.sql)
- Executable RLS fixtures: [`supabase/tests/database/encrypted_data_contract.test.sql`](../../../../supabase/tests/database/encrypted_data_contract.test.sql)
- Client boundary parser: [`src/crypto/encryptedDataContract.ts`](../../../../src/crypto/encryptedDataContract.ts)
- Generated local schema types: [`src/types/database.generated.ts`](../../../../src/types/database.generated.ts)

## Locked implementation decisions

1. Use relational ciphertext tables by security purpose, not a generic artifact table or whole-workspace chunks.
2. Keep shared and private/contact ciphertext separate; private rows permit only `phone`, `email`, `address` or `private_note`, so bundle replacement is not an operation.
3. Treat RLS and encryption as independent controls: members may receive workspace ciphertext, while normal wrapped-key reads are recipient-only.
4. Route all authenticated encrypted writes through one version-fenced, idempotent transaction RPC. Contact writes additionally consume an exact, active `contact_edit` authorization nonce.
5. Keep unwrapping and signing keys/fingerprints distinct and reject recipient/issuer key substitution.
6. Permit opaque owner backup only with a service-minted, owner/workspace-bound, short-lived and single-use capability. The RPC returns original ciphertext and all recipient envelopes without decryption or re-wrapping.

The migration follows the documented PostgreSQL/Supabase model in which grants and RLS policies are both required, update/write access must be explicit, and security-definer functions need controlled execution plus an empty search path: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase database functions](https://supabase.com/docs/guides/database/functions), [PostgreSQL row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).

## Validation record

Validated locally at `2026-08-31T11:38:02Z`:

- Migration applied successfully to Supabase local with `supabase migration up --local`.
- `npm run supabase:lint`: no schema errors.
- `npm run supabase:test`: 6 files / 181 pgTAP assertions pass; CR-04 contributes 22 assertions.
- `npm test`: 38 files / 177 Vitest assertions pass.
- `npm run lint`: pass.
- `npm run build`: pass; existing non-blocking Vite chunk-size warning only.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities.
- `git diff --check`: pass.
- Live catalog inspection confirms all 12 CR-04 tables have `ENABLE` + `FORCE RLS`, authenticated receives SELECT-only grants on the intended 10 readable tables, mutation RPCs have empty search paths, and backup capability minting is not executable by authenticated.

## Evidence boundary and remaining gates

This proves the migration, local RLS fixtures, SQL privilege shape and client parsers against the local Supabase stack. It does not prove a Production deployment, Production grants/configuration, browser integration, real family migration, independent security audit or scale behavior.

- CR-05 must connect a new repository exclusively to this path and prove the new repository never returns legacy plaintext.
- CR-07/09 must create and independently verify signed contact/export authorizations before trusted service insertion.
- A synthetic Preview snapshot and real multi-account smoke remain deployment gates.
- Legacy plaintext tables remain intentionally present until CR-11 and are outside the encrypted-path claim.

## Gate

Status: `APPROVED`.

| Owner | Decision | Recorded at |
|---|---|---|
| `hoanghiep.0179@gmail.com` | Approved all six locked CR-04 decisions | `2026-08-31T12:04:46Z` |

No Production migration or deployment was performed. The owner separately authorized CR-05 to start on `2026-08-31`.
