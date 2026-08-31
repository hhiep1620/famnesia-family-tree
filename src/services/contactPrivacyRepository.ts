import type { SupabaseClient } from '@supabase/supabase-js'
import type { EncryptedEnvelopeV1 } from '../crypto/contract'
import type { PrivateFieldClass } from '../crypto/encryptedDataContract'
import type { WrappedKeyEnvelopeV1 } from '../crypto/keyContract'
import type { SignedArtifactV1 } from '../crypto/keyContract'
import type { ContactEditArtifactPayload, ContactPolicyArtifactPayload } from '../privacy/contactPolicy'
import type { Database, Json } from '../types/database.generated'
import { apiRequest, jsonBody } from './apiClient'

interface RotationResult { rotationId: string; state: 'prepared' | 'complete'; toKeyEpoch?: number; keyEpoch?: number; dataVersion?: number }
interface CommitResult { commitId: string; dataVersion: number; idempotent: boolean }

function result(value: Json, label: string): Record<string, Json | undefined> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`INVALID_${label}_RESULT`)
  return value as Record<string, Json | undefined>
}

function databaseError(error: { message: string; code?: string } | null): never {
  throw new Error(error?.code ? `${error.code}:${error.message}` : error?.message ?? 'CONTACT_PRIVACY_DATABASE_ERROR')
}

export class ContactPrivacyRepository {
  private readonly client: SupabaseClient<Database>
  constructor(client: SupabaseClient<Database>) { this.client = client }

  registerPolicy(workspaceId: string, artifact: SignedArtifactV1<ContactPolicyArtifactPayload>): Promise<{ policy: Json }> {
    return apiRequest(`/api/workspaces/${encodeURIComponent(workspaceId)}/contact-policy`, { method: 'POST', ...jsonBody({ artifact }) })
  }

  registerEditAuthorization(workspaceId: string, artifact: SignedArtifactV1<ContactEditArtifactPayload>): Promise<{ authorizationId: string }> {
    return apiRequest(`/api/workspaces/${encodeURIComponent(workspaceId)}/contact-authorization`, { method: 'POST', ...jsonBody({ artifact }) })
  }

  async beginRotation(input: { workspaceId: string; rotationId: string; personId: string; fieldClass: PrivateFieldClass;
    policyId: string; expectedFromEpoch: number; toKeyId: string; audienceManifestHmac: string }): Promise<RotationResult> {
    const { data, error } = await this.client.rpc('begin_contact_key_rotation', {
      p_workspace_id: input.workspaceId, p_rotation_id: input.rotationId, p_person_id: input.personId,
      p_field_class: input.fieldClass, p_policy_id: input.policyId, p_expected_from_epoch: input.expectedFromEpoch,
      p_to_key_id: input.toKeyId, p_audience_manifest_hmac: input.audienceManifestHmac,
    })
    if (error || !data) databaseError(error)
    return result(data, 'CONTACT_ROTATION') as unknown as RotationResult
  }

  async completeRotation(input: { workspaceId: string; rotationId: string; expectedDataVersion: number;
    envelope: EncryptedEnvelopeV1; wrappedKeys: WrappedKeyEnvelopeV1[] }): Promise<RotationResult> {
    const { data, error } = await this.client.rpc('complete_contact_key_rotation', {
      p_workspace_id: input.workspaceId, p_rotation_id: input.rotationId, p_expected_data_version: input.expectedDataVersion,
      p_envelope: input.envelope as unknown as Json, p_wrapped_envelopes: input.wrappedKeys as unknown as Json,
    })
    if (error || !data) databaseError(error)
    return result(data, 'CONTACT_ROTATION') as unknown as RotationResult
  }

  async write(input: { workspaceId: string; commitId: string; expectedDataVersion: number; personId: string;
    fieldClass: PrivateFieldClass; expectedRowVersion: number; authorizationId: string; keyId: string; keyEpoch: number;
    envelope?: EncryptedEnvelopeV1; clear?: boolean }): Promise<CommitResult> {
    if (!input.clear && !input.envelope) throw new Error('CONTACT_CIPHERTEXT_REQUIRED')
    const { data, error } = await this.client.rpc('commit_contact_field_write', {
      p_workspace_id: input.workspaceId, p_commit_id: input.commitId, p_expected_data_version: input.expectedDataVersion,
      p_person_id: input.personId, p_field_class: input.fieldClass, p_expected_row_version: input.expectedRowVersion,
      p_authorization_id: input.authorizationId, p_key_id: input.keyId, p_key_epoch: input.keyEpoch,
      p_envelope: (input.envelope ?? null) as unknown as Json, p_clear: Boolean(input.clear),
    })
    if (error || !data) databaseError(error)
    return result(data, 'CONTACT_COMMIT') as unknown as CommitResult
  }
}
