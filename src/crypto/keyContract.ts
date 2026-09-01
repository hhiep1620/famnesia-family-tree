import { canonicalize, decodeBase64Url, encodeBase64Url } from './contract.js'

const encoder = new TextEncoder()
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const suite = 'FAMNESIA-P256-AESGCM-HKDF-SHA256-V1' as const

export type SigningPurpose = 'directory' | 'policy' | 'enrollment' | 'principal-rebind' | 'key-wrap' | 'delegation' | 'checkpoint' | 'portability_export'
export type WrappedKeyPurpose = 'workspace' | 'contact' | 'media' | 'recovery'

export interface SignedArtifactV1<T extends Record<string, unknown>> {
  version: 1
  purpose: SigningPurpose
  signerPrincipalId: string
  signerKeyFingerprint: string
  payload: T
  signature: string
}

export interface KeyWrapContextV1 {
  envelopeId: string
  workspaceId: string
  entityId: string
  recipientPrincipalId: string
  recipientKeyFingerprint: string
  keyId: string
  keyPurpose: WrappedKeyPurpose
  keyEpoch: number
  directoryRevision: number
  issuerPrincipalId: string
  issuerSigningFingerprint: string
  expiresAt: number
}

export interface WrappedKeyEnvelopeV1 {
  version: 1
  suite: typeof suite
  context: KeyWrapContextV1
  ephemeralPublicKey: JsonWebKey
  salt: string
  nonce: string
  wrappedKey: string
  issuerSignature: string
}

export interface SigningRotationV1 extends Record<string, unknown> {
  workspaceId: string
  fromRevision: number
  toRevision: number
  oldFingerprint: string
  newFingerprint: string
}

export interface EnrollmentInvitationV1 extends Record<string, unknown> {
  workspaceId: string
  genesisFingerprint: string
  ownerPrincipalId: string
  ownerSigningFingerprint: string
  invitationId: string
  expiresAt: number
  nonce: string
}

export interface FreshnessCheckpointV1 extends Record<string, unknown> {
  workspaceId: string
  revision: number
  directoryRevision: number
  previousCheckpointHash: string
  stateHash: string
  timestamp: number
}

export interface PrincipalRebindChallengeV1 extends Record<string, unknown> {
  principalId: string
  oldAuthUuid: string
  newAuthUuid: string
  challengeId: string
  unwrapProofHash: string
  expiresAt: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join('|') === [...keys].sort().join('|')
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && idPattern.test(value)
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0
}

function signingBytes<T extends Record<string, unknown>>(
  purpose: SigningPurpose,
  signerPrincipalId: string,
  signerKeyFingerprint: string,
  payload: T,
): Uint8Array {
  return encoder.encode(canonicalize({ version: 1, purpose, signerPrincipalId, signerKeyFingerprint, payload }))
}

function unsignedKeyEnvelope(envelope: WrappedKeyEnvelopeV1): Omit<WrappedKeyEnvelopeV1, 'issuerSignature'> {
  const { issuerSignature: _signature, ...unsigned } = envelope
  return unsigned
}

function validateKeyWrapContext(value: unknown): asserts value is KeyWrapContextV1 {
  if (!isRecord(value)) throw new Error('INVALID_KEY_CONTEXT')
  const keys = [
    'envelopeId', 'workspaceId', 'entityId', 'recipientPrincipalId', 'recipientKeyFingerprint', 'keyId',
    'keyPurpose', 'keyEpoch', 'directoryRevision', 'issuerPrincipalId', 'issuerSigningFingerprint', 'expiresAt',
  ]
  if (!hasExactKeys(value, keys)) throw new Error('INVALID_KEY_CONTEXT_SHAPE')
  for (const key of [
    'envelopeId', 'workspaceId', 'entityId', 'recipientPrincipalId', 'recipientKeyFingerprint', 'keyId',
    'issuerPrincipalId', 'issuerSigningFingerprint',
  ]) {
    if (!validId(value[key])) throw new Error('INVALID_KEY_CONTEXT_ID')
  }
  if (!['workspace', 'contact', 'media', 'recovery'].includes(String(value.keyPurpose))) throw new Error('INVALID_KEY_PURPOSE')
  for (const key of ['keyEpoch', 'directoryRevision', 'expiresAt']) {
    if (!positiveInteger(value[key])) throw new Error('INVALID_KEY_CONTEXT_VERSION')
  }
}

export function parseWrappedKeyEnvelope(value: unknown): WrappedKeyEnvelopeV1 {
  if (!isRecord(value)) throw new Error('INVALID_KEY_ENVELOPE')
  if (!hasExactKeys(value, ['version', 'suite', 'context', 'ephemeralPublicKey', 'salt', 'nonce', 'wrappedKey', 'issuerSignature'])) {
    throw new Error('INVALID_KEY_ENVELOPE_SHAPE')
  }
  if (value.version !== 1 || value.suite !== suite) throw new Error('UNSUPPORTED_KEY_ENVELOPE')
  validateKeyWrapContext(value.context)
  if (!isRecord(value.ephemeralPublicKey) || value.ephemeralPublicKey.kty !== 'EC' || value.ephemeralPublicKey.crv !== 'P-256') {
    throw new Error('INVALID_EPHEMERAL_KEY')
  }
  if (typeof value.salt !== 'string' || decodeBase64Url(value.salt).length !== 32) throw new Error('INVALID_WRAP_SALT')
  if (typeof value.nonce !== 'string' || decodeBase64Url(value.nonce).length !== 12) throw new Error('INVALID_WRAP_NONCE')
  if (typeof value.wrappedKey !== 'string' || decodeBase64Url(value.wrappedKey).length !== 48) throw new Error('INVALID_WRAPPED_KEY')
  if (typeof value.issuerSignature !== 'string' || decodeBase64Url(value.issuerSignature).length !== 64) throw new Error('INVALID_ISSUER_SIGNATURE')
  return value as unknown as WrappedKeyEnvelopeV1
}

// Provisioning keys are temporarily extractable only for atomic JWK export + encrypted bundle creation.
// General unlock must re-import the private JWK through the non-extractable helpers below.
export async function generateProvisioningUnwrappingKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
}

export async function generateProvisioningSigningKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
}

export async function importUnwrappingPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
}

export async function importSigningPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

export async function publicKeyFingerprint(publicKey: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey('spki', publicKey)
  const digest = await crypto.subtle.digest('SHA-256', spki)
  return `sha256:${encodeBase64Url(new Uint8Array(digest))}`
}

export async function signArtifact<T extends Record<string, unknown>>(
  payload: T,
  purpose: SigningPurpose,
  signerPrincipalId: string,
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<SignedArtifactV1<T>> {
  const signerKeyFingerprint = await publicKeyFingerprint(publicKey)
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, privateKey,
    signingBytes(purpose, signerPrincipalId, signerKeyFingerprint, payload) as BufferSource,
  )
  return { version: 1, purpose, signerPrincipalId, signerKeyFingerprint, payload, signature: encodeBase64Url(new Uint8Array(signature)) }
}

export async function verifyArtifact<T extends Record<string, unknown>>(
  artifact: SignedArtifactV1<T>,
  publicKey: CryptoKey,
  expected: { purpose: SigningPurpose; principalId: string; fingerprint: string },
): Promise<boolean> {
  if (!isRecord(artifact) || !hasExactKeys(artifact, ['version', 'purpose', 'signerPrincipalId', 'signerKeyFingerprint', 'payload', 'signature'])) return false
  if (artifact.version !== 1 || artifact.purpose !== expected.purpose) return false
  if (artifact.signerPrincipalId !== expected.principalId || artifact.signerKeyFingerprint !== expected.fingerprint) return false
  if ((await publicKeyFingerprint(publicKey)) !== expected.fingerprint) return false
  try {
    return crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, publicKey, decodeBase64Url(artifact.signature) as BufferSource,
      signingBytes(artifact.purpose, artifact.signerPrincipalId, artifact.signerKeyFingerprint, artifact.payload) as BufferSource,
    )
  } catch {
    return false
  }
}

export async function verifyRevisionedArtifact<T extends Record<string, unknown> & { revision: number }>(
  artifact: SignedArtifactV1<T>,
  publicKey: CryptoKey,
  expected: { purpose: SigningPurpose; principalId: string; fingerprint: string; revokedAtRevision?: number },
): Promise<boolean> {
  if (!positiveInteger(artifact.payload.revision)) return false
  if (expected.revokedAtRevision !== undefined && artifact.payload.revision >= expected.revokedAtRevision) return false
  return verifyArtifact(artifact, publicKey, expected)
}

async function deriveWrapKey(
  privateKey: CryptoKey, publicKey: CryptoKey, salt: Uint8Array, context: KeyWrapContextV1, usages: KeyUsage[],
): Promise<CryptoKey> {
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256)
  const hkdf = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: encoder.encode(canonicalize({ label: 'famnesia:key-wrap:v1', ...context })) as BufferSource },
    hkdf, { name: 'AES-GCM', length: 256 }, false, usages,
  )
}

export async function wrapKeyMaterial(
  rawKey: Uint8Array,
  recipientPublicKey: CryptoKey,
  context: KeyWrapContextV1,
  issuerPrivateKey: CryptoKey,
  issuerPublicKey: CryptoKey,
): Promise<WrappedKeyEnvelopeV1> {
  validateKeyWrapContext(context)
  if (rawKey.length !== 32) throw new Error('INVALID_WRAPPED_KEY_LENGTH')
  if ((await publicKeyFingerprint(recipientPublicKey)) !== context.recipientKeyFingerprint) throw new Error('RECIPIENT_FINGERPRINT_MISMATCH')
  if ((await publicKeyFingerprint(issuerPublicKey)) !== context.issuerSigningFingerprint) throw new Error('ISSUER_FINGERPRINT_MISMATCH')
  const ephemeral = await generateProvisioningUnwrappingKeyPair()
  const salt = crypto.getRandomValues(new Uint8Array(32))
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const wrappingKey = await deriveWrapKey(ephemeral.privateKey, recipientPublicKey, salt, context, ['encrypt'])
  const wrapped = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce as BufferSource, additionalData: encoder.encode(canonicalize(context)) as BufferSource }, wrappingKey, rawKey as BufferSource,
  )
  const unsigned = {
    version: 1 as const, suite, context, ephemeralPublicKey: await crypto.subtle.exportKey('jwk', ephemeral.publicKey),
    salt: encodeBase64Url(salt), nonce: encodeBase64Url(nonce), wrappedKey: encodeBase64Url(new Uint8Array(wrapped)),
  }
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, issuerPrivateKey, encoder.encode(canonicalize(unsigned)) as BufferSource,
  )
  return { ...unsigned, issuerSignature: encodeBase64Url(new Uint8Array(signature)) }
}

export async function unwrapKeyMaterial(
  candidate: unknown,
  recipientPrivateKey: CryptoKey,
  recipientPublicKey: CryptoKey,
  expectedContext: KeyWrapContextV1,
  issuerPublicKey: CryptoKey,
  nowEpochSeconds: number,
): Promise<Uint8Array> {
  const envelope = parseWrappedKeyEnvelope(candidate)
  if (canonicalize(envelope.context) !== canonicalize(expectedContext)) throw new Error('KEY_CONTEXT_MISMATCH')
  if (envelope.context.expiresAt < nowEpochSeconds) throw new Error('KEY_ENVELOPE_EXPIRED')
  if ((await publicKeyFingerprint(recipientPublicKey)) !== expectedContext.recipientKeyFingerprint) throw new Error('RECIPIENT_FINGERPRINT_MISMATCH')
  if ((await publicKeyFingerprint(issuerPublicKey)) !== expectedContext.issuerSigningFingerprint) throw new Error('ISSUER_FINGERPRINT_MISMATCH')
  const signatureValid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, issuerPublicKey, decodeBase64Url(envelope.issuerSignature) as BufferSource,
    encoder.encode(canonicalize(unsignedKeyEnvelope(envelope))) as BufferSource,
  )
  if (!signatureValid) throw new Error('INVALID_KEY_ENVELOPE_SIGNATURE')
  const ephemeralPublicKey = await crypto.subtle.importKey('jwk', envelope.ephemeralPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const wrappingKey = await deriveWrapKey(recipientPrivateKey, ephemeralPublicKey, decodeBase64Url(envelope.salt), envelope.context, ['decrypt'])
  try {
    const raw = new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: decodeBase64Url(envelope.nonce) as BufferSource, additionalData: encoder.encode(canonicalize(envelope.context)) as BufferSource },
      wrappingKey, decodeBase64Url(envelope.wrappedKey) as BufferSource,
    ))
    if (raw.length !== 32) throw new Error('INVALID_UNWRAPPED_KEY_LENGTH')
    return raw
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_UNWRAPPED_KEY_LENGTH') throw error
    throw new Error('KEY_UNWRAP_FAILED')
  }
}

export async function invitationCommitment(invitation: Record<string, unknown>, clientNonce: Uint8Array): Promise<string> {
  if (clientNonce.length !== 32) throw new Error('INVALID_COMMITMENT_NONCE')
  const bytes = encoder.encode(canonicalize(invitation))
  const combined = new Uint8Array(bytes.length + clientNonce.length)
  combined.set(bytes)
  combined.set(clientNonce, bytes.length)
  return encodeBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', combined)))
}

export async function verifyEnrollmentInvitation(
  artifact: SignedArtifactV1<EnrollmentInvitationV1>,
  ownerPublicKey: CryptoKey,
  expected: {
    workspaceId: string
    genesisFingerprint: string
    ownerPrincipalId: string
    ownerSigningFingerprint: string
    commitment: string
    clientNonce: Uint8Array
    nowEpochSeconds: number
    usedInvitationIds: ReadonlySet<string>
  },
): Promise<boolean> {
  const invitation = artifact.payload
  if (
    invitation.workspaceId !== expected.workspaceId ||
    invitation.genesisFingerprint !== expected.genesisFingerprint ||
    invitation.ownerPrincipalId !== expected.ownerPrincipalId ||
    invitation.ownerSigningFingerprint !== expected.ownerSigningFingerprint ||
    invitation.expiresAt < expected.nowEpochSeconds ||
    expected.usedInvitationIds.has(invitation.invitationId)
  ) return false
  if ((await invitationCommitment(invitation, expected.clientNonce)) !== expected.commitment) return false
  return verifyArtifact(artifact, ownerPublicKey, {
    purpose: 'enrollment',
    principalId: expected.ownerPrincipalId,
    fingerprint: expected.ownerSigningFingerprint,
  })
}

export async function signedArtifactHash(artifact: SignedArtifactV1<Record<string, unknown>>): Promise<string> {
  const content = {
    domain: 'famnesia:signed-artifact-id:v1',
    version: artifact.version,
    purpose: artifact.purpose,
    signerPrincipalId: artifact.signerPrincipalId,
    signerKeyFingerprint: artifact.signerKeyFingerprint,
    payload: artifact.payload,
  }
  return encodeBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(canonicalize(content)))))
}

export async function verifyFreshnessChain(
  chain: SignedArtifactV1<FreshnessCheckpointV1>[],
  authorityPublicKey: CryptoKey,
  expected: {
    workspaceId: string
    authorityPrincipalId: string
    authorityFingerprint: string
    pinnedCheckpointHash: string
    pinnedRevision: number
    pinnedDirectoryRevision: number
    revokedAtRevision?: number
  },
): Promise<boolean> {
  let priorHash = expected.pinnedCheckpointHash
  let revision = expected.pinnedRevision
  let directoryRevision = expected.pinnedDirectoryRevision
  for (const artifact of chain) {
    const checkpoint = artifact.payload
    if (checkpoint.workspaceId !== expected.workspaceId || checkpoint.revision !== revision + 1) return false
    if (!positiveInteger(checkpoint.directoryRevision) || checkpoint.directoryRevision < directoryRevision) return false
    if (checkpoint.previousCheckpointHash !== priorHash) return false
    if (!(await verifyRevisionedArtifact(artifact, authorityPublicKey, {
      purpose: 'directory', principalId: expected.authorityPrincipalId, fingerprint: expected.authorityFingerprint,
      revokedAtRevision: expected.revokedAtRevision,
    }))) return false
    priorHash = await signedArtifactHash(artifact)
    revision = checkpoint.revision
    directoryRevision = checkpoint.directoryRevision
  }
  return true
}

export async function verifyPrincipalRebind(
  artifact: SignedArtifactV1<PrincipalRebindChallengeV1>,
  signingPublicKey: CryptoKey,
  wrappedProof: unknown,
  unwrappingPrivateKey: CryptoKey,
  unwrappingPublicKey: CryptoKey,
  wrapContext: KeyWrapContextV1,
  issuerPublicKey: CryptoKey,
  expected: {
    principalId: string
    signingFingerprint: string
    oldAuthUuid: string
    newAuthUuid: string
    challengeId: string
    nowEpochSeconds: number
    usedChallengeIds: ReadonlySet<string>
  },
): Promise<boolean> {
  const challenge = artifact.payload
  if (
    challenge.principalId !== expected.principalId || challenge.oldAuthUuid !== expected.oldAuthUuid ||
    challenge.newAuthUuid !== expected.newAuthUuid || challenge.challengeId !== expected.challengeId ||
    challenge.expiresAt < expected.nowEpochSeconds || expected.usedChallengeIds.has(challenge.challengeId) ||
    wrapContext.entityId !== challenge.challengeId || wrapContext.recipientPrincipalId !== challenge.principalId
  ) return false
  if (!(await verifyArtifact(artifact, signingPublicKey, {
    purpose: 'principal-rebind', principalId: expected.principalId, fingerprint: expected.signingFingerprint,
  }))) return false
  try {
    const proof = await unwrapKeyMaterial(
      wrappedProof, unwrappingPrivateKey, unwrappingPublicKey, wrapContext, issuerPublicKey, expected.nowEpochSeconds,
    )
    const proofHash = encodeBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', proof as BufferSource)))
    return proofHash === challenge.unwrapProofHash
  } catch {
    return false
  }
}

export async function verifySigningRotation(
  transition: SigningRotationV1,
  oldSignature: SignedArtifactV1<SigningRotationV1>,
  newSignature: SignedArtifactV1<SigningRotationV1>,
  oldKey: CryptoKey,
  newKey: CryptoKey,
  principalId: string,
  expectedWorkspaceId: string,
  minimumFromRevision: number,
): Promise<boolean> {
  const oldFingerprint = await publicKeyFingerprint(oldKey)
  const newFingerprint = await publicKeyFingerprint(newKey)
  if (transition.workspaceId !== expectedWorkspaceId || transition.fromRevision < minimumFromRevision || transition.toRevision !== transition.fromRevision + 1) return false
  if (transition.oldFingerprint !== oldFingerprint || transition.newFingerprint !== newFingerprint) return false
  if (canonicalize(oldSignature.payload) !== canonicalize(transition) || canonicalize(newSignature.payload) !== canonicalize(transition)) return false
  return (await verifyArtifact(oldSignature, oldKey, { purpose: 'directory', principalId, fingerprint: oldFingerprint })) &&
    (await verifyArtifact(newSignature, newKey, { purpose: 'directory', principalId, fingerprint: newFingerprint }))
}
