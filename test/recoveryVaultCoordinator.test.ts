import { describe, expect, it, vi } from 'vitest'
import { RecoveryVaultCoordinator } from '../src/security/recoveryVaultCoordinator'
import type { RecoveryPrivateKeyRepository, StoredPrivateKeyRecord } from '../src/security/recoveryPrivateKeyRepository'

function repositoryFixture(): RecoveryPrivateKeyRepository & { stored?: StoredPrivateKeyRecord } {
  return {
    stored: undefined,
    async load() { return this.stored },
    async savePending(record) { this.stored = { record, state: 'pending_drive' } },
    async activate(principalId) {
      if (!this.stored || this.stored.record.principalId !== principalId) throw new Error('not pending')
      this.stored.state = 'active'
    },
    async discardPending() { this.stored = undefined },
  }
}

describe('CR-03 recovery setup confirmation', () => {
  it('does not activate encryption until the user confirms both recovery artifacts are saved', async () => {
    const repository = repositoryFixture()
    let vault: unknown
    const drive = {
      async createVault(_email: string, value: unknown) { vault = value; return { folderId: 'folder', fileId: 'file' } },
      async restoreVault() { return { folderId: 'folder', fileId: 'file', vault } },
    }
    const coordinator = new RecoveryVaultCoordinator(repository, drive as never)
    const pending = await coordinator.prepareNewIdentity('owner@example.com')

    expect(repository.stored?.state).toBe('pending_drive')
    expect(pending.driveVaultDownload).toContain('famnesia-key-vault')
    expect(pending.encryptedBackupDownload).not.toContain('recoverySecret')
    await pending.confirmArtifactsSaved()
    expect(repository.stored?.state).toBe('active')
    await expect(coordinator.restore('owner@example.com')).resolves.toMatchObject({ vault: { principalId: pending.principalId } })
  })

  it('preserves pending state after an unknown Drive outcome to prevent a second secret overwrite', async () => {
    const repository = repositoryFixture()
    const drive = { createVault: vi.fn(async () => { throw new Error('Drive unavailable') }) }
    const coordinator = new RecoveryVaultCoordinator(repository, drive as never)
    await expect(coordinator.prepareNewIdentity('owner@example.com')).rejects.toThrow('Drive unavailable')
    expect(repository.stored?.state).toBe('pending_drive')
  })

  it('resumes and verifies a pending setup after reload instead of creating a second vault', async () => {
    const repository = repositoryFixture()
    let vault: unknown
    const drive = {
      createVault: vi.fn(async (_email: string, value: unknown) => { vault = value; return { folderId: 'folder', fileId: 'file' } }),
      restoreVault: vi.fn(async () => ({ folderId: 'folder', fileId: 'file', vault })),
    }
    const firstCoordinator = new RecoveryVaultCoordinator(repository, drive as never)
    const first = await firstCoordinator.prepareNewIdentity('owner@example.com')
    const secondCoordinator = new RecoveryVaultCoordinator(repository, drive as never)
    const resumed = await secondCoordinator.prepareNewIdentity('owner@example.com')

    expect(resumed.principalId).toBe(first.principalId)
    expect(drive.createVault).toHaveBeenCalledTimes(1)
    expect(drive.restoreVault).toHaveBeenCalledTimes(1)
    await resumed.confirmArtifactsSaved()
    expect(repository.stored?.state).toBe('active')
  })
})
