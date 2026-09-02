import { checkpointContentHash, signCheckpointIntent, type CheckpointIntentPayloadV1 } from '../crypto/collaborationContract'
import type { CiphertextCommitRequest, EncryptedWorkspaceState } from './encryptedFamilyStore'
import type { EncryptedCheckpointCoordinator } from './encryptedFamilyRepository'
import { apiRequest, jsonBody } from './apiClient'

export class BrowserEncryptedCheckpointCoordinator implements EncryptedCheckpointCoordinator {
  private readonly principalId: string
  private readonly signingPrivateKey: CryptoKey
  private readonly signingPublicKey: CryptoKey

  constructor(principalId: string, signingPrivateKey: CryptoKey, signingPublicKey: CryptoKey) {
    this.principalId = principalId
    this.signingPrivateKey = signingPrivateKey
    this.signingPublicKey = signingPublicKey
  }

  async register(request: CiphertextCommitRequest, state: EncryptedWorkspaceState): Promise<void> {
    const issuedAt = Math.floor(Date.now() / 1000)
    const content = {
      checkpointId: request.checkpointId,
      workspaceId: request.workspaceId,
      commitId: request.commitId,
      actorPrincipalId: this.principalId,
      delegationId: null,
      requestChecksum: request.requestChecksum,
      membershipEpoch: request.expectedMembershipEpoch,
      keyEpoch: request.expectedKeyEpoch,
      previousCheckpointRevision: state.checkpointRevision,
      previousCheckpointHash: state.checkpointHash ?? null,
      externalAnchorHash: state.checkpointHash ?? request.requestChecksum,
      issuedAt,
      expiresAt: issuedAt + 180,
      nonce: `nonce_${crypto.randomUUID()}`,
    }
    const payload = { ...content, nextCheckpointHash: await checkpointContentHash(content) } as CheckpointIntentPayloadV1
    const artifact = await signCheckpointIntent(payload, this.principalId, this.signingPrivateKey, this.signingPublicKey)
    await apiRequest(`/api/workspaces/${encodeURIComponent(request.workspaceId)}/checkpoint-intent`, {
      method: 'POST', ...jsonBody({ artifact, request }),
    })
  }
}
