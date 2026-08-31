import { describe, expect, it, vi } from 'vitest'
import { RecoveryVaultCoordinator } from '../src/security/recoveryVaultCoordinator'
import { DriveVaultError } from '../src/security/googleDriveKeyVault'
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
    async discardPending(principalId) {
      if (!this.stored || this.stored.record.principalId !== principalId || this.stored.state !== 'pending_drive') throw new Error('not pending')
      this.stored = undefined
    },
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

  it('only discards a pending record after Drive confirms that the vault is missing', async () => {
    const repository = repositoryFixture()
    const identityCoordinator = new RecoveryVaultCoordinator(repository, {
      async createVault() { throw new Error('Drive unavailable') },
    } as never)
    await expect(identityCoordinator.prepareNewIdentity('owner@example.com')).rejects.toThrow('Drive unavailable')

    const missingCoordinator = new RecoveryVaultCoordinator(repository, {
      async restoreVault() { throw new DriveVaultError('KEY_VAULT_MISSING', 'missing') },
    } as never)
    await expect(missingCoordinator.discardPendingAfterConfirmedMissingVault('owner@example.com')).resolves.toBeUndefined()
    expect(repository.stored).toBeUndefined()
  })

  it('does not discard pending state when a Drive vault exists or its state is unknown', async () => {
    const repository = repositoryFixture()
    let vault: unknown
    const setup = new RecoveryVaultCoordinator(repository, {
      async createVault(_email: string, value: unknown) { vault = value; return { folderId: 'folder', fileId: 'file' } },
    } as never)
    await setup.prepareNewIdentity('owner@example.com')

    const existing = new RecoveryVaultCoordinator(repository, {
      async restoreVault() { return { folderId: 'folder', fileId: 'file', vault } },
    } as never)
    await expect(existing.discardPendingAfterConfirmedMissingVault('owner@example.com')).rejects.toThrow('RECOVERY_KEY_VAULT_EXISTS')
    expect(repository.stored?.state).toBe('pending_drive')

    const unknown = new RecoveryVaultCoordinator(repository, {
      async restoreVault() { throw new DriveVaultError('DRIVE_REQUEST_FAILED', 'unknown') },
    } as never)
    await expect(unknown.discardPendingAfterConfirmedMissingVault('owner@example.com')).rejects.toMatchObject({ code: 'DRIVE_REQUEST_FAILED' })
    expect(repository.stored?.state).toBe('pending_drive')
  })

  it('rejects recovery-backup trust metadata that differs from the authenticated Drive vault', async () => {
    const repository = repositoryFixture()
    let vault: unknown
    const drive = {
      async createVault(_email: string, value: unknown) { vault = value; return { folderId: 'folder', fileId: 'file' } },
      async restoreVault() { return { folderId: 'folder', fileId: 'file', vault } },
    }
    const coordinator = new RecoveryVaultCoordinator(repository, drive as never)
    const pending = await coordinator.prepareNewIdentity('owner@example.com', [{
      workspaceId: 'workspace-01',
      genesisFingerprint: 'sha256:genesis-01',
      directoryCheckpointHash: 'sha256:directory-01',
      freshnessCheckpointHash: 'sha256:freshness-01',
    }])
    await pending.confirmArtifactsSaved()
    const backup = JSON.parse(pending.encryptedBackupDownload)
    backup.trustPins[0].freshnessCheckpointHash = 'sha256:attacker-change'

    await expect(coordinator.restore('owner@example.com', backup)).rejects.toThrow('RECOVERY_BACKUP_TRUST_MISMATCH')
  })
})
