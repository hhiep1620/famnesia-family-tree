import { requireAuth } from '../../_server/auth.js'
import { AppError, assertSameOrigin, json, pathParameter, readJsonLimited, requireMethod, withErrors } from '../../_server/http.js'
import { createSupabaseAdminClient } from '../../_server/supabase/adminClient.js'
import { encodeBase64Url } from '../../../src/crypto/contract.js'
import { parseContactPolicyArtifact, verifyContactPolicy } from '../../../src/privacy/contactPolicy.js'
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
      if (auth.backend !== 'supabase') throw new AppError(409, 'SUPABASE_AUTH_REQUIRED', 'Encrypted contact policy requires Supabase authentication.')
      const workspaceId = pathParameter(request, 'workspaces')
      const artifact = parseContactPolicyArtifact((await readJsonLimited<{ artifact?: unknown }>(request, 128 * 1024)).artifact)
      if (artifact.payload.workspaceId !== workspaceId) throw new AppError(400, 'CONTACT_POLICY_WORKSPACE_MISMATCH', 'Policy workspace does not match the route.')
      const admin = createSupabaseAdminClient()
      const [{ data: state }, { data: workspace }, { data: principal }, { data: subject }] = await Promise.all([
        admin.from('workspace_crypto_states').select('policy_revision,graph_revision,binding_revision').eq('workspace_id', workspaceId).single(),
        admin.from('workspaces').select('owner_user_id').eq('id', workspaceId).single(),
        admin.from('crypto_principals').select('principal_id,auth_user_id,signing_public_key,signing_fingerprint')
          .eq('principal_id', artifact.signerPrincipalId).single(),
        admin.from('member_person_bindings').select('binding_id,principal_id,pinned_signing_fingerprint,state')
          .eq('workspace_id', workspaceId).eq('profile_id', artifact.payload.profileId).eq('person_id', artifact.payload.personId)
          .eq('state', 'confirmed').maybeSingle(),
      ])
      if (!state || !workspace || !principal) throw new AppError(404, 'CONTACT_POLICY_CONTEXT_NOT_FOUND', 'Policy verification context was not found.')
      if (principal.auth_user_id !== auth.user.id) throw new AppError(403, 'CONTACT_POLICY_SIGNER_IDENTITY_MISMATCH', 'The authenticated user does not own this signing principal.')
      if (subject) {
        if (subject.binding_id !== artifact.payload.subjectBindingId || subject.principal_id !== principal.principal_id ||
            subject.pinned_signing_fingerprint !== principal.signing_fingerprint) {
          throw new AppError(403, 'CONTACT_POLICY_SUBJECT_REQUIRED', 'The bound person must sign their own contact policy.')
        }
      } else if (workspace.owner_user_id !== auth.user.id || artifact.payload.subjectBindingId !== null) {
        throw new AppError(403, 'CONTACT_POLICY_STEWARD_REQUIRED', 'Only the workspace owner may steward an unbound person policy.')
      }
      const publicKey = await crypto.subtle.importKey('jwk', principal.signing_public_key as JsonWebKey,
        { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify'])
      const nowEpochSeconds = Math.floor(Date.now() / 1000)
      const valid = await verifyContactPolicy(artifact, publicKey, {
        principalId: principal.principal_id, fingerprint: principal.signing_fingerprint,
        policyRevision: state.policy_revision + 1, graphRevision: state.graph_revision,
        bindingRevision: state.binding_revision, nowEpochSeconds,
      })
      if (!valid) throw new AppError(403, 'CONTACT_POLICY_SIGNATURE_INVALID', 'Policy signature or revision binding is invalid.')
      const { data, error } = await admin.rpc('register_verified_contact_policy', {
        p_policy_id: artifact.payload.policyId, p_workspace_id: workspaceId, p_profile_id: artifact.payload.profileId,
        p_person_id: artifact.payload.personId, p_field_class: artifact.payload.fieldClass,
        p_policy_principal_id: principal.principal_id, p_subject_binding_id: artifact.payload.subjectBindingId!,
        p_audience: artifact.payload.audience, p_allow_principal_ids: artifact.payload.allowPrincipalIds,
        p_deny_principal_ids: artifact.payload.denyPrincipalIds, p_recipient_principal_ids: artifact.payload.recipientPrincipalIds,
        p_policy_revision: artifact.payload.policyRevision, p_graph_revision: artifact.payload.graphRevision,
        p_binding_revision: artifact.payload.bindingRevision, p_key_epoch: artifact.payload.keyEpoch,
        p_signer_fingerprint: principal.signing_fingerprint, p_nonce_hash: await nonceHash(artifact.payload.nonce),
        p_artifact: artifact as unknown as Json, p_verified_at: new Date(nowEpochSeconds * 1000).toISOString(),
        p_expires_at: new Date(artifact.payload.expiresAt * 1000).toISOString(),
      })
      if (error || !data) throw new AppError(409, 'CONTACT_POLICY_REGISTRATION_FAILED', 'Verified contact policy could not be registered.')
      return json({ policy: data }, { status: 201 })
    })
  },
}
