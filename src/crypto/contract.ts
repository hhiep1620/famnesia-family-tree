export const CRYPTO_VERSION = 1 as const
export const CRYPTO_SUITE = 'FAMNESIA-P256-AESGCM-HKDF-SHA256-V1' as const
export const AES_GCM_NONCE_BYTES = 12
export const AES_GCM_TAG_BITS = 128
export const MAX_PLAINTEXT_BYTES = 8 * 1024 * 1024

export type EnvelopePurpose =
  | 'family-content'
  | 'person-private'
  | 'contact'
  | 'media-manifest'
  | 'user-private-key-bundle'

export interface AuthenticatedContextV1 {
  workspaceId: string
  entityId: string
  fieldClass: string
  schemaVersion: number
  dataVersion: number
  keyId: string
  keyEpoch: number
  writerId: string
  purpose: EnvelopePurpose
}

export interface EncryptedEnvelopeV1 {
  version: typeof CRYPTO_VERSION
  suite: typeof CRYPTO_SUITE
  nonce: string
  ciphertext: string
  aad: AuthenticatedContextV1
}

const writerKeyBrand: unique symbol = Symbol('WriterAeadKey')

export interface WriterAeadKey {
  readonly cryptoKey: CryptoKey
  readonly writerId: string
  readonly keyId: string
  readonly keyEpoch: number
  readonly allowedPurpose: EnvelopePurpose
  readonly [writerKeyBrand]: true
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder('utf-8', { fatal: true })
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertUnicodeScalarString(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error('NON_IJSON_STRING')
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error('NON_IJSON_STRING')
    }
  }
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`INVALID_${label.toUpperCase()}_SHAPE`)
  }
}

function assertIdentifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !identifierPattern.test(value)) {
    throw new Error(`INVALID_${label.toUpperCase()}`)
  }
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error(`INVALID_${label.toUpperCase()}`)
  }
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

export function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/u.test(value)) throw new Error('INVALID_BASE64URL')
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  let binary: string
  try {
    binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + padding)
  } catch {
    throw new Error('INVALID_BASE64URL')
  }
  const decoded = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  if (encodeBase64Url(decoded) !== value) throw new Error('NON_CANONICAL_BASE64URL')
  return decoded
}

export function canonicalize(value: unknown): string {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'string') {
    assertUnicodeScalarString(value)
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('NON_IJSON_NUMBER')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => {
        assertUnicodeScalarString(key)
        return `${JSON.stringify(key)}:${canonicalize(value[key])}`
      })
      .join(',')}}`
  }
  throw new Error('NON_IJSON_VALUE')
}

export function encodeAuthenticatedContext(context: AuthenticatedContextV1): Uint8Array {
  validateAuthenticatedContext(context)
  return textEncoder.encode(canonicalize(context))
}

export function validateAuthenticatedContext(value: unknown): asserts value is AuthenticatedContextV1 {
  if (!isRecord(value)) throw new Error('INVALID_AAD')
  assertExactKeys(
    value,
    ['workspaceId', 'entityId', 'fieldClass', 'schemaVersion', 'dataVersion', 'keyId', 'keyEpoch', 'writerId', 'purpose'],
    'aad',
  )
  assertIdentifier(value.workspaceId, 'workspace_id')
  assertIdentifier(value.entityId, 'entity_id')
  assertIdentifier(value.fieldClass, 'field_class')
  assertIdentifier(value.keyId, 'key_id')
  assertIdentifier(value.writerId, 'writer_id')
  assertPositiveInteger(value.schemaVersion, 'schema_version')
  assertPositiveInteger(value.dataVersion, 'data_version')
  assertPositiveInteger(value.keyEpoch, 'key_epoch')
  if (!['family-content', 'person-private', 'contact', 'media-manifest', 'user-private-key-bundle'].includes(String(value.purpose))) {
    throw new Error('INVALID_PURPOSE')
  }
}

export function parseEncryptedEnvelope(value: unknown): EncryptedEnvelopeV1 {
  if (!isRecord(value)) throw new Error('INVALID_ENVELOPE')
  assertExactKeys(value, ['version', 'suite', 'nonce', 'ciphertext', 'aad'], 'envelope')
  if (value.version !== CRYPTO_VERSION) throw new Error('UNSUPPORTED_CRYPTO_VERSION')
  if (value.suite !== CRYPTO_SUITE) throw new Error('UNSUPPORTED_CRYPTO_SUITE')
  if (typeof value.nonce !== 'string' || decodeBase64Url(value.nonce).length !== AES_GCM_NONCE_BYTES) {
    throw new Error('INVALID_NONCE')
  }
  if (typeof value.ciphertext !== 'string' || decodeBase64Url(value.ciphertext).length < AES_GCM_TAG_BITS / 8) {
    throw new Error('INVALID_CIPHERTEXT')
  }
  validateAuthenticatedContext(value.aad)
  return value as unknown as EncryptedEnvelopeV1
}

function contextsEqual(left: AuthenticatedContextV1, right: AuthenticatedContextV1): boolean {
  return canonicalize(left) === canonicalize(right)
}

export async function deriveWriterAeadKey(
  rootKeyMaterial: Uint8Array,
  writerId: string,
  keyId: string,
  keyEpoch: number,
  allowedPurpose: EnvelopePurpose,
  usages: KeyUsage[],
): Promise<WriterAeadKey> {
  if (rootKeyMaterial.length !== 32) throw new Error('INVALID_ROOT_KEY_LENGTH')
  assertIdentifier(writerId, 'writer_id')
  assertIdentifier(keyId, 'key_id')
  assertPositiveInteger(keyEpoch, 'key_epoch')
  const hkdf = await crypto.subtle.importKey('raw', rootKeyMaterial as BufferSource, 'HKDF', false, ['deriveKey'])
  const cryptoKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: textEncoder.encode(writerId) as BufferSource,
      info: textEncoder.encode(canonicalize({ label: 'famnesia:writer-aead:v1', keyId, keyEpoch })) as BufferSource,
    },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  )
  return { cryptoKey, writerId, keyId, keyEpoch, allowedPurpose, [writerKeyBrand]: true }
}

export async function deriveRecoveryEnvelopeKey(
  recoverySecret: Uint8Array,
  salt: Uint8Array,
  principalId: string,
  recoveryEpoch: number,
  usages: KeyUsage[],
): Promise<WriterAeadKey> {
  if (recoverySecret.length !== 32 || salt.length !== 32) throw new Error('INVALID_RECOVERY_KDF_INPUT')
  assertIdentifier(principalId, 'principal_id')
  assertPositiveInteger(recoveryEpoch, 'recovery_epoch')
  const writerId = `recovery-${principalId}`
  const keyId = `recovery-kek-${principalId}`
  const hkdf = await crypto.subtle.importKey('raw', recoverySecret as BufferSource, 'HKDF', false, ['deriveKey'])
  const cryptoKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      info: textEncoder.encode(canonicalize({ label: 'famnesia:recovery-kek:v1', principalId, recoveryEpoch })) as BufferSource,
    },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  )
  return {
    cryptoKey,
    writerId,
    keyId,
    keyEpoch: recoveryEpoch,
    allowedPurpose: 'user-private-key-bundle',
    [writerKeyBrand]: true,
  }
}

export function nonceFromCounter(counter: bigint): Uint8Array {
  if (counter < 0n || counter > (1n << 96n) - 1n) throw new Error('NONCE_COUNTER_EXHAUSTED')
  const nonce = new Uint8Array(AES_GCM_NONCE_BYTES)
  let remaining = counter
  for (let index = nonce.length - 1; index >= 0; index -= 1) {
    nonce[index] = Number(remaining & 0xffn)
    remaining >>= 8n
  }
  return nonce
}

export async function encryptEnvelopeWithWriterKey(
  plaintext: Uint8Array,
  key: WriterAeadKey,
  aad: AuthenticatedContextV1,
  nonce: Uint8Array,
): Promise<EncryptedEnvelopeV1> {
  if (plaintext.byteLength > MAX_PLAINTEXT_BYTES) throw new Error('PLAINTEXT_TOO_LARGE')
  if (nonce.byteLength !== AES_GCM_NONCE_BYTES) throw new Error('INVALID_NONCE')
  if (
    key[writerKeyBrand] !== true || key.writerId !== aad.writerId || key.keyId !== aad.keyId ||
    key.keyEpoch !== aad.keyEpoch || key.allowedPurpose !== aad.purpose
  ) {
    throw new Error('WRITER_KEY_CONTEXT_MISMATCH')
  }
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce as BufferSource,
      additionalData: encodeAuthenticatedContext(aad) as BufferSource,
      tagLength: AES_GCM_TAG_BITS,
    },
    key.cryptoKey,
    plaintext as BufferSource,
  )
  return {
    version: CRYPTO_VERSION,
    suite: CRYPTO_SUITE,
    nonce: encodeBase64Url(nonce),
    ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
    aad,
  }
}

export async function decryptEnvelope(
  candidate: unknown,
  key: WriterAeadKey,
  expected: AuthenticatedContextV1,
  minimumDataVersion = expected.dataVersion,
): Promise<Uint8Array> {
  const envelope = parseEncryptedEnvelope(candidate)
  if (!contextsEqual(envelope.aad, expected)) throw new Error('AAD_CONTEXT_MISMATCH')
  if (
    key[writerKeyBrand] !== true || key.writerId !== expected.writerId || key.keyId !== expected.keyId ||
    key.keyEpoch !== expected.keyEpoch || key.allowedPurpose !== expected.purpose
  ) {
    throw new Error('WRITER_KEY_CONTEXT_MISMATCH')
  }
  if (envelope.aad.dataVersion < minimumDataVersion) throw new Error('STALE_DATA_VERSION')
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: decodeBase64Url(envelope.nonce) as BufferSource,
        additionalData: encodeAuthenticatedContext(envelope.aad) as BufferSource,
        tagLength: AES_GCM_TAG_BITS,
      },
      key.cryptoKey,
      decodeBase64Url(envelope.ciphertext) as BufferSource,
    )
    return new Uint8Array(plaintext)
  } catch {
    throw new Error('AUTHENTICATION_FAILED')
  }
}

export function encodeUtf8(value: string): Uint8Array {
  return textEncoder.encode(value)
}

export function decodeUtf8(value: Uint8Array): string {
  return textDecoder.decode(value)
}
