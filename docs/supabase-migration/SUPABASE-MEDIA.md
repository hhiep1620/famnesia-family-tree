# Supabase Private Media Handoff

## Boundary and object contract

CR07 enables private Supabase Storage only when the complete backend selection
is `supabase`. Drive media remains available behind the rollback selector and no
Production selector is changed.

Buckets are private and migration-managed:

- `family-media`: JPEG, PNG and WebP; maximum original size 4 MiB;
- `family-exports`: JSON/ZIP; maximum 10 MiB;
- `family-backups`: JSON/ZIP; maximum 10 MiB.

The server creates every path from normalized database UUIDs. Browser filenames
never enter the path:

```text
<workspace-uuid>/<profile-uuid>/<person-uuid>/<upload-uuid>/staging-original.<ext>
<workspace-uuid>/<profile-uuid>/<person-uuid>/<upload-uuid>/staging-thumb.webp
<workspace-uuid>/<profile-uuid>/<person-uuid>/<upload-uuid>/original.<ext>
<workspace-uuid>/<profile-uuid>/<person-uuid>/<upload-uuid>/thumb.webp
```

Staging objects are moved to their final names after server-side verification,
but remain logically staged in `media_uploads` until the FamilyData transaction
attaches them. A failed/conflicted commit therefore leaves a verified upload for
retry and never publishes canonical media metadata.

## Validation and access

`api/_server/supabase/mediaBackend.ts` verifies:

- actual JPEG/PNG/WebP magic bytes and declared MIME equality;
- 4 MiB original and 512 KiB thumbnail limits;
- SHA-256 checksum;
- canonical profile/person lookup in the selected workspace;
- server-generated UUID path shape without traversal.

Storage RLS derives the workspace and upload UUID from the object path. Members
can read attached objects; only the uploader and owner/editor reviewers can read
unattached staging. Owner/editor/contributor may create their own staging pair;
viewer, outsider and cross-workspace requests are denied. Buckets never expose a
public URL and no signed URL is persisted. The API streams authenticated blobs
with `private, no-store` response caching.

Tree/search/explorer use `variant=thumb`; gallery/details use
`variant=original`. `useMediaImage` is backend-neutral and also works with the
Drive rollback adapter.

## Delete, retention and quota

Metadata deletion queues paths inside the same Postgres transaction. After a
successful commit the user-context adapter removes queued objects and records
an idempotent completion/failure state. A committed object cannot be deleted by
the direct photo endpoint before metadata is removed. Discarding an unattached
upload removes its objects first and then marks it discarded.

Verified, unattached uploads expire after 24 hours. The schema/indexes support a
scoped cleanup worker; normal success and explicit discard clean up without a
background job. Upload logs contain workspace ID and aggregate byte counts, not
person names, tokens or file names.

The Free-plan quota assumption is that thumbnails are the dominant tree/search
read path. Originals are fetched only for detail/gallery. No transformation API
or public CDN is required.

## Evidence and limits

- pgTAP covers bucket privacy/config, path parsing, Storage role isolation,
  verification, attached reads and transactional cleanup queue creation.
- API smoke covers upload, magic-byte rejection, owner/viewer reads of original
  and thumb, outsider denial, contributor staging/direct-commit denial,
  conflict retention, idempotent discard and canonical cleanup.
- Drive production media and Drive photo IDs are not migrated in CR07.
- The 24-hour expiry worker/cron is deferred; cleanup is triggered on active
  media workflows until an operations scheduler is approved.
