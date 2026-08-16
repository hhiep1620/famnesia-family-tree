# CR08 Handoff — Supabase Shared Workspace and Draft Approval

## Invitation contract

- Owner creates an invitation for a normalized email and one of `editor`, `contributor`, or `viewer`.
- The server creates a 256-bit random token. Postgres stores only its SHA-256 hash.
- The UI receives a one-time copyable URL in the form `/?invite=<token>`.
- Invitations expire after 7 days, are single-use, and may be revoked by the owner.
- Acceptance checks the authenticated Supabase email before creating membership in the same database transaction.
- Replaying an accepted link is idempotent for the same account. A different email, an expired token, or a revoked token is rejected server-side.
- MVP email delivery is intentionally out of scope. Famnesia copies the secure link; it does not add an unapproved email provider.

## Role contract

| Role | Read | Direct commit | Submit Draft | Review Draft | Members | Import / restore |
|---|---:|---:|---:|---:|---:|---:|
| owner | yes | yes | no | yes | yes | yes |
| editor | yes | yes | no | yes | no | no |
| contributor | yes | no | yes | no | no | no |
| viewer | yes | no | no | no | no | no |

The UI label for `contributor` is **Editor cần duyệt**. Supabase collaboration does not require Google Picker, Drive permissions, Limited Access folders, or a Drive mirror. Drive behavior remains available only through the rollback backend selectors until CR10.

## Draft and review contract

- A contributor may have one active Draft per workspace. A new submission creates a new immutable revision and replaces its pending operation payload transactionally.
- Owner/editor reads all submitted Drafts; a contributor reads only their own Draft through RLS.
- Review requires the exact `draftRevision`. A stale reviewer receives `409 DRAFT_REVISION_CHANGED`.
- Approval expands selected operations with forward dependencies. Rejection expands through reverse dependencies.
- Approved operations use the CR06 idempotent batch commit. A conflict marks the Draft `needs_changes` without a partial canonical write.
- Rejection requires a reason. Review decisions are recorded in `draft_review_events` and summarized in `activity_events`.
- CR07 uploads remain `verified` until an approved `media.attach` operation claims them. Rejected uploads are discarded and removed from private Storage.
- Terminal Draft payloads are removed after 7 days when an active participant opens collaboration status; activity summaries remain.

## Workspace and data management

- `create_family_workspace` creates a workspace and its owner membership in one transaction.
- Owner backup and full replace/restore are enabled through database RPCs. Full replacement validates the expected data version and creates a canonical snapshot before mutation.
- Removing a membership takes effect on the next request because every API call uses the authenticated user token and RLS.
- The owner membership trigger prevents deletion or downgrade of the only owner.

## Validation evidence

- `npx supabase test db`: 4 files, 138 pgTAP tests passed.
- `npm test`: 25 files, 111 tests passed.
- `npm run supabase:read:smoke`: passed after a clean reset.
- `npm run supabase:write:smoke`: passed after a clean reset.
- `npm run supabase:media:smoke`: passed after a clean reset.
- `npm run supabase:collaboration:smoke`: workspace create, invite/accept/revoke/replay, wrong email, roles, dependency approval, editor rejection, stale revision, and immediate removal passed.
- Browser smoke: authenticated owner opened the Draft Inbox, approved a contributor Draft, created a contributor invitation, and received a copyable Supabase link without Picker.
- `npm run lint`, `npm run build`, `npx supabase db lint --local`, and `git diff --check`: passed. The existing Vite large-chunk warning remains non-blocking.

## Local verification

```bash
npx supabase db reset
npx supabase test db
npm test
npm run lint
npm run build

eval "$(npx supabase status -o env)"
SUPABASE_URL="$API_URL" \
SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" \
SUPABASE_SECRET_KEY="$SECRET_KEY" \
FAMNESIA_APP_URL="http://localhost:3001" \
npm run supabase:collaboration:smoke
```

Run the API smoke while `vercel dev` is serving the complete local Supabase selector set on port `3001`.
