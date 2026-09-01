import { requireAuth } from '../../_server/auth.js'
import { AppError, assertSameOrigin, json, pathParameter, readJsonLimited, requireMethod, withErrors } from '../../_server/http.js'
import { createSupabaseAdminClient } from '../../_server/supabase/adminClient.js'
import { encodeBase64Url } from '../../../src/crypto/contract.js'
import { parseContactEditArtifact, verifyContactEditAuthorization } from '../../../src/privacy/contactPolicy.js'
import type { Json } from '../../../src/types/database.generated.js'

async function nonceHash(nonce: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce))
  return `sha256:${encodeBase64Url(new Uint8Array(digest))}`
}

export default {
  fetch(request: Request) {
    return withErrors(async () => {
      requireMethod(request, ['POST']); assertSameOrigin(request)
      const auth = await requireAuth(request)
      if (auth.backend !== 'supabase') throw new AppError(409, 'SUPABASE_AUTH_REQUIRED', 'Encrypted contact authorization requires Supabase authentication.')
      const workspaceId = pathParameter(request, 'workspaces')
      const artifact = parseContactEditArtifact((await readJsonLimited<{ artifact?: unknown }>(request, 64 * 1024)).artifact)
      if (artifact.payload.workspaceId !== workspaceId) throw new AppError(400, 'CONTACT_AUTHORIZATION_WORKSPACE_MISMATCH', 'Authorization workspace does not match the route.')
      const admin = createSupabaseAdminClient()
      const [{ data: policy }, { data: signer }] = await Promise.all([
        admin.from('contact_policy_artifacts').select('policy_principal_id,signer_fingerprint,policy_revision,graph_revision,binding_revision,key_epoch')
          .eq('workspace_id', workspaceId).eq('person_id', artifact.payload.personId).eq('field_class', artifact.payload.fieldClass)
          .eq('active', true).is('revoked_at', null).single(),
        admin.from('crypto_principals').select('principal_id,auth_user_id,signing_public_key,signing_fingerprint')
          .eq('principal_id', artifact.signerPrincipalId).single(),
      ])
      if (!policy || !signer) throw new AppError(404, 'CONTACT_POLICY_CONTEXT_NOT_FOUND', 'Active policy context was not found.')
      if (signer.auth_user_id !== auth.user.id || signer.principal_id !== policy.policy_principal_id ||
          signer.signing_fingerprint !== policy.signer_fingerprint) {
        throw new AppError(403, 'CONTACT_AUTHORIZATION_SIGNER_MISMATCH', 'Only the active policy principal may authorize contact edits.')
      }
      const publicKey = await crypto.subtle.importKey('jwk', signer.signing_public_key as JsonWebKey,
        { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify'])
      const nowEpochSeconds = Math.floor(Date.now() / 1000)
      const valid = await verifyContactEditAuthorization(artifact, publicKey, {
        policyPrincipalId: signer.principal_id, fingerprint: signer.signing_fingerprint,
        policyRevision: policy.policy_revision, graphRevision: policy.graph_revision,
        bindingRevision: policy.binding_revision, keyEpoch: policy.key_epoch, nowEpochSeconds,
      })
      if (!valid) throw new AppError(403, 'CONTACT_AUTHORIZATION_SIGNATURE_INVALID', 'Edit authorization signature or scope is invalid.')
      const { error } = await admin.rpc('register_verified_contact_edit_authorization', {
        p_authorization_id: artifact.payload.authorizationId, p_workspace_id: workspaceId,
        p_actor_principal_id: artifact.payload.actorPrincipalId, p_person_id: artifact.payload.personId,
        p_field_class: artifact.payload.fieldClass, p_policy_revision: artifact.payload.policyRevision,
        p_graph_revision: artifact.payload.graphRevision, p_binding_revision: artifact.payload.bindingRevision,
        p_key_epoch: artifact.payload.keyEpoch, p_nonce_hash: await nonceHash(artifact.payload.nonce),
        p_artifact: artifact as unknown as Json, p_verified_at: new Date(nowEpochSeconds * 1000).toISOString(),
        p_expires_at: new Date(artifact.payload.expiresAt * 1000).toISOString(),
      })
      if (error) throw new AppError(409, 'CONTACT_AUTHORIZATION_REGISTRATION_FAILED', 'Verified edit authorization could not be registered.')
      return json({ authorizationId: artifact.payload.authorizationId }, { status: 201 })
    })
  },
}
