import { describe, expect, it } from 'vitest'
import {
  checkpointContentHash, parseCheckpointIntentArtifact, parseEditorDelegationArtifact,
  signCheckpointIntent, signEditorDelegation, verifyCheckpointIntent, verifyEditorDelegation,
  type CheckpointIntentPayloadV1,
} from '../src/crypto/collaborationContract'
import { generateProvisioningSigningKeyPair, publicKeyFingerprint } from '../src/crypto/keyContract'

const hash = `sha256:${'A'.repeat(43)}`

describe('CR-08 signed collaboration contract', () => {
  it('accepts only an owner-signed, current, bounded editor delegation', async () => {
    const owner = await generateProvisioningSigningKeyPair()
    const fingerprint = await publicKeyFingerprint(owner.publicKey)
    const payload = { delegationId: 'delegation-1', workspaceId: 'workspace-1', editorPrincipalId: 'principal-editor',
      role: 'editor' as const, scopes: ['family_shared','media'] as const, membershipEpoch: 3,
      issuedAt: 1_900_000_000, expiresAt: 1_900_003_600, nonce: 'nonce-1' }
    const artifact = await signEditorDelegation({ ...payload, scopes: [...payload.scopes] }, 'principal-owner', owner.privateKey, owner.publicKey)
    expect(parseEditorDelegationArtifact(artifact)).toEqual(artifact)
    await expect(verifyEditorDelegation(artifact, owner.publicKey, { ownerPrincipalId: 'principal-owner', ownerFingerprint: fingerprint,
      workspaceId: 'workspace-1', editorPrincipalId: 'principal-editor', membershipEpoch: 3, nowEpochSeconds: 1_900_000_100 })).resolves.toBe(true)
    await expect(verifyEditorDelegation(artifact, owner.publicKey, { ownerPrincipalId: 'principal-owner', ownerFingerprint: fingerprint,
      workspaceId: 'workspace-1', editorPrincipalId: 'principal-editor', membershipEpoch: 4, nowEpochSeconds: 1_900_000_100 })).resolves.toBe(false)
    expect(() => parseEditorDelegationArtifact({ ...artifact, payload: { ...artifact.payload, scopes: ['media','family_shared'] } }))
      .toThrow('INVALID_EDITOR_DELEGATION_ARTIFACT')
  })

  it('binds a checkpoint signature to the exact chain, external anchor and request checksum', async () => {
    const actor = await generateProvisioningSigningKeyPair()
    const fingerprint = await publicKeyFingerprint(actor.publicKey)
    const content = { checkpointId: 'checkpoint-2', workspaceId: 'workspace-1', commitId: 'commit-2',
      actorPrincipalId: 'principal-editor', delegationId: 'delegation-1', requestChecksum: hash,
      membershipEpoch: 3, keyEpoch: 2, previousCheckpointRevision: 1, previousCheckpointHash: hash,
      externalAnchorHash: hash, issuedAt: 1_900_000_000, expiresAt: 1_900_000_120, nonce: 'nonce-2' }
    const payload: CheckpointIntentPayloadV1 = { ...content, nextCheckpointHash: await checkpointContentHash(content) }
    const artifact = await signCheckpointIntent(payload, 'principal-editor', actor.privateKey, actor.publicKey)
    expect(parseCheckpointIntentArtifact(artifact)).toEqual(artifact)
    const expected = { actorPrincipalId: 'principal-editor', actorFingerprint: fingerprint, workspaceId: 'workspace-1',
      membershipEpoch: 3, keyEpoch: 2, checkpointRevision: 1, checkpointHash: hash, nowEpochSeconds: 1_900_000_010 }
    await expect(verifyCheckpointIntent(artifact, actor.publicKey, expected)).resolves.toBe(true)
    await expect(verifyCheckpointIntent({ ...artifact, payload: { ...artifact.payload, requestChecksum: `sha256:${'B'.repeat(43)}` } },
      actor.publicKey, expected)).resolves.toBe(false)
    await expect(verifyCheckpointIntent(artifact, actor.publicKey, { ...expected, checkpointHash: `sha256:${'C'.repeat(43)}` }))
      .resolves.toBe(false)
  })
})
