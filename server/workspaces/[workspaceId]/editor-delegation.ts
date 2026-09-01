import { requireAuth } from '../../_server/auth.js'
import { AppError, assertSameOrigin, json, pathParameter, readJsonLimited, requireMethod, withErrors } from '../../_server/http.js'
import { createSupabaseAdminClient } from '../../_server/supabase/adminClient.js'
import { parseEditorDelegationArtifact, verifyEditorDelegation } from '../../../src/crypto/collaborationContract.js'
import type { Json } from '../../../src/types/database.generated.js'

export default {
  fetch(request: Request) {
    return withErrors(async () => {
      requireMethod(request, ['POST']); assertSameOrigin(request)
      const auth = await requireAuth(request)
      if (auth.backend !== 'supabase') throw new AppError(409, 'SUPABASE_AUTH_REQUIRED', 'Editor delegation requires Supabase authentication.')
      const workspaceId = pathParameter(request, 'workspaces')
      const artifact = parseEditorDelegationArtifact((await readJsonLimited<{ artifact?: unknown }>(request, 64 * 1024)).artifact)
      if (artifact.payload.workspaceId !== workspaceId) throw new AppError(400, 'DELEGATION_WORKSPACE_MISMATCH', 'Delegation workspace does not match the route.')
      const admin = createSupabaseAdminClient()
      const [{ data: workspace }, { data: state }, { data: editorDirectory }] = await Promise.all([
        admin.from('workspaces').select('owner_user_id').eq('id', workspaceId).single(),
        admin.from('workspace_crypto_states').select('membership_epoch').eq('workspace_id', workspaceId).single(),
        admin.from('workspace_principal_directory').select('principal_id,auth_user_id').eq('workspace_id', workspaceId)
          .eq('principal_id', artifact.payload.editorPrincipalId).is('revoked_at', null).single(),
      ])
      if (!workspace || !state || !editorDirectory) throw new AppError(404, 'DELEGATION_CONTEXT_NOT_FOUND', 'Delegation verification context was not found.')
      if (workspace.owner_user_id !== auth.user.id) throw new AppError(403, 'OWNER_REQUIRED', 'Only the workspace owner may delegate editor commit authority.')
      const [{ data: ownerDirectory }, { data: editorMember }] = await Promise.all([
        admin.from('workspace_principal_directory').select('principal_id').eq('workspace_id', workspaceId)
          .eq('auth_user_id', workspace.owner_user_id).is('revoked_at', null).single(),
        admin.from('workspace_members').select('role').eq('workspace_id', workspaceId)
          .eq('user_id', editorDirectory.auth_user_id).eq('role', 'editor').single(),
      ])
      if (!ownerDirectory || !editorMember) throw new AppError(403, 'ACTIVE_EDITOR_REQUIRED', 'Delegation target must be a current editor.')
      const { data: ownerPrincipal } = await admin.from('crypto_principals')
        .select('principal_id,signing_public_key,signing_fingerprint').eq('principal_id', ownerDirectory.principal_id).single()
      if (!ownerPrincipal) throw new AppError(404, 'OWNER_PRINCIPAL_NOT_FOUND', 'The owner signing principal was not found.')
      const ownerPublicKey = await crypto.subtle.importKey('jwk', ownerPrincipal.signing_public_key as JsonWebKey,
        { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify'])
      const nowEpochSeconds = Math.floor(Date.now() / 1000)
      if (!await verifyEditorDelegation(artifact, ownerPublicKey, {
        ownerPrincipalId: ownerPrincipal.principal_id, ownerFingerprint: ownerPrincipal.signing_fingerprint,
        workspaceId, editorPrincipalId: editorDirectory.principal_id, membershipEpoch: state.membership_epoch, nowEpochSeconds,
      })) throw new AppError(403, 'EDITOR_DELEGATION_SIGNATURE_INVALID', 'Editor delegation signature or scope is invalid.')
      const { error } = await admin.rpc('register_verified_editor_delegation', {
        p_workspace_id: workspaceId, p_delegation_id: artifact.payload.delegationId,
        p_principal_id: artifact.payload.editorPrincipalId, p_membership_epoch: artifact.payload.membershipEpoch,
        p_scopes: artifact.payload.scopes, p_signer_fingerprint: artifact.signerKeyFingerprint,
        p_artifact: artifact as unknown as Json, p_verified_at: new Date(nowEpochSeconds * 1000).toISOString(),
        p_expires_at: new Date(artifact.payload.expiresAt * 1000).toISOString(),
      })
      if (error) throw new AppError(409, 'EDITOR_DELEGATION_REGISTRATION_FAILED', 'Verified editor delegation could not be registered.')
      return json({ delegationId: artifact.payload.delegationId }, { status: 201 })
    })
  },
}
