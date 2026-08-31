# Recovery Failure Matrix

| Available material/state | Result | Required action / limitation |
|---|---|---|
| Drive secret + current Supabase encrypted private bundle | Normal unlock | Validate fingerprints/checkpoint; decrypt client-side |
| Drive secret only | Cannot decrypt | Retrieve matching encrypted bundle or self-contained backup |
| Supabase encrypted bundle only | Cannot decrypt | Recover Drive secret/separate recovery credential |
| Unlocked device, Drive secret lost | Recoverable | Rotate recovery secret, re-encrypt private bundle, revoke old recovery epoch |
| Self-contained per-user backup + separate recovery credential | Recoverable on clean device | Verify bundle, trust chain and possession before rebinding auth UUID |
| Workspace disaster bundle but absent member private recovery material | Family may restore; that member’s contact may remain opaque | Owner cannot escrow/decrypt absent member contact |
| Auth UUID changed, private keys intact | Recoverable | Complete signing + unwrapping challenge; bind same portable principal |
| Signing key lost, unwrapping key intact | Policy authority unavailable | Use pre-authorized recovery/succession; otherwise re-enroll and rotate affected trust/key epochs |
| Unwrapping key compromised | Confidentiality for received keys is compromised | Revoke key, rotate affected content keys, issue new pair; old plaintext cannot be recalled |
| Genesis/root compromised | Silent rotation forbidden | Explicit member re-enrollment + workspace/content rekey |
| Server checkpoint differs from Drive/recovery checkpoint | Block writes and trust changes | Recovery comparison/manual resolution; never choose newest server value blindly |
| Server and every external checkpoint lost/rolled back together | Absolute freshness cannot be proven | Surface limitation; recover only with explicit user decision |
| All recovery secrets, bundles and unlocked devices lost | Permanent partial/total loss | No Famnesia master-key reset exists |
| Owner unavailable without pre-authorized successor | Owner-only administration/key authority may be lost | Succession must be configured before incident |

