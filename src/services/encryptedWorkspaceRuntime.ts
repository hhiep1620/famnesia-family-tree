import { parseWrappedKeyEnvelope, unwrapKeyMaterial, wrapKeyMaterial } from '../crypto/keyContract'
import { WorkspaceKeyChannel, WorkspaceKeySession, type WorkspaceKeySessionDescriptor } from '../crypto/workspaceKeySession'
import { CURRENT_SCHEMA_VERSION } from '../schema/familyDataSchema'
import type { ProvisionedRecoveryIdentity } from '../security/recoveryBootstrap'
import type { WorkspaceInfo } from '../types/family'
import type { Json } from '../types/database.generated'
import { BrowserEncryptedCheckpointCoordinator } from './encryptedCheckpointCoordinator'
import { EncryptedFamilyRepository } from './encryptedFamilyRepository'
import { EncryptedFamilyRuntimeAdapter } from './encryptedFamilyRuntimeAdapter'
import { SupabaseEncryptedFamilyStore } from './encryptedFamilyStore'
import { getSupabaseBrowserClient } from './supabase/browserClient'

export type RecoveryIdentity = Pick<ProvisionedRecoveryIdentity, 'privateKeyRecord' | 'unwrappingPrivateKey' | 'signingPrivateKey'>

export interface UnlockedWorkspaceRuntime {
  repository: EncryptedFamilyRuntimeAdapter
  close(): void
}

const emptyFamilyData = () => ({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  profiles: [], persons: [], relationships: [], media: [],
  settings: { timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN', duplicateSuppressions: [] },
})

async function ownDirectory(workspaceId: string) {
  const client = getSupabaseBrowserClient()
  const { data: auth } = await client.auth.getUser()
  if (!auth.user) throw new Error('AUTH_REQUIRED')
  const { data, error } = await client.from('workspace_principal_directory')
    .select('principal_id,directory_revision').eq('workspace_id', workspaceId).eq('auth_user_id', auth.user.id).is('revoked_at', null).maybeSingle()
  if (error) throw error
  return data
}

async function workspaceDescriptor(workspaceId: string): Promise<WorkspaceKeySessionDescriptor | undefined> {
  const client = getSupabaseBrowserClient()
  const [directory, stateResult] = await Promise.all([
    ownDirectory(workspaceId),
    client.from('workspace_crypto_states').select('key_epoch,directory_revision,data_version').eq('workspace_id', workspaceId).maybeSingle(),
  ])
  if (stateResult.error) throw stateResult.error
  if (!directory || !stateResult.data || stateResult.data.data_version === 0) return undefined
  const envelope = await client.from('encrypted_key_envelopes').select('key_id')
    .eq('workspace_id', workspaceId).eq('recipient_principal_id', directory.principal_id).is('revoked_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (envelope.error) throw envelope.error
  if (!envelope.data) return undefined
  return { workspaceId, principalId: directory.principal_id, keyId: envelope.data.key_id,
    keyEpoch: stateResult.data.key_epoch, directoryRevision: stateResult.data.directory_revision }
}

function channelFor(session?: WorkspaceKeySession) {
  if (typeof BroadcastChannel === 'undefined') throw new Error('BROWSER_KEY_HANDOFF_UNAVAILABLE')
  return new WorkspaceKeyChannel(new BroadcastChannel('famnesia:workspace-key-handoff:v1'), session)
}

function readOnlyRuntime(workspace: WorkspaceInfo, session: WorkspaceKeySession): UnlockedWorkspaceRuntime {
  const client = getSupabaseBrowserClient()
  const channel = channelFor(session)
  const repository = new EncryptedFamilyRepository(new SupabaseEncryptedFamilyStore(client), session)
  const readonlyWorkspace = { ...workspace, canEdit: false, canUpload: false, canCommitDirectly: false, canReplaceData: false }
  return { repository: new EncryptedFamilyRuntimeAdapter(readonlyWorkspace, repository), close: () => channel.close() }
}

function writableRuntime(
  workspace: WorkspaceInfo,
  session: WorkspaceKeySession,
  identity: RecoveryIdentity,
  signingPublicKey: CryptoKey,
): { runtime: UnlockedWorkspaceRuntime; encrypted: EncryptedFamilyRepository } {
  const channel = channelFor(session)
  const encrypted = new EncryptedFamilyRepository(
    new SupabaseEncryptedFamilyStore(getSupabaseBrowserClient()), session, () => navigator.onLine,
    new BrowserEncryptedCheckpointCoordinator(session.principalId, identity.signingPrivateKey, signingPublicKey),
  )
  return {
    encrypted,
    runtime: { repository: new EncryptedFamilyRuntimeAdapter(workspace, encrypted), close: () => channel.close() },
  }
}

export async function unlockFromAnotherTab(workspace: WorkspaceInfo): Promise<UnlockedWorkspaceRuntime> {
  const descriptor = await workspaceDescriptor(workspace.id)
  if (!descriptor) throw new Error('WORKSPACE_KEY_NOT_PROVISIONED')
  const channel = channelFor()
  try {
    const session = await channel.request(descriptor, 1_800)
    channel.close()
    return readOnlyRuntime(workspace, session)
  } catch (error) {
    channel.close()
    throw error
  }
}

async function registerIdentity(identity: RecoveryIdentity): Promise<void> {
  const client = getSupabaseBrowserClient()
  const record = identity.privateKeyRecord
  const { error } = await client.rpc('register_crypto_principal', {
    p_principal_id: record.principalId,
    p_recovery_epoch: record.recoveryEpoch,
    p_signing_fingerprint: record.signingFingerprint,
    p_signing_public_key: record.signingPublicKey as Json,
    p_unwrap_fingerprint: record.unwrapFingerprint,
    p_unwrap_public_key: record.unwrapPublicKey as Json,
  })
  if (error) throw error
}

export async function unlockWithRecovery(workspace: WorkspaceInfo, identity: RecoveryIdentity): Promise<UnlockedWorkspaceRuntime> {
  const client = getSupabaseBrowserClient()
  await registerIdentity(identity)
  let directory = await ownDirectory(workspace.id)
  if (!directory) {
    if (!workspace.ownedByMe) throw new Error('OWNER_MUST_ENROLL_MEMBER_KEY')
    const initialized = await client.rpc('initialize_workspace_crypto', { p_workspace_id: workspace.id, p_principal_id: identity.privateKeyRecord.principalId })
    if (initialized.error) throw initialized.error
    directory = await ownDirectory(workspace.id)
  }
  if (!directory || directory.principal_id !== identity.privateKeyRecord.principalId) throw new Error('WORKSPACE_PRINCIPAL_MISMATCH')
  const stateResult = await client.from('workspace_crypto_states')
    .select('key_epoch,directory_revision,data_version').eq('workspace_id', workspace.id).single()
  if (stateResult.error || !stateResult.data) throw stateResult.error ?? new Error('CRYPTO_STATE_NOT_FOUND')
  const state = stateResult.data
  const signingPublicKey = await crypto.subtle.importKey('jwk', identity.privateKeyRecord.signingPublicKey,
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify'])
  const unwrapPublicKey = await crypto.subtle.importKey('jwk', identity.privateKeyRecord.unwrapPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' }, true, [])

  if (state.data_version === 0) {
    if (!workspace.ownedByMe) throw new Error('OWNER_MUST_BOOTSTRAP_WORKSPACE')
    const rawKey = crypto.getRandomValues(new Uint8Array(32))
    const keyId = `wk_${crypto.randomUUID()}`
    const context = {
      envelopeId: `env_${crypto.randomUUID()}`, workspaceId: workspace.id, entityId: 'workspace-root',
      recipientPrincipalId: directory.principal_id, recipientKeyFingerprint: identity.privateKeyRecord.unwrapFingerprint,
      keyId, keyPurpose: 'workspace' as const, keyEpoch: state.key_epoch, directoryRevision: state.directory_revision,
      issuerPrincipalId: directory.principal_id, issuerSigningFingerprint: identity.privateKeyRecord.signingFingerprint,
      expiresAt: Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 60 * 60,
    }
    const wrapped = await wrapKeyMaterial(rawKey, unwrapPublicKey, context, identity.signingPrivateKey, signingPublicKey)
    const session = await WorkspaceKeySession.fromRawKey({ workspaceId: workspace.id, principalId: directory.principal_id,
      keyId, keyEpoch: state.key_epoch, directoryRevision: state.directory_revision }, rawKey)
    const active = writableRuntime(workspace, session, identity, signingPublicKey)
    await active.encrypted.initialize(emptyFamilyData(), wrapped)
    return active.runtime
  }

  const envelopeResult = await client.from('encrypted_key_envelopes').select('wrapped_envelope,issuer_principal_id')
    .eq('workspace_id', workspace.id).eq('recipient_principal_id', directory.principal_id).eq('key_purpose', 'workspace')
    .is('revoked_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (envelopeResult.error || !envelopeResult.data) throw envelopeResult.error ?? new Error('WORKSPACE_KEY_ENVELOPE_MISSING')
  const wrapped = parseWrappedKeyEnvelope(envelopeResult.data.wrapped_envelope)
  const issuerResult = await client.from('crypto_principals').select('signing_public_key')
    .eq('principal_id', envelopeResult.data.issuer_principal_id).single()
  if (issuerResult.error || !issuerResult.data) throw issuerResult.error ?? new Error('KEY_ISSUER_NOT_FOUND')
  const issuerPublicKey = await crypto.subtle.importKey('jwk', issuerResult.data.signing_public_key as JsonWebKey,
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify'])
  const rawKey = await unwrapKeyMaterial(wrapped, identity.unwrappingPrivateKey, unwrapPublicKey, wrapped.context, issuerPublicKey, Math.floor(Date.now() / 1000))
  const session = await WorkspaceKeySession.fromRawKey({ workspaceId: workspace.id, principalId: directory.principal_id,
    keyId: wrapped.context.keyId, keyEpoch: state.key_epoch, directoryRevision: state.directory_revision }, rawKey)
  return writableRuntime(workspace, session, identity, signingPublicKey).runtime
}
