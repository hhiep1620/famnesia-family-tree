import { describe, expect, it } from 'vitest'
import { canConfirmRecoveryArtifacts } from '../src/security/recoveryVaultCoordinator'

describe('CR-03 recovery artifact confirmation gate', () => {
  it('requires both download actions and the explicit acknowledgment', () => {
    expect(canConfirmRecoveryArtifacts(false, false, false)).toBe(false)
    expect(canConfirmRecoveryArtifacts(true, false, true)).toBe(false)
    expect(canConfirmRecoveryArtifacts(false, true, true)).toBe(false)
    expect(canConfirmRecoveryArtifacts(true, true, false)).toBe(false)
    expect(canConfirmRecoveryArtifacts(true, true, true)).toBe(true)
  })
})
