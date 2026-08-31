import { DriveVaultError, GoogleDriveKeyVaultClient } from './googleDriveKeyVault'
import {
  provisionRecoveryIdentity,
  parsePerUserRecoveryBackup,
  restoreRecoveryIdentity,
  serializeRecoveryArtifact,
  type PerUserRecoveryBackupV1,
  type ProvisionedRecoveryIdentity,
  type TrustPinV1,
} from './recoveryBootstrap'
import type { RecoveryPrivateKeyRepository } from './recoveryPrivateKeyRepository'
import { canonicalize } from '../crypto/contract'

function trustPinsMatch(left: TrustPinV1[], right: TrustPinV1[]): boolean {
  const normalize = (pins: TrustPinV1[]) => [...pins].sort((a, b) => a.workspaceId.localeCompare(b.workspaceId))
  return canonicalize(normalize(left)) === canonicalize(normalize(right))
}

export interface PendingRecoverySetup {
  principalId: string
  driveVaultDownload: string
  encryptedBackupDownload: string
  /** Must be invoked only after the user confirms both artifacts are saved separately. */
  confirmArtifactsSaved(): Promise<ProvisionedRecoveryIdentity>
}

export function canConfirmRecoveryArtifacts(downloadedDriveKit: boolean, downloadedEncryptedBackup: boolean, acknowledged: boolean): boolean {
  return downloadedDriveKit && downloadedEncryptedBackup && acknowledged
}

export class RecoveryVaultCoordinator {
  private readonly repository: RecoveryPrivateKeyRepository
  private readonly drive: GoogleDriveKeyVaultClient

  constructor(
    repository: RecoveryPrivateKeyRepository,
    drive: GoogleDriveKeyVaultClient,
  ) {
    this.repository = repository
    this.drive = drive
  }

  async prepareNewIdentity(email: string, trustPins: TrustPinV1[] = []): Promise<PendingRecoverySetup> {
    const existing = await this.repository.load()
    if (existing?.state === 'active') throw new Error('RECOVERY_IDENTITY_ALREADY_EXISTS')
    if (existing?.state === 'pending_drive') {
      const restored = await this.drive.restoreVault(email)
      const identity = await restoreRecoveryIdentity(restored.vault, existing.record)
      return this.pendingSetup({
        vault: restored.vault,
        privateKeyRecord: existing.record,
        recoveryBackup: {
          format: 'famnesia-user-recovery-backup',
          version: 1,
          principalId: existing.record.principalId,
          encryptedPrivateKey: existing.record,
          trustPins: restored.vault.trustPins,
        },
        unwrappingPrivateKey: identity.unwrappingPrivateKey,
        signingPrivateKey: identity.signingPrivateKey,
      })
    }
    const provisioned = await provisionRecoveryIdentity(trustPins)
    await this.repository.savePending(provisioned.privateKeyRecord)
    // Preserve the pending record on an unknown Drive outcome. A timed-out
    // create may still have committed; retry must restore and verify it rather
    // than create/overwrite a second secret.
    await this.drive.createVault(email, provisioned.vault)
    return this.pendingSetup(provisioned)
  }

  private pendingSetup(provisioned: ProvisionedRecoveryIdentity): PendingRecoverySetup {
    let confirmed = false
    return {
      principalId: provisioned.privateKeyRecord.principalId,
      driveVaultDownload: serializeRecoveryArtifact(provisioned.vault),
      encryptedBackupDownload: serializeRecoveryArtifact(provisioned.recoveryBackup),
      confirmArtifactsSaved: async () => {
        if (!confirmed) {
          await this.repository.activate(provisioned.privateKeyRecord.principalId)
          confirmed = true
        }
        return provisioned
      },
    }
  }

  async discardPendingAfterConfirmedMissingVault(email: string): Promise<void> {
    const existing = await this.repository.load()
    if (!existing || existing.state !== 'pending_drive') throw new Error('RECOVERY_SETUP_NOT_PENDING')
    try {
      await this.drive.restoreVault(email)
    } catch (caught) {
      if (caught instanceof DriveVaultError && caught.code === 'KEY_VAULT_MISSING') {
        await this.repository.discardPending(existing.record.principalId)
        return
      }
      throw caught
    }
    throw new Error('RECOVERY_KEY_VAULT_EXISTS')
  }

  async restore(email: string, backup?: PerUserRecoveryBackupV1) {
    const driveResult = await this.drive.restoreVault(email)
    const stored = await this.repository.load()
    const validatedBackup = backup ? parsePerUserRecoveryBackup(backup) : undefined
    const record = stored?.record ?? validatedBackup?.encryptedPrivateKey
    if (!record) throw new Error('RECOVERY_PRIVATE_KEY_BACKUP_REQUIRED')
    if (stored && stored.state !== 'active') throw new Error('RECOVERY_SETUP_NOT_CONFIRMED')
    if (validatedBackup && validatedBackup.principalId !== record.principalId) throw new Error('RECOVERY_BACKUP_MISMATCH')
    if (validatedBackup && !trustPinsMatch(validatedBackup.trustPins, driveResult.vault.trustPins)) {
      throw new Error('RECOVERY_BACKUP_TRUST_MISMATCH')
    }
    return restoreRecoveryIdentity(driveResult.vault, record)
  }
}
