# CR-04 Schema and Access Map

| Relation | Plaintext/routing metadata | Protected value | Normal authenticated read | Mutation authority |
|---|---|---|---|---|
| `crypto_principals` | Principal/auth IDs, public-key fingerprints, recovery epoch | None; public keys only | Own or shared workspace directory | Own active CR-03 bundle through registration RPC |
| `workspace_crypto_states` | Crypto/schema/key and monotonic revisions, migration state | None | Workspace members | Reviewed RPC/service workflows |
| `workspace_principal_directory` | Workspace/principal/auth binding and revision | None | Workspace members | Initialization and future signed-directory workflow |
| `encrypted_entities` | Workspace/entity/class/key/version/writer IDs | `envelope.ciphertext` | Workspace members | `commit_encrypted_workspace` only |
| `encrypted_private_fields` | Workspace/person/field class/key/version/writer IDs | `envelope.ciphertext` | Workspace members; decryption still needs a recipient key | Commit RPC plus exact consumed `contact_edit` authorization |
| `encrypted_key_envelopes` | Recipient/issuer IDs and fingerprints, key purpose/epoch/revision | Wrapped content key | Exact current recipient only | Commit RPC after active-directory and fingerprint checks |
| `signed_policy_authorizations` | Purpose/scope/version/expiry/nonce hash | Signed artifact, no family plaintext | Actor or workspace owner | Trusted verification workflow only |
| `authorization_nonce_ledger` | Hashed nonce, commit/principal IDs, timestamp | None | No authenticated direct read | Commit RPC only |
| `crypto_invitations` | Hashed email/token/artifact, lifecycle/expiry | None | Workspace owner | Trusted invitation workflow only |
| `opaque_backup_capabilities` | Hashed bearer token, owner/workspace, TTL/state | None | No authenticated direct read | Service role only |
| `opaque_backup_audit` | Actor/workspace/capability IDs, status and row counts | None | Workspace owner | Backup functions only |
| `encrypted_commits` | Commit/version/count/checksum and ciphertext request payload | Encrypted operation envelopes | Workspace members | Commit RPC only |

## Canonical binding

Every content row must match the exact embedded AEAD AAD tuple:

`workspaceId + entity/personId + fieldClass + schemaVersion + dataVersion + keyId + keyEpoch + writerId + purpose`

Every wrapped-key row binds:

`workspaceId + envelopeId + entityId + recipient principal/fingerprint + keyId/purpose/epoch + directory revision + issuer principal/signing fingerprint + expiry`

Unknown versions, missing/extra fields, stale epochs/revisions and row/AAD substitutions fail closed. Stable opaque IDs, versions, hashes, enum classes and timestamps are allowed routing metadata under CR-01; names, dates, contact values, notes, captions and family operation plaintext are not columns in this path.

