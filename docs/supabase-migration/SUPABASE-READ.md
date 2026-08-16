# Supabase Read Repository Handoff

## Boundary

CR05 enables the canonical read path only when all three backend selectors are
`supabase`. The Google Drive repository remains intact. Every Supabase mutation
returns `501 SUPABASE_WRITE_NOT_ENABLED`, and the UI derives its edit controls
from the returned capabilities, which are all false in this phase.

## Query and mapping path

- Workspace list: two parallel RLS-scoped queries (`workspaces` and the current
  user's `workspace_members`).
- Workspace load: two parallel access queries followed by four parallel
  canonical queries (`family_profiles`, `persons`, `relationships`, `media`).
- Activity: two access queries followed by one activity query limited to 20.
- Backups and members follow the same two-query access check plus one resource
  query.

The query count is constant for a workspace and does not grow with the number
of people, relationships, media items, or profiles. The local API smoke ran the
complete owner fixture in under five seconds including authentication and all
negative cases; individual query latency is intentionally left to Supabase
observability in Preview, where network latency can be measured honestly.

`api/_server/supabase/familyMapper.ts` is the only normalized-row to
`FamilyData` mapper. It preserves legacy domain IDs, null/optional semantics,
date-only values, lunar dates, confidence, spouse status and deterministic
ordering. Media uses the neutral `fileId`/`storagePath` fields; a Storage path is
never presented as a Google Drive file ID.

## Local fixture and checks

`supabase/seed.sql` contains:

- owner, viewer and outsider identities using only `example.test` addresses;
- a populated multi-profile workspace and an empty workspace;
- deceased/lunar, spouse status, confidence, subject, activity, snapshot and
  private-media metadata fixtures.

The known local-only password is `FamnesiaLocal123!`. The read smoke resets it
through the local admin API before logging in, so it must never be reused or
enabled outside the local stack.

Run:

```bash
npx supabase db reset --local
eval "$(npx supabase status -o env)"
export SUPABASE_URL="$API_URL"
export SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY"
export SUPABASE_SECRET_KEY="$SECRET_KEY"
npm run supabase:read:smoke
```

The smoke asserts owner/viewer/outsider isolation, populated and empty
workspaces, activity, media placeholder response and explicit write blocking.

## UI smoke evidence

Local `vercel dev` was run with all selectors set to `supabase` and the local
Vite publishable configuration. Browser verification covered:

- tree rendering and multi-profile selector;
- calendar;
- search/person details;
- analytics gender and age charts;
- Data activity timeline and Supabase read-only workspace label;
- authenticated media fetched into a blob URL (Bearer tokens are not exposed
  in image URLs);
- no fresh page errors after a clean reload.

The phase returns a generated SVG placeholder rather than Storage bytes. Real
private bucket access, upload, promotion, signed access and cleanup belong to
CR07. Transactional writes belong to CR06.
