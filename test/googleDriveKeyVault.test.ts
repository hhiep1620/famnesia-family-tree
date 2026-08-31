import { describe, expect, it, vi } from 'vitest'
import { GoogleDriveKeyVaultClient, DriveVaultError } from '../src/security/googleDriveKeyVault'
import { provisionRecoveryIdentity } from '../src/security/recoveryBootstrap'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('CR-03 direct Google Drive key vault', () => {
  it('creates a visible app-owned folder and file without contacting Famnesia API', async () => {
    const identity = await provisionRecoveryIdentity()
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const responses = [
      jsonResponse({ user: { emailAddress: 'owner@example.com', permissionId: 'permission-1' } }),
      jsonResponse({ files: [] }),
      jsonResponse({ id: 'folder-1', name: 'Famnesia Key Vault', mimeType: 'application/vnd.google-apps.folder', ownedByMe: true }),
      jsonResponse({ files: [] }),
      jsonResponse({ id: 'vault-1', name: 'vault-v1.json', mimeType: 'application/json', ownedByMe: true }),
    ]
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      const response = responses.shift()
      if (!response) throw new Error('unexpected request')
      return response
    }) as unknown as typeof fetch
    const drive = new GoogleDriveKeyVaultClient(
      async () => ({ accessToken: 'memory-only-token', expiresAt: Date.now() + 60_000 }),
      fetcher,
    )

    await expect(drive.createVault('OWNER@example.com', identity.vault)).resolves.toEqual({ folderId: 'folder-1', fileId: 'vault-1' })
    expect(calls.every(({ url }) => url.startsWith('https://www.googleapis.com/'))).toBe(true)
    expect(calls.some(({ url }) => url.includes('/api/'))).toBe(false)
    expect(calls[2].url).toContain('/drive/v3/files?')
    expect(calls[2].url).not.toContain('/upload/')
    expect(String(calls[4].init?.body)).toContain(identity.vault.recoverySecret)
  })

  it('restores an owned vault and rejects wrong Drive account', async () => {
    const identity = await provisionRecoveryIdentity()
    const successResponses = [
      jsonResponse({ user: { emailAddress: 'owner@example.com', permissionId: 'permission-1' } }),
      jsonResponse({ files: [{ id: 'folder-1', name: 'Famnesia Key Vault', mimeType: 'application/vnd.google-apps.folder', ownedByMe: true }] }),
      jsonResponse({ files: [{ id: 'vault-1', name: 'vault-v1.json', mimeType: 'application/json', ownedByMe: true }] }),
      new Response(JSON.stringify(identity.vault), { status: 200 }),
    ]
    const fetcher = vi.fn(async () => successResponses.shift()!) as unknown as typeof fetch
    const drive = new GoogleDriveKeyVaultClient(async () => ({ accessToken: 'token', expiresAt: Date.now() + 60_000 }), fetcher)
    await expect(drive.restoreVault('owner@example.com')).resolves.toMatchObject({ fileId: 'vault-1', vault: { principalId: identity.vault.principalId } })

    const wrongAccount = new GoogleDriveKeyVaultClient(
      async () => ({ accessToken: 'token', expiresAt: Date.now() + 60_000 }),
      vi.fn(async () => jsonResponse({ user: { emailAddress: 'other@example.com', permissionId: 'permission-2' } })) as unknown as typeof fetch,
    )
    await expect(wrongAccount.restoreVault('owner@example.com')).rejects.toMatchObject({ code: 'DRIVE_ACCOUNT_MISMATCH' })
  })

  it('detects duplicates, corruption and an expired token', async () => {
    const duplicateResponses = [
      jsonResponse({ user: { emailAddress: 'owner@example.com', permissionId: 'permission-1' } }),
      jsonResponse({ files: [{ id: 'a', ownedByMe: true }, { id: 'b', ownedByMe: true }] }),
    ]
    const duplicate = new GoogleDriveKeyVaultClient(
      async () => ({ accessToken: 'token', expiresAt: Date.now() + 60_000 }),
      vi.fn(async () => duplicateResponses.shift()!) as unknown as typeof fetch,
    )
    await expect(duplicate.restoreVault('owner@example.com')).rejects.toMatchObject({ code: 'DUPLICATE_KEY_VAULT' })

    const expired = new GoogleDriveKeyVaultClient(async () => ({ accessToken: 'token', expiresAt: Date.now() - 1 }))
    await expect(expired.getIdentity()).rejects.toEqual(expect.objectContaining<Partial<DriveVaultError>>({ code: 'DRIVE_RECONNECT_REQUIRED' }))
  })
})
