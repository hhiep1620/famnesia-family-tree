# CR-07 Validated Design — Relationship-aware Contact Privacy

## Understanding summary

- Encrypt phone, email, address and private note as separate enforceable fields with distinct field keys and grants.
- Calculate recipients from confirmed CR-06 bindings and the decrypted in-memory family graph.
- Prevent default access from crossing a spouse/affinal boundary into the spouse's family.
- Keep view grants separate from signed, short-lived, one-time edit authorization.
- Recipient removal rotates the field key and ciphertext; deleting a grant alone is insufficient.
- Preview and apply use the same deterministic policy engine and revision inputs.
- Restricted contact must not leak through UI-derived text, export, search, accessibility, errors or telemetry.

## Assumptions

- Parent edges do not currently encode biological/adoptive/step subtype. CR-07 accepts an explicit edge-kind overlay; absent kind defaults to biological for legacy parent edges.
- Malformed/cyclic graphs and unknown relationship kinds fail closed.
- Browser plaintext and raw contact keys remain memory-only; server sees ciphertext, opaque IDs, revisions and signed artifacts.
- Initial proof is synthetic/local; Preview/browser and 50,000-person scale remain later gates.

## Approaches considered

1. **Client policy engine plus relational verified state machine — selected.** Preserves graph confidentiality while enabling RLS/RPC fences and audit.
2. **Client-only grants.** Rejected because malicious clients could self-grant without an authoritative verified state.
3. **Database graph evaluation.** Rejected because it requires family graph plaintext or sensitive derived topology server-side.

## Policy semantics

`self_only` grants only the bound subject. `direct_family` grants self, current spouse, parent, child and sibling; explicit adoptive parent/child is direct, while step relations are affinal. `close_blood` grants blood paths of distance at most four. `blood_only` grants any finite blood path. `workspace_members` grants every confirmed binding in the profile. `custom` starts empty. Custom allow/deny applies after the base audience and deny always wins.

The engine explores all simple paths with bounded traversal. A permitted blood path wins over an affinal alternative, but no policy other than `workspace_members` or custom allow crosses spouse then continues. Disconnected, cyclic, ambiguous or unknown paths do not grant.

## Grant and rotation design

Each `person + field class` has a `contact_field_states` key epoch and lifecycle. Signed policy artifacts bind policy/graph/binding revisions, subject binding, field, audience, allow/deny sets, nonce and issuer fingerprint. A trusted verification boundary validates the signature before state insertion.

Recipient envelopes bind the exact contact key/epoch and confirmed binding fingerprint. Edit authorization separately binds actor, target field and all revisions, expires quickly and is consumed once by the CR-04 commit transaction.

Audience expansion wraps the existing key for added recipients. Audience contraction creates a fenced rotation: new key/epoch, new ciphertext, replacement envelopes, atomic activation, then stale-envelope cleanup. Resume is keyed by rotation ID and cannot reactivate an old epoch.

## Decision Log

| Decision | Alternatives | Reason |
|---|---|---|
| Field-scoped keys | One person contact key | Prevents edit/grant scope from widening across fields |
| Strongest permitted path | First/shortest path only | Supports legitimate blood paths without affinal leakage |
| Explicit deny precedence | Owner override | Preserves person autonomy; no emergency override in v1 |
| Adoptive direct, step affinal | Treat all parent edges as blood | Makes semantics explicit and conservative |
| View key separate from edit artifact | Key possession implies edit | Prevents recipients or viewers from mutating ciphertext |
| Rotate on contraction | Delete envelope only | Removed recipients may retain old keys |
| Client graph evaluation | Server graph | Keeps relationship topology inside unlocked browser |

Design status: `VALIDATED_FOR_IMPLEMENTATION` by owner on `2026-08-31`.
