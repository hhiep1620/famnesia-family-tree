# CR-05 Synthetic Migration Audit

## Permitted source

The harness has no database or workspace-discovery dependency. Its only input is an injected object with the exact `famnesia-synthetic-v1` marker, a constrained synthetic fixture ID and the already selected workspace ID. This makes accidental real-workspace enumeration unavailable by construction.

## Reconciliation classes

| Class | Action | Reconciliation |
|---|---|---|
| Family-shared | Encrypt settings, profiles, person core and relationships | Source count equals encrypted count |
| Contact/private | Remove and quarantine phone, email, address and private note | Source count equals quarantine count; encrypted count is zero |
| Media | Encrypt media manifests separately | Source count equals encrypted count |
| Workflow | Quarantine until its encrypted contract exists | Source count equals quarantine count |

The source and resulting ciphertext manifests use an HMAC derived from the non-extractable workspace root key. Raw names, dates, contact values and unkeyed low-entropy hashes are not stored in checkpoints.

## Resume and rollback

- A checkpoint binds run ID, fixture ID, workspace ID, keyed source manifest and keyed key-set identity.
- The initial checkpoint is persisted before the first ciphertext batch.
- Replaying a partially written batch is idempotent because the sink key is workspace/class/opaque entity ID.
- Any source or key-set mismatch fails closed.
- Stop retains checkpoint and ciphertext and prevents silent legacy reads.

## Execution record

Local synthetic fixtures covered complete migration, contact quarantine, legacy email identity changes, interrupted first-batch resume, repeated completed resume, wrong-key rejection, invalid marker rejection and stop retention. No real family data, remote workspace discovery, Preview deployment or Production migration was used.
