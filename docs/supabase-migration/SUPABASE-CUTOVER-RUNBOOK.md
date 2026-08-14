# CR10 Production Cutover, Observation and Rollback Runbook

This runbook is executable preparation, not authorization. Do not change Vercel Production, run a production migration, deploy, or remove Drive until the owner explicitly approves the cutover and names the freeze/observation/rollback owners.

## Safety controls delivered by CR10

- Production accepts the Supabase stack only when all three selectors are `supabase` and `SUPABASE_CUTOVER_APPROVAL_ID` matches `CR10-<8..80 safe characters>`.
- `FAMNESIA_MAINTENANCE_MODE=read-only` blocks all workspace mutations before authentication while leaving reads available.
- Final production migration additionally requires `--allow-production`, exact Supabase host confirmation, matching approval ID and a clean final-backup report with the same source checksum.
- Migration rows remain hidden until reconciliation publishes them.
- Remote RLS evidence expires after 24 hours. Preflight rejects a different host, any failed check, warning, checksum drift or unhealthy Auth/REST endpoint.
- Drive code/config remains intact throughout the rollback window. Cleanup is a separate, later commit.

## 0. Explicit authorization record

Before any Production mutation, record:

```text
Approval ID: CR10-...
Authorized by / time:
Freeze owner:
Migration owner:
Smoke owner(s):
Observation + rollback owner:
Rollback window end:
Stable production alias:
```

Use that exact approval ID in the local shell and in Vercel Production. It is an audit marker, not a secret.

## 1. Preview gate

1. Deploy the full Supabase stack to a Vercel Preview environment.
2. Import the current Drive export with `--allow-remote-preview --confirm-host <preview-supabase-host>`.
3. Run the complete role/product smoke matrix below.
4. Produce fresh remote RLS evidence with one member access token and one true non-member token:

```bash
RLS_MEMBER_ACCESS_TOKEN=... \
RLS_OUTSIDER_ACCESS_TOKEN=... \
RLS_WORKSPACE_ID=... \
npm run supabase:rls:remote-smoke -- /secure/path/preview-rls.json
```

Tokens are read from the process environment and are never written to the report.

## 2. Freeze and final backup

1. Announce the freeze window.
2. Keep the complete Drive selector set and set `FAMNESIA_MAINTENANCE_MODE=read-only` in Production; deploy this freeze state.
3. Confirm a mutation returns `503 FAMNESIA_READ_ONLY` and reads still work.
4. Create a fresh, immutable owner Drive export bundle. Do not alter/delete its source.
5. Produce the final backup/dry-run report:

```bash
npm run supabase:migrate:drive -- \
  --bundle /secure/final-drive-export \
  --owner-email owner@example.com \
  --dry-run \
  --report /secure/evidence/final-backup.json
```

The checksum in this report must be the checksum imported below.

## 3. Final Production migration

Set credentials only in the shell/session or an approved secret runner. Never put the secret key in CLI arguments, reports, Git or `VITE_*`.

```bash
export MIGRATION_ENVIRONMENT=production
export SUPABASE_CUTOVER_APPROVAL_ID=CR10-...

npm run supabase:migrate:drive -- \
  --bundle /secure/final-drive-export \
  --owner-email owner@example.com \
  --workspace-name "Family name" \
  --legacy-drive-folder-id DRIVE_ROOT_FOLDER_ID \
  --run-id PRODUCTION_RUN_UUID \
  --workspace-id PRODUCTION_WORKSPACE_UUID \
  --allow-production \
  --confirm-host <production-supabase-host> \
  --approval-id "$SUPABASE_CUTOVER_APPROVAL_ID" \
  --final-backup-report /secure/evidence/final-backup.json \
  --report /secure/evidence/final-migration.json
```

Stop immediately on errors, warnings, a non-clean reconciliation or a source checksum mismatch. Do not switch selectors.

## 4. Fresh Production RLS evidence and preflight

Run `supabase:rls:remote-smoke` against the just-migrated workspace, then stage this exact environment in the controlled shell used for preflight:

```dotenv
DATA_BACKEND=supabase
AUTH_BACKEND=supabase
MEDIA_BACKEND=supabase
FAMNESIA_MAINTENANCE_MODE=read-only
SUPABASE_CUTOVER_APPROVAL_ID=CR10-...
```

```bash
npm run supabase:cutover:preflight -- \
  --migration-report /secure/evidence/final-migration.json \
  --backup-report /secure/evidence/final-backup.json \
  --rls-report /secure/evidence/production-rls.json \
  --report /secure/evidence/cutover-preflight.json
```

Only `status=ready` is a go decision. This check validates evidence and public project health; it does not mutate Vercel or deploy.

## 5. Selector deploy

After `status=ready`, update all three Vercel Production selectors together, set the exact approval ID, and keep maintenance read-only for the first deploy. Verify the stable alias points to the expected deployment hash. Then set maintenance `off` and redeploy only when read-only smoke is clean.

Never temporarily run a mixed selector set. Never expose `SUPABASE_SECRET_KEY` as `VITE_*`.

Record deployment URL, Git hash, deployment time, Vercel deployment ID and operator in the final handoff.

## 6. Production smoke matrix

Record pass/fail/evidence for:

| Area | Owner | Editor | Contributor | Viewer |
|---|---:|---:|---:|---:|
| Google sign-in/session/logout | required | required | required | required |
| Workspace list/switch | required | required | required | required |
| Tree/calendar/search/detail/export | required | required | required | required |
| Batch save/conflict | required | required | draft only | denied |
| Photo upload/read/delete | required | required | draft only | read only |
| Invite/update/remove | required | denied | denied | denied |
| Draft submit/review | review | review | submit | denied |
| Backup/restore | full | read | read | read |
| Mobile basic smoke | required | one non-owner role | required | optional |

Also confirm that a real outsider sees no workspace/person/media rows. Local structural tests are not production proof.

## 7. Observation

For the agreed rollback window, monitor Auth failures, RLS 401/403 anomalies, commit conflicts/errors, Storage failures, Function errors/latency and Supabase DB/Storage/egress quota. Logs and evidence must not contain access tokens, plaintext family data or unnecessary email addresses.

## 8. Rollback triggers and sequence

Triggers include broad Auth failure, unexplained reconciliation drift, data loss/corruption, cross-workspace access, owner-wide RLS denial or broad media inaccessibility.

1. Set `FAMNESIA_MAINTENANCE_MODE=read-only` on the Supabase stack and deploy to stop new writes.
2. Export and preserve every Supabase change created after cutover. Do not silently discard it.
3. Reconcile/queue those changes for re-application.
4. Change all three selectors together to `drive`, `google-drive-oauth`, `drive`; keep maintenance read-only during the rollback smoke.
5. Redeploy, verify the stable alias/hash and smoke owner + non-owner Drive access.
6. Set maintenance `off` only after rollback smoke passes.
7. Open an incident record with trigger, time, affected revisions and retained Supabase delta export.

The CR09 destructive rollback command is only for an unpublished hidden migration. It must never be used to erase a published Production workspace or post-cutover writes.

## 9. Cleanup is deliberately deferred

After the rollback window, request a separate explicit decision before removing:

- Google Picker UI/key/config.
- Google OAuth refresh-token/session encryption code.
- Drive persistence/media/collaboration/mirror adapters.
- Upstash resources or variables.
- Drive-related Vercel environment variables.
- The immutable Drive backup/export.

Only that later cleanup commit may update README/architecture to state Supabase is the sole Production canonical backend. Until then, Drive remains the tested rollback path.

## Current repository state

CR10 safety code/runbook can be committed before authorization. Phase 10 remains incomplete until an authorized Production migration/deploy, role smoke, observation owner and rollback-window status are recorded with real deployment evidence.
