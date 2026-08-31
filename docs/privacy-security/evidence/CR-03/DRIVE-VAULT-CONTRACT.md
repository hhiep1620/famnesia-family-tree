# CR-03 Drive Vault and Custody Contract

## Storage split

| Location | May contain | Must not contain |
|---|---|---|
| Google Drive `Famnesia Key Vault/vault-v1.json` | 256-bit recovery secret, portable principal ID, recovery epoch, public-key fingerprints, authenticated trust/checkpoint pin values | Raw user private key, workspace/contact/media key, family/contact/media plaintext |
| Supabase `encrypted_private_key_bundles.bundle` | Public JWKs/fingerprints, KDF salt, authenticated ciphertext envelope | Recovery secret, plaintext private key |
| Downloaded Drive recovery kit | Same versioned vault payload for account-loss recovery | Supabase encrypted bundle |
| Downloaded per-user encrypted backup | Encrypted private-key record and trust pins | Recovery secret, raw private key |

Both halves are required on a clean device. Neither a Supabase-only attacker nor a Drive-only attacker can open the synthetic private-key fixture.

## Authorization boundary

- Supabase Google login requests identity scopes only.
- A user gesture separately initializes Google Identity Services with only `https://www.googleapis.com/auth/drive.file`.
- The access token exists only in a browser object and is attached only to `https://www.googleapis.com/drive/v3/*` requests.
- No Famnesia API, Vercel Function, URL, log, local storage or session storage receives the token or recovery secret.
- Expired/401 tokens fail with `DRIVE_RECONNECT_REQUIRED`; a rejected cached token is cleared so the next user action requests a fresh token.

## Create and restore state machine

1. Browser generates the recovery secret and separate ECDH/ECDSA private keys.
2. Browser encrypts the private JWK bundle under a recovery-derived AES-GCM key.
3. Supabase inserts an immutable `pending_drive` encrypted record under forced RLS.
4. Browser verifies the Drive account and directly creates the app-owned folder/file.
5. UI exposes two separate downloads and the permanent-loss warning.
6. Only after both download actions and explicit confirmation does the UI call the RLS-protected activation RPC (`pending_drive -> active`).
7. If Drive create has an unknown outcome, pending state is retained. Retry searches and verifies the existing vault; it does not generate or overwrite another secret.
8. If Drive explicitly confirms that the vault file is missing, the user may invoke a separate recovery action that rechecks Drive before deleting only the pending record; unknown/existing/corrupt states are never discarded.
9. Restore verifies account, ownership, singleton file, exact manifest, principal/epoch/fingerprints, AEAD, authenticated trust pins, public-key fingerprints and public/private key-pair correspondence before importing non-extractable private keys.

## Trust changes

The versioned vault has exact keys and rejects unrecognized fields. Each workspace trust pin binds workspace ID, genesis fingerprint, directory checkpoint hash and freshness checkpoint hash. The same pins are authenticated inside the encrypted private-key bundle, so modifying only the Drive manifest fails restore. A normal implementation must never replace these pins from a server response. Invitation enrollment continues to require the CR-02 signed-envelope and URL-fragment/out-of-band commitment verification before a pin can be accepted.

Public-key/recovery rotation is intentionally not implemented as an overwrite. It requires a later explicit compatibility/rotation transaction with retained envelopes and signed trust transitions.

## Failure semantics

- Wrong Google email, non-owned artifact, duplicate folder/file, missing artifact or corrupt JSON: fail closed.
- Missing Supabase record: require the separate encrypted per-user backup.
- Missing Drive secret and recovery kit, with no unlocked device: permanent loss is possible; no operator reset exists.
- Production Supabase schema and real OAuth/browser behavior remain deployment gates, not conclusions from local mocks.
