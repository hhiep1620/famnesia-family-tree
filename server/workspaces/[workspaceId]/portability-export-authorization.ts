import { requireAuth } from '../../_server/auth.js'
import { AppError, assertSameOrigin, json, pathParameter, readJsonLimited, requireMethod, withErrors } from '../../_server/http.js'
import { createSupabaseAdminClient } from '../../_server/supabase/adminClient.js'
import { parsePortabilityExportArtifact, verifyPortabilityExport, nonceHash } from '../../../src/privacy/portabilityExport.js'
import type { Json } from '../../../src/types/database.generated.js'

export default { fetch(request: Request) {
  return withErrors(async () => {
    requireMethod(request, ['POST']); assertSameOrigin(request)
    const auth = await requireAuth(request)
    if (auth.backend !== 'supabase') throw new AppError(409, 'SUPABASE_AUTH_REQUIRED', 'Portability export requires Supabase authentication.')
    const workspaceId = pathParameter(request, 'workspaces')
    const artifact = parsePortabilityExportArtifact((await readJsonLimited<{ artifact?: unknown }>(request, 96 * 1024)).artifact)
    if (artifact.payload.workspaceId !== workspaceId) throw new AppError(400, 'PORTABILITY_WORKSPACE_MISMATCH', 'Export workspace does not match the route.')
    const admin = createSupabaseAdminClient()
    const [{ data: principal }, { data: state }] = await Promise.all([
      admin.from('crypto_principals').select('principal_id,auth_user_id,signing_public_key,signing_fingerprint').eq('principal_id', artifact.signerPrincipalId).single(),
      admin.from('workspace_crypto_states').select('policy_revision,graph_revision,binding_revision,key_epoch').eq('workspace_id', workspaceId).single(),
    ])
    if (!principal || !state) throw new AppError(404, 'PORTABILITY_CONTEXT_NOT_FOUND', 'Export authorization context was not found.')
    if (principal.auth_user_id !== auth.user.id) throw new AppError(403, 'PORTABILITY_SIGNER_MISMATCH', 'The authenticated user does not own this signing principal.')
    const publicKey = await crypto.subtle.importKey('jwk', principal.signing_public_key as JsonWebKey, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify'])
    const nowEpochSeconds = Math.floor(Date.now() / 1000)
    if (!await verifyPortabilityExport(artifact, publicKey, { principalId: principal.principal_id, fingerprint: principal.signing_fingerprint,
      workspaceId, profileId: artifact.payload.profileId, format: artifact.payload.format, nowEpochSeconds })) {
      throw new AppError(403, 'PORTABILITY_SIGNATURE_INVALID', 'Export authorization signature, scope or expiry is invalid.')
    }
    if (artifact.payload.policyRevision !== state.policy_revision || artifact.payload.graphRevision !== state.graph_revision ||
        artifact.payload.bindingRevision !== state.binding_revision || artifact.payload.keyEpoch !== state.key_epoch) {
      throw new AppError(409, 'STALE_PORTABILITY_SCOPE', 'Export policy or key state is stale.')
    }
    const { error } = await admin.rpc('register_verified_portability_export_authorization', {
      p_authorization_id: artifact.payload.authorizationId, p_workspace_id: workspaceId, p_actor_principal_id: artifact.signerPrincipalId,
      p_profile_id: artifact.payload.profileId, p_format: artifact.payload.format, p_person_ids: artifact.payload.personIds as unknown as Json,
      p_fields: artifact.payload.fields as unknown as Json, p_policy_revision: artifact.payload.policyRevision,
      p_graph_revision: artifact.payload.graphRevision, p_binding_revision: artifact.payload.bindingRevision, p_key_epoch: artifact.payload.keyEpoch,
      p_nonce_hash: await nonceHash(artifact.payload.nonce), p_artifact: artifact as unknown as Json,
      p_verified_at: new Date(nowEpochSeconds * 1000).toISOString(), p_expires_at: new Date(artifact.payload.expiresAt * 1000).toISOString(),
    })
    if (error) throw new AppError(409, 'PORTABILITY_REGISTRATION_FAILED', 'Export authorization could not be registered.')
    return json({ authorizationId: artifact.payload.authorizationId, format: artifact.payload.format }, { status: 201 })
  })
} }
