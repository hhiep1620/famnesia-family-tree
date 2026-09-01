# CR-09 design record

## Locked understanding

CR-09 provides defensive GEDCOM 5.5.1/7.0 portability without importing media, plus one signed `portability_export` policy shared by GEDCOM, JSON and Excel. Living-person contact and private notes are omitted; unsupported or media fields are quarantined/omitted and never fetched.

## Decisions

- Native browser parser with a bounded AST; no external GEDCOM dependency.
- Limits: 10 MiB, 100,000 records, nesting depth 32, line length 16 KiB.
- Flow: parse -> preview -> map -> validate -> encrypt -> explicit commit confirmation.
- Export authorization binds workspace/profile/format/person IDs/field scopes, revisions, key epoch and a single-use nonce. Server verification is required; real-workspace direct download remains disabled until signer wiring is available.
- `.gdz` is rejected. `OBJE`, `FILE` and `URL` are counted as ignored media and no network request is made.

## Security boundary

The parser produces only validated `FamilyData`; policy redaction runs before any serializer. The database stores the signed artifact and scope, and atomically consumes the nonce before export. Local tests prove contracts and schema behavior only; they do not prove Production rollout or independent security review.
