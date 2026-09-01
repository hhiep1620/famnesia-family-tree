# CR-09 test matrix

| Area | Coverage | Result |
|---|---|---|
| GEDCOM | Unicode, dates, spouse/parent edges, round-trip | Pass |
| Defensive parsing | malformed lines, depth, size, line limits, `.gdz` | Pass |
| Media | `OBJE`/media ignored, no fetch | Pass |
| Policy | living redaction, field scope, missing key, media omission | Pass |
| Schema | scope RLS, registration checks, nonce consume function | Pass locally |
