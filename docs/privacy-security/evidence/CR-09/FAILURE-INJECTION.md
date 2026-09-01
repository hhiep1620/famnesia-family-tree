# CR-09 failure injection

- `.gdz` input: rejected before parsing.
- Invalid syntax, skipped levels and depth >32: diagnostics, no import data.
- Oversized file/line: rejected at the configured boundary.
- Missing/dead contact key: contact fields omitted and reported.
- Living-person contact/private note: omitted by policy.
- Replayed or expired authorization: database consume path rejects it.
