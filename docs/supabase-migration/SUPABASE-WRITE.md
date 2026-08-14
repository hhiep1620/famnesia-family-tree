# Supabase Transactional Write Handoff

## Boundary

CR06 enables canonical metadata commits when the complete backend selection is
`supabase`. Google Drive remains the default and rollback backend. Supabase
media upload, member management, contributor approval, full import/restore,
manual backup and duplicate-merge replacement are still disabled. The UI hides
those destructive controls instead of exposing a path that returns `501`.

Roles in this phase:

- `owner` and `editor`: read plus direct transactional metadata commit;
- `contributor` and `viewer`: read only until CR08 enables contributor drafts;
- every media mutation remains disabled until CR07.

## RPC and repository path

Public authenticated RPCs:

- `public.commit_family_operations(uuid, text, bigint, jsonb, timestamptz)`
- `public.get_family_commit_status(uuid, text)`

Internal, non-granted helpers:

- `public._family_snapshot_json`
- `public._family_apply_operations`
- `public._replace_family_data`
- JSON entity/filter helpers used by the operation replay function

The Vercel adapter is `api/_server/supabase/writeBackend.ts`. It uses the
request user's Bearer token, never the Supabase secret/service-role key. The
security-definer RPC checks `auth.uid()` and workspace membership itself before
locking or mutating anything. Normal commits therefore cannot use a server key
to bypass user authorization.

## Transaction and conflict semantics

One RPC call performs all canonical work in one Postgres transaction:

1. validate the commit envelope and require an `owner`/`editor` membership;
2. lock the workspace row with `FOR UPDATE`;
3. reject a reused `commit_id` whose base version/operation checksum differs;
4. return the existing result for an identical idempotent retry;
5. replay compacted operations against the locked canonical snapshot;
6. return typed field/entity/reference conflicts without writing;
7. replace normalized rows, validate foreign keys/uniqueness and reject ancestry cycles;
8. increment `workspaces.data_version` exactly once;
9. insert one `commits` row and one `activity_events` summary;
10. return the canonical `FamilyData` snapshot and version.

A stale `baseVersion` is allowed when every locally changed field still equals
its operation baseline (or already equals the local value). This is reported as
`autoMerged=true`. Same-field different-value, remote-delete/local-update and
changed-entity delete conflicts return `409 FAMILY_COMMIT_CONFLICT` with
base/local/remote values. The browser retains its IndexedDB Draft on every
conflict or failure.

If a network failure makes the result unknown, the browser queries
`get_family_commit_status` before treating the attempt as failed. If that status
query also fails, the existing `commit_id` and local operations are retained and
additional edits/discard are blocked until the same batch is retried. This
prevents a new commit ID from duplicating an already-applied unknown result.

## Concurrency evidence

`scripts/supabase-write-smoke.mjs` signs in the local owner, editor,
contributor and viewer through Supabase Auth, then sends owner/editor commits
concurrently from the same base version. The two different-field changes
serialize into consecutive versions; exactly one response is marked
auto-merged, and both values remain in the canonical snapshot. The same smoke
also verifies:

- idempotent retry and commit-status recovery;
- same-field `409` conflict;
- contributor/viewer direct commit denial;
- one activity summary per successful batch.

The pgTAP suite additionally covers atomic multi-operation success, rollback
when a later operation fails, commit-ID payload mismatch, cascade person delete,
ancestry cycle rollback and duplicate relationship rollback.

Run the local API smoke after starting Vercel Dev with all three selectors and
Supabase local environment variables set to `supabase`:

```bash
npm run supabase:write:smoke
```

## Known conflict/phase limits

- Only field-disjoint changes are auto-merged. Array/object subfields are
  compared as their operation field value; there is no character-level merge.
- A delete whose baseline entity changed requires review; it is not partially
  auto-merged.
- Relationships and media keep stable legacy/domain IDs, but their internal
  UUID rows are rebuilt by the transactional snapshot writer. No current or
  planned client contract exposes those internal UUIDs.
- Full dataset import/restore/duplicate merge and manual snapshots need their
  dedicated atomic flow before their UI controls can be enabled.
- Remote Preview verification still requires the actual Supabase project URL,
  publishable key, secret key and configured Google provider/redirects.
