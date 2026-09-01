import { canonicalize, encodeBase64Url } from './contract'
import { signArtifact, verifyArtifact, type SignedArtifactV1 } from './keyContract'

export type EditorCommitScope = 'family_shared' | 'media' | 'contact'

export interface EditorDelegationPayloadV1 extends Record<string, unknown> {
  delegationId: string
  workspaceId: string
  editorPrincipalId: string
  role: 'editor'
  scopes: EditorCommitScope[]
  membershipEpoch: number
  issuedAt: number
  expiresAt: number
  nonce: string
}

export interface CheckpointIntentPayloadV1 extends Record<string, unknown> {
  checkpointId: string
  workspaceId: string
  commitId: string
  actorPrincipalId: string
  delegationId: string | null
  requestChecksum: string
  membershipEpoch: number
  keyEpoch: number
  previousCheckpointRevision: number
  previousCheckpointHash: string | null
  nextCheckpointHash: string
  externalAnchorHash: string
  issuedAt: number
  expiresAt: number
  nonce: string
}

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const hashPattern = /^sha256:[A-Za-z0-9_-]{43}$/u
const delegationKeys = ['delegationId','workspaceId','editorPrincipalId','role','scopes','membershipEpoch','issuedAt','expiresAt','nonce']
const checkpointKeys = ['checkpointId','workspaceId','commitId','actorPrincipalId','delegationId','requestChecksum','membershipEpoch','keyEpoch',
  'previousCheckpointRevision','previousCheckpointHash','nextCheckpointHash','externalAnchorHash','issuedAt','expiresAt','nonce']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join('|') === [...keys].sort().join('|')
}

function validId(value: unknown): value is string { return typeof value === 'string' && idPattern.test(value) }
function positive(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0 }
function nonnegative(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0 }
function validHash(value: unknown): value is string { return typeof value === 'string' && hashPattern.test(value) }

function validDelegationPayload(value: unknown): value is EditorDelegationPayloadV1 {
  if (!isRecord(value) || !exact(value, delegationKeys)) return false
  const payload = value as unknown as EditorDelegationPayloadV1
  return [payload.delegationId,payload.workspaceId,payload.editorPrincipalId,payload.nonce].every(validId) &&
    payload.role === 'editor' && positive(payload.membershipEpoch) && positive(payload.issuedAt) && positive(payload.expiresAt) &&
    payload.expiresAt > payload.issuedAt && payload.expiresAt <= payload.issuedAt + 86_400 &&
    Array.isArray(payload.scopes) && payload.scopes.length >= 1 && payload.scopes.length <= 3 &&
    payload.scopes.every((scope) => ['family_shared','media','contact'].includes(scope)) &&
    JSON.stringify(payload.scopes) === JSON.stringify([...new Set(payload.scopes)].sort())
}

function validCheckpointPayload(value: unknown): value is CheckpointIntentPayloadV1 {
  if (!isRecord(value) || !exact(value, checkpointKeys)) return false
  const payload = value as unknown as CheckpointIntentPayloadV1
  return [payload.checkpointId,payload.workspaceId,payload.commitId,payload.actorPrincipalId,payload.nonce].every(validId) &&
    (payload.delegationId === null || validId(payload.delegationId)) && validHash(payload.requestChecksum) &&
    positive(payload.membershipEpoch) && positive(payload.keyEpoch) && nonnegative(payload.previousCheckpointRevision) &&
    ((payload.previousCheckpointRevision === 0 && payload.previousCheckpointHash === null) ||
      (payload.previousCheckpointRevision > 0 && validHash(payload.previousCheckpointHash))) &&
    validHash(payload.nextCheckpointHash) && validHash(payload.externalAnchorHash) &&
    positive(payload.issuedAt) && positive(payload.expiresAt) && payload.expiresAt > payload.issuedAt &&
    payload.expiresAt <= payload.issuedAt + 300
}

function parseArtifact<T extends Record<string, unknown>>(
  value: unknown,
  purpose: 'delegation' | 'checkpoint',
  validPayload: (payload: unknown) => payload is T,
  errorCode: string,
): SignedArtifactV1<T> {
  if (!isRecord(value) || !exact(value, ['version','purpose','signerPrincipalId','signerKeyFingerprint','payload','signature'])) throw new Error(errorCode)
  if (value.version !== 1 || value.purpose !== purpose || !validId(value.signerPrincipalId) || !validHash(value.signerKeyFingerprint) ||
      typeof value.signature !== 'string' || !validPayload(value.payload)) throw new Error(errorCode)
  return value as unknown as SignedArtifactV1<T>
}

export function parseEditorDelegationArtifact(value: unknown): SignedArtifactV1<EditorDelegationPayloadV1> {
  return parseArtifact(value, 'delegation', validDelegationPayload, 'INVALID_EDITOR_DELEGATION_ARTIFACT')
}

export function parseCheckpointIntentArtifact(value: unknown): SignedArtifactV1<CheckpointIntentPayloadV1> {
  return parseArtifact(value, 'checkpoint', validCheckpointPayload, 'INVALID_CHECKPOINT_INTENT_ARTIFACT')
}

export async function checkpointContentHash(payload: Omit<CheckpointIntentPayloadV1, 'nextCheckpointHash'>): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalize({ domain: 'famnesia:checkpoint-intent:v1', ...payload }))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${encodeBase64Url(new Uint8Array(digest))}`
}

export async function signEditorDelegation(
  payload: EditorDelegationPayloadV1, signerPrincipalId: string, privateKey: CryptoKey, publicKey: CryptoKey,
): Promise<SignedArtifactV1<EditorDelegationPayloadV1>> {
  if (!validDelegationPayload(payload)) throw new Error('INVALID_EDITOR_DELEGATION_ARTIFACT')
  return signArtifact(payload, 'delegation', signerPrincipalId, privateKey, publicKey)
}

export async function verifyEditorDelegation(
  artifact: SignedArtifactV1<EditorDelegationPayloadV1>, publicKey: CryptoKey,
  expected: { ownerPrincipalId: string; ownerFingerprint: string; workspaceId: string; editorPrincipalId: string; membershipEpoch: number; nowEpochSeconds: number },
): Promise<boolean> {
  const payload = artifact?.payload
  if (!validDelegationPayload(payload) || payload.workspaceId !== expected.workspaceId || payload.editorPrincipalId !== expected.editorPrincipalId ||
      payload.membershipEpoch !== expected.membershipEpoch || payload.issuedAt > expected.nowEpochSeconds || payload.expiresAt <= expected.nowEpochSeconds) return false
  return verifyArtifact(artifact, publicKey, { purpose: 'delegation', principalId: expected.ownerPrincipalId, fingerprint: expected.ownerFingerprint })
}

export async function signCheckpointIntent(
  payload: CheckpointIntentPayloadV1, signerPrincipalId: string, privateKey: CryptoKey, publicKey: CryptoKey,
): Promise<SignedArtifactV1<CheckpointIntentPayloadV1>> {
  if (!validCheckpointPayload(payload)) throw new Error('INVALID_CHECKPOINT_INTENT_ARTIFACT')
  const { nextCheckpointHash: _next, ...content } = payload
  if (await checkpointContentHash(content) !== payload.nextCheckpointHash) throw new Error('CHECKPOINT_HASH_MISMATCH')
  return signArtifact(payload, 'checkpoint', signerPrincipalId, privateKey, publicKey)
}

export async function verifyCheckpointIntent(
  artifact: SignedArtifactV1<CheckpointIntentPayloadV1>, publicKey: CryptoKey,
  expected: { actorPrincipalId: string; actorFingerprint: string; workspaceId: string; membershipEpoch: number; keyEpoch: number;
    checkpointRevision: number; checkpointHash: string | null; nowEpochSeconds: number },
): Promise<boolean> {
  const payload = artifact?.payload
  if (!validCheckpointPayload(payload) || payload.workspaceId !== expected.workspaceId || payload.actorPrincipalId !== expected.actorPrincipalId ||
      payload.membershipEpoch !== expected.membershipEpoch || payload.keyEpoch !== expected.keyEpoch ||
      payload.previousCheckpointRevision !== expected.checkpointRevision || payload.previousCheckpointHash !== expected.checkpointHash ||
      (expected.checkpointHash !== null && payload.externalAnchorHash !== expected.checkpointHash) ||
      payload.issuedAt > expected.nowEpochSeconds || payload.expiresAt <= expected.nowEpochSeconds) return false
  const { nextCheckpointHash: _next, ...content } = payload
  if (await checkpointContentHash(content) !== payload.nextCheckpointHash) return false
  return verifyArtifact(artifact, publicKey, { purpose: 'checkpoint', principalId: expected.actorPrincipalId, fingerprint: expected.actorFingerprint })
}
