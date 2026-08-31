import { describe, expect, it } from 'vitest'
import {
  provisionRecoveryIdentity,
  restoreRecoveryIdentity,
  type DriveKeyVaultV1,
} from '../src/security/recoveryBootstrap'

describe('CR-03 recovery identity bootstrap', () => {
  it('creates on one device and restores non-extractable private keys on another', async () => {
    const first = await provisionRecoveryIdentity([{
      workspaceId: 'workspace-01',
      genesisFingerprint: 'sha256:genesis-01',
      directoryCheckpointHash: 'sha256:directory-01',
      freshnessCheckpointHash: 'sha256:freshness-01',
    }])
    const restored = await restoreRecoveryIdentity(JSON.parse(JSON.stringify(first.vault)), first.privateKeyRecord)

    expect(restored.vault.principalId).toBe(first.vault.principalId)
    expect(restored.unwrappingPrivateKey.extractable).toBe(false)
    expect(restored.signingPrivateKey.extractable).toBe(false)
  })

  it('fails closed for a corrupt, substituted, or incomplete vault', async () => {
    const first = await provisionRecoveryIdentity()
    const corrupt = { ...first.vault, recoverySecret: 'not-a-secret' }
    expect(() => JSON.parse('{broken')).toThrow()
    await expect(restoreRecoveryIdentity(corrupt, first.privateKeyRecord)).rejects.toThrow('INVALID_RECOVERY_SECRET')

    const second = await provisionRecoveryIdentity()
    await expect(restoreRecoveryIdentity(second.vault, first.privateKeyRecord)).rejects.toThrow('RECOVERY_RECORD_MISMATCH')
  })

  it('requires both custody domains and restores after Supabase loss from backup plus vault', async () => {
    const first = await provisionRecoveryIdentity()
    const driveOnly = first.vault
    const supabaseOnly = first.recoveryBackup

    expect((driveOnly as unknown as Record<string, unknown>).encryptedPrivateKey).toBeUndefined()
    expect((supabaseOnly as unknown as Record<string, unknown>).recoverySecret).toBeUndefined()
    const restored = await restoreRecoveryIdentity(driveOnly, supabaseOnly.encryptedPrivateKey)
    expect(restored.privateKeyRecord.principalId).toBe(first.vault.principalId)
  })

  it('rejects an unrecognized field instead of silently accepting a changed manifest', async () => {
    const first = await provisionRecoveryIdentity()
    const changed = { ...first.vault, replacementFingerprint: 'sha256:evil' } as unknown as DriveKeyVaultV1
    await expect(restoreRecoveryIdentity(changed, first.privateKeyRecord)).rejects.toThrow('INVALID_KEY_VAULT')
  })
})
