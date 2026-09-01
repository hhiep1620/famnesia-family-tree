import { requireAuth } from '../../_server/auth.js'
import { AppError, assertSameOrigin, json, pathParameter, readJsonLimited, requireMethod, withErrors } from '../../_server/http.js'
import { createSupabaseAdminClient } from '../../_server/supabase/adminClient.js'
import { parseCheckpointIntentArtifact, verifyCheckpointIntent } from '../../../src/crypto/collaborationContract.js'
import { canonicalize, encodeBase64Url } from '../../../src/crypto/contract.js'
import { parseEncryptedCommitRequest } from '../../../src/crypto/encryptedDataContract.js'
import type { Json } from '../../../src/types/database.generated.js'

async function requestChecksum(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalize(value)))
  return `sha256:${encodeBase64Url(new Uint8Array(digest))}`
}

export default {
  fetch(request: Request) {
    return withErrors(async () => {
      requireMethod(request, ['POST']); assertSameOrigin(request)
      const auth = await requireAuth(request)
      if (auth.backend !== 'supabase') throw new AppError(409, 'SUPABASE_AUTH_REQUIRED', 'Checkpoint intent requires Supabase authentication.')
      const workspaceId = pathParameter(request, 'workspaces')
      const body = await readJsonLimited<{ artifact?: unknown; request?: unknown }>(request, 512 * 1024)
      const artifact = parseCheckpointIntentArtifact(body.artifact)
      const commitRequest = parseEncryptedCommitRequest(body.request)
      if (artifact.payload.workspaceId !== workspaceId) throw new AppError(400, 'CHECKPOINT_WORKSPACE_MISMATCH', 'Checkpoint workspace does not match the route.')
      const { requestChecksum: suppliedChecksum, ...unsignedRequest } = commitRequest
      if (await requestChecksum(unsignedRequest) !== suppliedChecksum || artifact.payload.requestChecksum !== suppliedChecksum ||
          artifact.payload.commitId !== commitRequest.commitId || artifact.payload.checkpointId !== commitRequest.checkpointId ||
          artifact.payload.workspaceId !== commitRequest.workspaceId || artifact.payload.membershipEpoch !== commitRequest.expectedMembershipEpoch ||
          artifact.payload.keyEpoch !== commitRequest.expectedKeyEpoch) {
        throw new AppError(400, 'CHECKPOINT_REQUEST_BINDING_MISMATCH', 'Checkpoint does not bind the exact encrypted commit request.')
      }
      const admin = createSupabaseAdminClient()
      const [{ data: workspace }, { data: state }, { data: directory }] = await Promise.all([
        admin.from('workspaces').select('owner_user_id').eq('id', workspaceId).single(),
        admin.from('workspace_crypto_states').select('membership_epoch,key_epoch,checkpoint_revision,checkpoint_hash')
          .eq('workspace_id', workspaceId).single(),
        admin.from('workspace_principal_directory').select('principal_id,auth_user_id').eq('workspace_id', workspaceId)
          .eq('principal_id', artifact.payload.actorPrincipalId).is('revoked_at', null).single(),
      ])
      if (!workspace || !state || !directory) throw new AppError(404, 'CHECKPOINT_CONTEXT_NOT_FOUND', 'Checkpoint verification context was not found.')
      if (directory.auth_user_id !== auth.user.id) throw new AppError(403, 'CHECKPOINT_ACTOR_MISMATCH', 'The authenticated user does not own the checkpoint signing principal.')
      const isOwner = workspace.owner_user_id === auth.user.id
      const { data: member } = isOwner ? { data: { role: 'owner' as const } } : await admin.from('workspace_members')
        .select('role').eq('workspace_id', workspaceId).eq('user_id', auth.user.id).single()
      if (!member || !['owner','editor'].includes(member.role)) throw new AppError(403, 'CHECKPOINT_ROLE_DENIED', 'Only a current owner or editor may register a commit checkpoint.')
      if ((member.role === 'owner' && artifact.payload.delegationId !== null) ||
          (member.role === 'editor' && artifact.payload.delegationId === null)) {
        throw new AppError(403, 'CHECKPOINT_DELEGATION_MISMATCH', 'Checkpoint delegation does not match the current role.')
      }
      if (member.role === 'editor') {
        const { data: delegation } = await admin.from('editor_commit_delegations').select('delegation_id')
          .eq('workspace_id', workspaceId).eq('delegation_id', artifact.payload.delegationId!)
          .eq('principal_id', directory.principal_id).eq('membership_epoch', state.membership_epoch)
          .is('revoked_at', null).gt('expires_at', new Date().toISOString()).single()
        if (!delegation) throw new AppError(403, 'ACTIVE_EDITOR_DELEGATION_REQUIRED', 'The editor delegation is missing, expired or revoked.')
      }
      const { data: actorPrincipal } = await admin.from('crypto_principals')
        .select('principal_id,signing_public_key,signing_fingerprint').eq('principal_id', directory.principal_id).single()
      if (!actorPrincipal) throw new AppError(404, 'ACTOR_PRINCIPAL_NOT_FOUND', 'The actor signing principal was not found.')
      const actorPublicKey = await crypto.subtle.importKey('jwk', actorPrincipal.signing_public_key as JsonWebKey,
        { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify'])
      const nowEpochSeconds = Math.floor(Date.now() / 1000)
      if (!await verifyCheckpointIntent(artifact, actorPublicKey, {
        actorPrincipalId: actorPrincipal.principal_id, actorFingerprint: actorPrincipal.signing_fingerprint,
        workspaceId, membershipEpoch: state.membership_epoch, keyEpoch: state.key_epoch,
        checkpointRevision: state.checkpoint_revision, checkpointHash: state.checkpoint_hash, nowEpochSeconds,
      })) throw new AppError(403, 'CHECKPOINT_SIGNATURE_INVALID', 'Checkpoint signature, chain or external anchor binding is invalid.')
      const { error } = await admin.rpc('register_verified_checkpoint_intent', {
        p_workspace_id: workspaceId, p_checkpoint_id: artifact.payload.checkpointId,
        p_actor_principal_id: artifact.payload.actorPrincipalId, p_delegation_id: artifact.payload.delegationId!,
        p_request_checksum: artifact.payload.requestChecksum, p_membership_epoch: artifact.payload.membershipEpoch,
        p_key_epoch: artifact.payload.keyEpoch, p_previous_checkpoint_revision: artifact.payload.previousCheckpointRevision,
        p_previous_checkpoint_hash: artifact.payload.previousCheckpointHash!, p_next_checkpoint_hash: artifact.payload.nextCheckpointHash,
        p_external_anchor_hash: artifact.payload.externalAnchorHash, p_artifact: artifact as unknown as Json,
        p_verified_at: new Date(nowEpochSeconds * 1000).toISOString(), p_expires_at: new Date(artifact.payload.expiresAt * 1000).toISOString(),
      })
      if (error) throw new AppError(409, 'CHECKPOINT_REGISTRATION_FAILED', 'Verified checkpoint intent could not be registered.')
      return json({ checkpointId: artifact.payload.checkpointId, checkpointHash: artifact.payload.nextCheckpointHash }, { status: 201 })
    })
  },
}
