# CR-08 failure injection

The local fixtures reject: viewer commits, missing/expired/revoked editor delegation, stale membership or key epochs, missing checkpoint predecessor, external-anchor disagreement, duplicate operation targets, dependency drift, same-row version conflicts, contact writes without view plus signed edit scope, replayed authorization nonces, reused commit IDs with a different checksum, and unknown network outcomes without a matching commit record.

The repository preserves an outcome-unknown encrypted intent and accepts recovery only when the queried commit ID, result version and checkpoint match. It never re-encrypts an unknown intent automatically.
