# CR09 Drive Bundle Migration Runbook

CR09 imports an owner-controlled Drive export bundle into a hidden Supabase workspace. The source bundle is read-only. The workspace becomes canonical only after normalized data, timestamps, counts and media checksums reconcile cleanly.

## Bundle contract

```text
export/
├── family.json
├── manifest.json
└── photos/
    └── person.png
```

`manifest.json` version 1:

```json
{
  "version": 1,
  "familyFile": "family.json",
  "sourceRevision": "Drive file version or modifiedTime",
  "media": [
    { "mediaId": "M0001", "path": "photos/person.png", "mimeType": "image/png" }
  ]
}
```

- Every `family.json.media[].id` must occur exactly once in the manifest.
- Paths must resolve to regular files inside the bundle; absolute paths, symlink escapes, missing files, MIME mismatches and corrupt image signatures are rejected.
- Supported images are JPEG, PNG and WebP. The source Drive file ID remains a legacy identifier; the imported record gets a private run-scoped Storage path.
- `family.json` schema v1/v2 is upgraded through the same migration used by manual import. Derived layout, kinship and analytics are not imported.

## Dry run — mandatory

```bash
npm run supabase:migrate:drive -- \
  --bundle /absolute/path/to/export \
  --owner-email owner@example.com \
  --dry-run \
  --report /secure/path/famnesia-dry-run.json
```

Dry run validates JSON, graph references, duplicate IDs, media presence/magic bytes and estimated counts/bytes. It writes JSON plus a sibling Markdown report with owner email replaced by a one-way fingerprint. It does not require Supabase credentials and writes neither DB nor Storage.

## Local or Preview execution

Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in the shell without putting the secret in CLI arguments or reports.

```bash
npm run supabase:migrate:drive -- \
  --bundle /absolute/path/to/export \
  --owner-email owner@example.com \
  --workspace-name "Gia đình của tôi" \
  --legacy-drive-folder-id DRIVE_ROOT_FOLDER_ID \
  --run-id UUID_FOR_THIS_RUN \
  --workspace-id UUID_FOR_TARGET_WORKSPACE \
  --report /secure/path/famnesia-migration.json
```

For a hosted Preview project, the command additionally requires both:

```text
--allow-remote-preview --confirm-host <exact-supabase-host>
```

CR09's normal path rejects `VERCEL_ENV=production` or `MIGRATION_ENVIRONMENT=production`. The same importer can be used by CR10 only with the additional production approval, exact-host confirmation and matching final-backup report described in the cutover runbook.

## Resume and idempotency

- Re-run the exact command with the same `run-id`, `workspace-id`, bundle checksums and owner to resume an interrupted run.
- Uploaded objects are reused only when byte length and SHA-256 match.
- Re-running the same source checksum against the same legacy Drive folder returns the existing completed workspace and creates no duplicate rows or objects.
- Reusing a run ID with different input, or targeting an existing folder with different source data, is rejected.

The object layout is deterministic:

```text
<workspace-id>/<deterministic-profile-uuid>/<deterministic-person-uuid>/<deterministic-upload-uuid>/original.<ext>
```

## Publish gate and reconciliation

1. The service RPC creates a workspace with `canonical_ready=false`.
2. Images upload and progress is saved to `migration_runs.resume_cursor`.
3. Normalized rows load while the workspace remains hidden by RLS.
4. The CLI compares source/target record counts, normalized SHA-256 and all source-supplied timestamps; it also records image bytes and SHA-256.
5. Only a clean result calls the publish RPC, sets `canonical_ready=true`, starts `data_version=1`, and marks the run complete.

On mismatch, the report is `failed` and the hidden workspace cannot appear in the app.

## Roll back an incomplete run

Use the same bundle and owner solely to establish the controlled environment, then pass the incomplete run ID:

```bash
npm run supabase:migrate:drive -- \
  --bundle /absolute/path/to/export \
  --owner-email owner@example.com \
  --rollback-run INCOMPLETE_RUN_UUID \
  --report /secure/path/famnesia-rollback.json
```

The CLI deletes only Storage paths recorded by that run, then the RPC deletes only its hidden incomplete workspace. A published/completed workspace is deliberately not rollbackable by this destructive command. Source Drive files are never changed.

## Local verification evidence

- Fixture: `test/fixtures/drive-migration/current/`
- Unit coverage: current/legacy schema, corrupt/missing/traversal image, duplicate IDs, cross-profile reference, deterministic Storage mapping and semantic mismatch.
- pgTAP coverage: service boundary, hidden load, publish gate, legacy IDs, idempotent rerun, durable resume cursor, incomplete rollback and completed-run protection.
- Local reports used during validation: `/tmp/famnesia-cr09-dry-2.json`, `/tmp/famnesia-cr09-live-5.json`, `/tmp/famnesia-cr09-rerun-2.json` (not committed).

## Production prerequisites for CR10

- Fresh final Drive export/immutable backup and write-freeze owner.
- Clean dry-run and hosted Preview migration/reconciliation report.
- Linked production schema/RLS verification, quota/health check and all three Supabase selectors ready.
- Explicit user authorization for Production env mutation/deploy.
- Named rollback/observation owner and a plan to preserve post-cutover Supabase writes before any rollback.

No Google permission, Drive source file, Picker config, refresh token or legacy environment variable is removed by CR09.
