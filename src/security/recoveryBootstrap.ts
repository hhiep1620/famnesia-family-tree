import {
  decodeBase64Url,
  decodeUtf8,
  deriveRecoveryEnvelopeKey,
  encodeBase64Url,
  encodeUtf8,
  encryptEnvelopeWithWriterKey,
  decryptEnvelope,
  nonceFromCounter,
  type EncryptedEnvelopeV1,
} from '../crypto/contract'
import {
  generateProvisioningSigningKeyPair,
  generateProvisioningUnwrappingKeyPair,
  importSigningPrivateKey,
  importUnwrappingPrivateKey,
  publicKeyFingerprint,
} from '../crypto/keyContract'

export const RECOVERY_VAULT_FORMAT = 'famnesia-key-vault' as const
export const RECOVERY_BACKUP_FORMAT = 'famnesia-user-recovery-backup' as const

export interface TrustPinV1 {
  workspaceId: string
  genesisFingerprint: string
  directoryCheckpointHash: string
  freshnessCheckpointHash: string
}

export interface DriveKeyVaultV1 {
  format: typeof RECOVERY_VAULT_FORMAT
  version: 1
  principalId: string
  recoveryEpoch: number
  recoverySecret: string
  unwrapFingerprint: string
  signingFingerprint: string
  trustPins: TrustPinV1[]
}

export interface EncryptedPrivateKeyRecordV1 {
  format: 'famnesia-encrypted-private-key'
  version: 1
  principalId: string
  recoveryEpoch: number
  salt: string
  unwrapPublicKey: JsonWebKey
  signingPublicKey: JsonWebKey
  unwrapFingerprint: string
  signingFingerprint: string
  envelope: EncryptedEnvelopeV1
}

export interface PerUserRecoveryBackupV1 {
  format: typeof RECOVERY_BACKUP_FORMAT
  version: 1
  principalId: string
  encryptedPrivateKey: EncryptedPrivateKeyRecordV1
  trustPins: TrustPinV1[]
}

interface PrivateBundleV1 {
  format: 'famnesia-private-key-bundle'
  version: 1
  principalId: string
  unwrapPrivateKey: JsonWebKey
  signingPrivateKey: JsonWebKey
}

export interface ProvisionedRecoveryIdentity {
  vault: DriveKeyVaultV1
  privateKeyRecord: EncryptedPrivateKeyRecordV1
  recoveryBackup: PerUserRecoveryBackupV1
  unwrappingPrivateKey: CryptoKey
  signingPrivateKey: CryptoKey
}

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

function randomId(prefix: string, bytes = 16): string {
  return `${prefix}_${encodeBase64Url(crypto.getRandomValues(new Uint8Array(bytes)))}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join('|') === [...keys].sort().join('|')
}

function validateTrustPins(value: unknown): asserts value is TrustPinV1[] {
  if (!Array.isArray(value)) throw new Error('INVALID_TRUST_PINS')
  const workspaces = new Set<string>()
  for (const pin of value) {
    if (!isRecord(pin) || !exactKeys(pin, ['workspaceId', 'genesisFingerprint', 'directoryCheckpointHash', 'freshnessCheckpointHash'])) {
      throw new Error('INVALID_TRUST_PIN')
    }
    for (const field of ['workspaceId', 'genesisFingerprint', 'directoryCheckpointHash', 'freshnessCheckpointHash']) {
      if (typeof pin[field] !== 'string' || !idPattern.test(pin[field] as string)) throw new Error('INVALID_TRUST_PIN')
    }
    if (workspaces.has(pin.workspaceId as string)) throw new Error('DUPLICATE_TRUST_PIN')
    workspaces.add(pin.workspaceId as string)
  }
}

export function parseDriveKeyVault(value: unknown): DriveKeyVaultV1 {
  if (!isRecord(value) || !exactKeys(value, [
    'format', 'version', 'principalId', 'recoveryEpoch', 'recoverySecret', 'unwrapFingerprint', 'signingFingerprint', 'trustPins',
  ])) throw new Error('INVALID_KEY_VAULT')
  if (value.format !== RECOVERY_VAULT_FORMAT || value.version !== 1) throw new Error('UNSUPPORTED_KEY_VAULT')
  if (typeof value.principalId !== 'string' || !idPattern.test(value.principalId)) throw new Error('INVALID_CRYPTO_PRINCIPAL')
  if (!Number.isSafeInteger(value.recoveryEpoch) || Number(value.recoveryEpoch) < 1) throw new Error('INVALID_RECOVERY_EPOCH')
  if (typeof value.recoverySecret !== 'string' || decodeBase64Url(value.recoverySecret).length !== 32) throw new Error('INVALID_RECOVERY_SECRET')
  if (typeof value.unwrapFingerprint !== 'string' || typeof value.signingFingerprint !== 'string') throw new Error('INVALID_KEY_FINGERPRINT')
  validateTrustPins(value.trustPins)
  return value as unknown as DriveKeyVaultV1
}

function parsePrivateBundle(value: unknown): PrivateBundleV1 {
  if (!isRecord(value) || !exactKeys(value, ['format', 'version', 'principalId', 'unwrapPrivateKey', 'signingPrivateKey'])) {
    throw new Error('INVALID_PRIVATE_KEY_BUNDLE')
  }
  if (value.format !== 'famnesia-private-key-bundle' || value.version !== 1 || typeof value.principalId !== 'string') {
    throw new Error('INVALID_PRIVATE_KEY_BUNDLE')
  }
  if (!isRecord(value.unwrapPrivateKey) || !isRecord(value.signingPrivateKey)) throw new Error('INVALID_PRIVATE_KEY_BUNDLE')
  return value as unknown as PrivateBundleV1
}

function privateBundleAad(principalId: string, recoveryEpoch: number) {
  return {
    workspaceId: 'principal',
    entityId: principalId,
    fieldClass: 'private-key-bundle',
    schemaVersion: 1,
    dataVersion: recoveryEpoch,
    keyId: `recovery-kek-${principalId}`,
    keyEpoch: recoveryEpoch,
    writerId: `recovery-${principalId}`,
    purpose: 'user-private-key-bundle' as const,
  }
}

export async function provisionRecoveryIdentity(trustPins: TrustPinV1[] = []): Promise<ProvisionedRecoveryIdentity> {
  validateTrustPins(trustPins)
  const principalId = randomId('cp')
  const recoveryEpoch = 1
  const recoverySecret = crypto.getRandomValues(new Uint8Array(32))
  const salt = crypto.getRandomValues(new Uint8Array(32))
  const unwrappingPair = await generateProvisioningUnwrappingKeyPair()
  const signingPair = await generateProvisioningSigningKeyPair()
  const unwrapFingerprint = await publicKeyFingerprint(unwrappingPair.publicKey)
  const signingFingerprint = await publicKeyFingerprint(signingPair.publicKey)
  const privateBundle: PrivateBundleV1 = {
    format: 'famnesia-private-key-bundle',
    version: 1,
    principalId,
    unwrapPrivateKey: await crypto.subtle.exportKey('jwk', unwrappingPair.privateKey),
    signingPrivateKey: await crypto.subtle.exportKey('jwk', signingPair.privateKey),
  }
  const recoveryKey = await deriveRecoveryEnvelopeKey(recoverySecret, salt, principalId, recoveryEpoch, ['encrypt'])
  const envelope = await encryptEnvelopeWithWriterKey(
    encodeUtf8(JSON.stringify(privateBundle)),
    recoveryKey,
    privateBundleAad(principalId, recoveryEpoch),
    nonceFromCounter(0n),
  )
  const privateKeyRecord: EncryptedPrivateKeyRecordV1 = {
    format: 'famnesia-encrypted-private-key',
    version: 1,
    principalId,
    recoveryEpoch,
    salt: encodeBase64Url(salt),
    unwrapPublicKey: await crypto.subtle.exportKey('jwk', unwrappingPair.publicKey),
    signingPublicKey: await crypto.subtle.exportKey('jwk', signingPair.publicKey),
    unwrapFingerprint,
    signingFingerprint,
    envelope,
  }
  const vault: DriveKeyVaultV1 = {
    format: RECOVERY_VAULT_FORMAT,
    version: 1,
    principalId,
    recoveryEpoch,
    recoverySecret: encodeBase64Url(recoverySecret),
    unwrapFingerprint,
    signingFingerprint,
    trustPins,
  }
  const recoveryBackup: PerUserRecoveryBackupV1 = {
    format: RECOVERY_BACKUP_FORMAT,
    version: 1,
    principalId,
    encryptedPrivateKey: privateKeyRecord,
    trustPins,
  }
  const unwrappingPrivateKey = await importUnwrappingPrivateKey(privateBundle.unwrapPrivateKey)
  const signingPrivateKey = await importSigningPrivateKey(privateBundle.signingPrivateKey)
  return { vault, privateKeyRecord, recoveryBackup, unwrappingPrivateKey, signingPrivateKey }
}

export async function restoreRecoveryIdentity(
  vaultCandidate: unknown,
  record: EncryptedPrivateKeyRecordV1,
): Promise<Pick<ProvisionedRecoveryIdentity, 'vault' | 'privateKeyRecord' | 'unwrappingPrivateKey' | 'signingPrivateKey'>> {
  const vault = parseDriveKeyVault(vaultCandidate)
  if (record.format !== 'famnesia-encrypted-private-key' || record.version !== 1 || record.principalId !== vault.principalId) {
    throw new Error('RECOVERY_RECORD_MISMATCH')
  }
  if (record.recoveryEpoch !== vault.recoveryEpoch || record.unwrapFingerprint !== vault.unwrapFingerprint || record.signingFingerprint !== vault.signingFingerprint) {
    throw new Error('RECOVERY_RECORD_MISMATCH')
  }
  const recoveryKey = await deriveRecoveryEnvelopeKey(
    decodeBase64Url(vault.recoverySecret),
    decodeBase64Url(record.salt),
    vault.principalId,
    vault.recoveryEpoch,
    ['decrypt'],
  )
  const plaintext = await decryptEnvelope(record.envelope, recoveryKey, privateBundleAad(vault.principalId, vault.recoveryEpoch))
  const bundle = parsePrivateBundle(JSON.parse(decodeUtf8(plaintext)) as unknown)
  if (bundle.principalId !== vault.principalId) throw new Error('RECOVERY_RECORD_MISMATCH')
  const unwrappingPrivateKey = await importUnwrappingPrivateKey(bundle.unwrapPrivateKey)
  const signingPrivateKey = await importSigningPrivateKey(bundle.signingPrivateKey)
  // Public keys are intentionally extractable so their SPKI fingerprints can
  // be recomputed. Restored private keys remain non-extractable.
  const unwrapPublicKey = await crypto.subtle.importKey('jwk', record.unwrapPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, true, [])
  const signingPublicKey = await crypto.subtle.importKey('jwk', record.signingPublicKey, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify'])
  if (await publicKeyFingerprint(unwrapPublicKey) !== vault.unwrapFingerprint || await publicKeyFingerprint(signingPublicKey) !== vault.signingFingerprint) {
    throw new Error('RECOVERY_PUBLIC_KEY_MISMATCH')
  }
  return { vault, privateKeyRecord: record, unwrappingPrivateKey, signingPrivateKey }
}

export function serializeRecoveryArtifact(value: DriveKeyVaultV1 | PerUserRecoveryBackupV1): string {
  return `${JSON.stringify(value, null, 2)}\n`
}
