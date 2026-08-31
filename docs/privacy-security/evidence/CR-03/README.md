# CR-03 Evidence — Google Drive User Key Vault

## Scope

CR-03 implements the browser-only recovery identity bootstrap: a visible app-created Drive vault stores the recovery secret, while Supabase stores only the encrypted private-key bundle behind owner-only RLS. It does not encrypt canonical family/contact/media rows; those contracts and repository changes belong to CR-04/05.

## Artifacts

- [Drive vault and custody contract](./DRIVE-VAULT-CONTRACT.md)
- [Threat-linked test matrix](./TEST-MATRIX.md)
- Browser authorization: [`src/security/googleDriveAuthorization.ts`](../../../../src/security/googleDriveAuthorization.ts)
- Direct Drive client: [`src/security/googleDriveKeyVault.ts`](../../../../src/security/googleDriveKeyVault.ts)
- Recovery bootstrap/coordinator: [`src/security/recoveryBootstrap.ts`](../../../../src/security/recoveryBootstrap.ts), [`src/security/recoveryVaultCoordinator.ts`](../../../../src/security/recoveryVaultCoordinator.ts)
- Owner-only encrypted-key schema: [`supabase/migrations/20260831000100_crypto_private_key_vault.sql`](../../../../supabase/migrations/20260831000100_crypto_private_key_vault.sql)
- User confirmation UI: [`src/components/data/RecoveryVaultPanel.tsx`](../../../../src/components/data/RecoveryVaultPanel.tsx)

## Locked decisions pending owner approval

1. Use a visible app-created `Famnesia Key Vault/vault-v1.json` with the non-sensitive `drive.file` scope; no Google Picker and no broad Drive scope.
2. Drive authorization is separate from Supabase login. Google Identity Services issues a short-lived browser access token held in memory only; Famnesia stores no Drive refresh token.
3. Split custody is mandatory: Drive/recovery kit contains the recovery secret but no encrypted private-key bundle; Supabase/per-user encrypted backup contains the encrypted private-key bundle but no recovery secret.
4. Vault creation is create-once and fail-closed: verify the Google account, ownership, exact versioned manifest, trust pins and public-key fingerprints; reject missing/corrupt/duplicate artifacts and never overwrite automatically.
5. Encryption activation stays `pending_drive` until the user downloads both recovery artifacts, stores them separately and explicitly confirms the permanent-loss warning.

Google documents `drive.file` as per-file, app-created/selected access and recommends it as a narrower non-sensitive scope. Its browser token model provides short-lived access tokens and requests another token after expiry rather than requiring the application to retain a refresh token: [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [GIS token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model).

## Validation record

Validated locally at `2026-08-31T07:58:12Z`:

- Implementation commit: `8c1792d`; security hardening commit: `765cc61`.
- `npm test`: 36 files / 167 tests pass; CR-03 target tests 20/20 pass.
- `npm run lint`: pass.
- `npm run build`: pass; existing non-blocking Vite chunk-size warning only.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities.
- `git diff --check`: pass.

Hardening covers cached-token invalidation after 401, exact Drive metadata checks, authenticated trust-pin matching, encrypted-record shape/AAD checks, public/private key-pair matching, bounded vault parsing, a two-download confirmation gate and fail-closed pending cleanup.

These checks prove local code/schema behavior with mocked Drive responses. The Supabase CLI is installed, but the local database stack was unavailable because the Docker/OrbStack daemon was not running; the migration therefore has structural tests only in this run. Nothing here proves the migration is applied to Production, the Google OAuth client is configured, Production RLS behavior, or a real two-account Drive/browser flow.

## Deployment/user actions still required after approval

1. Add `VITE_GOOGLE_DRIVE_CLIENT_ID` to Vercel Production/Preview. It must be the public Web OAuth client ID, not a secret and not the legacy server OAuth credential.
2. In that Google OAuth client, authorize the current Famnesia production and preview origins. Drive uses the GIS token flow; do not add an `/api/auth/callback` for this key-vault flow.
3. Apply migration `20260831000100_crypto_private_key_vault.sql` to Supabase, regenerate types from the target project, then redeploy.
4. Run a real-browser smoke with two Google accounts: create/confirm, restore second device, wrong-account rejection, expiry/reconnect and deletion/corruption fail-closed.

## Gate

Status: `AWAITING_OWNER_APPROVAL`.

CR-03 remains incomplete until owner approval is recorded. CR-04 must not start automatically.
