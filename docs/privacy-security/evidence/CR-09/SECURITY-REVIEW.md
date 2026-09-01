# CR-09 security review

- Parser is bounded before mapping and rejects malformed/deep/oversized input.
- Unknown records do not become executable behavior; media references are metadata only.
- Export scope is signed, revision-bound, expiry-bound to ten minutes, role-checked and single-use.
- Real workspace export buttons are disabled until the client has a concrete signer and authorization consume path.
- Local validation is not a Production security audit.
