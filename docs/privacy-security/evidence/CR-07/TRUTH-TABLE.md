# CR-07 Normative Relationship Truth Table

Evaluation uses confirmed CR-06 bindings in one profile. `distance` counts biological parent edges on the permitted blood path. Explicit deny is applied last and always wins.

| Relationship/path from subject | self_only | direct_family | close_blood | blood_only | Default boundary note |
|---|---:|---:|---:|---:|---|
| Self | Allow | Allow | Allow | Allow | Requires confirmed self binding |
| Biological parent/child, distance 1 | Deny | Allow | Allow | Allow | Blood edge |
| Full sibling, distance 2 | Deny | Allow | Allow | Allow | Shares two biological parents |
| Half sibling, distance 2 | Deny | Allow | Allow | Allow | One shared biological parent is sufficient |
| Current spouse | Deny | Allow | Deny | Deny | Marriage/partner edge; no onward traversal |
| Divorced/separated/widowed former spouse | Deny | Deny | Deny | Deny | Not a current direct-family spouse |
| Grandparent/grandchild, distance 2 | Deny | Deny | Allow | Allow | Blood path |
| Aunt/uncle or niece/nephew, distance 3 | Deny | Deny | Allow | Allow | Blood path |
| First cousin, distance 4 | Deny | Deny | Allow | Allow | Blood path |
| Blood relative, distance greater than 4 | Deny | Deny | Deny | Allow | Unbounded finite blood path |
| Adoptive parent/child | Deny | Allow | Deny | Deny | Direct legal family; not inferred as blood |
| Step parent/child/sibling | Deny | Deny | Deny | Deny | Affinal unless custom allow |
| Parent/sibling/other family of spouse | Deny | Deny | Deny | Deny | Spouse then onward edge is forbidden |
| Spouse of cousin | Deny | Deny | Deny | Deny | Acceptance fixture: no default contact key |
| Disconnected person | Deny | Deny | Deny | Deny | No permitted path |
| Unbound workspace member | Deny | Deny | Deny | Deny | No binding means no relation-derived key |
| Confirmed workspace member | Deny | Deny | Deny | Deny | `workspace_members` alone allows regardless of path |
| Custom allow | Allow | Allow | Allow | Allow | Applied after base audience |
| Custom deny | Deny | Deny | Deny | Deny | Applied last; wins over every allow |

## Multiple paths

- The engine evaluates the existence of any permitted biological path, not the first or merely shortest mixed path.
- If a person has both an affinal path and a valid blood path, the valid blood path controls `close_blood`/`blood_only`.
- A marriage edge is never converted into a blood edge and is never traversed onward by the default audiences.
- Parent ancestry cycles, missing endpoints, duplicate profile person IDs and unknown edge kinds fail the whole preview closed rather than granting a partial audience.
