# CR-07 Failure-injection Evidence

| Injection | Observed fail-closed behavior |
|---|---|
| Cousin spouse / spouse parent in default graph | No recipient in policy preview; no grant row |
| Unbound principal inserted into recipient list | Trusted registration RPC rejects |
| Browser calls trusted policy/edit registration RPC | `TRUSTED_VERIFIER_REQUIRED` / execute denied |
| Policy signed by wrong principal or stale binding revision | Browser/server signature verification returns false |
| Cyclic parent graph | Entire preview rejects with `CONTACT_POLICY_GRAPH_INVALID` |
| Wrong field key attempts decrypt | Contact context/authentication rejects |
| Missing wrapped envelope during rotation | Complete transaction aborts; prepared state remains resumable |
| Removed recipient after policy contraction | New epoch/ciphertext committed; old grant/envelope revoked and hidden by RLS |
| Retry completed rotation with empty payload | Stored result returned; no duplicate epoch/grant |
| View recipient calls write without edit artifact | `CONTACT_AUTHORIZATION_DENIED` |
| Phone edit artifact targets address | Field state/scope rejects before ciphertext mutation |
| Reuse one-time edit authorization | Authorization nonce ledger rejects replay |
| Expired edit authorization | Trusted registration rejects |
| Outsider starts rotation | Active policy-principal check rejects |
| Contact values passed to shared family codec | CR-05 `CONTACT_POLICY_NOT_READY` remains fail-closed |

The SQL fixture executes inside a rollback transaction against local Supabase. It uses synthetic ciphertext and identities only.
