# CR-09 evidence

CR-09 implements bounded GEDCOM import/export and a common signed portability policy for GEDCOM, JSON and Excel. Implementation commits: `60040e0` and `2458e22`.

Validation: `npm test -- --run` (52 files, 224 tests), `npm run build`, `npm run lint`, `npm run supabase:test` (247 pgTAP tests), and `npm run supabase:lint` all pass locally.

Production/real-data migration and browser signer integration are not included in this change.
