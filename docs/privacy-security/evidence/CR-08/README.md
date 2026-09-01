# CR-08 — Local implementation evidence

CR-08 implements encrypted direct collaboration with the target roles `owner | editor | viewer`.

The legacy contributor role is inventoried and converted to viewer by default. Draft mutation functions and client draft surfaces are disabled at cutover; retained draft tables are read-only historical data. Editor writes use the CR-04 ciphertext contract and are fenced by membership epoch, key epoch, signed owner delegation, an externally anchored checkpoint intent, row versions, dependency versions and idempotent commit IDs.

Evidence scope is local/synthetic only. No real workspace was migrated and no Preview or Production deployment was changed.

## Verification

- `npm test -- --run` — 51 files, 220 tests passed.
- `npm run build` — client and API TypeScript plus Vite build passed.
- `npm run lint` — Oxlint passed.
- `npm run supabase:test` — local pgTAP, 9 files, 247 tests passed.
- `npm run supabase:lint` — no schema errors.

The local database must be reset with `npx supabase db reset --local` before the pgTAP run. The package script explicitly uses `supabase test db --local` so a linked/remote context cannot be mistaken for local evidence.

## Security boundary

The browser signs delegation/checkpoint artifacts and keeps plaintext/key material in unlocked memory. API routes verify identity and signatures before invoking service-role registration RPCs. Authenticated SQL callers cannot invoke those trusted registration functions. The commit RPC never decrypts payloads and accepts only ciphertext plus opaque routing metadata.

Preview owner/editor/viewer E2E, browser network inspection, 50,000-person scale, real-data migration, independent review and Production rollout remain CR-11 gates.
