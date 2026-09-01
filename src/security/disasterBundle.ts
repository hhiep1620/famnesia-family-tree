import { decodeBase64Url, encodeBase64Url } from '../crypto/contract'
import type { FamilyData } from '../types/family'

export const DISASTER_BUNDLE_FORMAT = 'famnesia-encrypted-disaster-bundle' as const
export const MEDIA_CIPHERTEXT_FORMAT = 'famnesia-encrypted-media' as const

export interface EncryptedMediaArtifact {
  format: typeof MEDIA_CIPHERTEXT_FORMAT
  version: 1
  mediaId: string
  mimeType: 'image/webp' | 'image/jpeg' | 'image/png'
  originalSize: number
  ciphertext: string
  checksum: string
}

export interface DisasterBundleManifest {
  format: typeof DISASTER_BUNDLE_FORMAT
  version: 1
  workspaceId: string
  createdAt: string
  schemaVersion: number
  dataVersion: number
  keyEpoch: number
  principalIds: string[]
  mediaIds: string[]
  ciphertextOnly: true
}

export interface DisasterBundleV1 {
  manifest: DisasterBundleManifest
  encryptedFamilyCiphertext: string
  media: EncryptedMediaArtifact[]
  trustCheckpoint: Record<string, unknown>
}

const id = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const hash = /^sha256:[A-Za-z0-9_-]{43}$/u

async function digest(bytes: Uint8Array): Promise<string> {
  const value = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource))
  return `sha256:${encodeBase64Url(value)}`
}

export async function encryptMediaArtifact(mediaId: string, bytes: Uint8Array, mimeType: EncryptedMediaArtifact['mimeType'], key: CryptoKey): Promise<EncryptedMediaArtifact> {
  if (!id.test(mediaId) || bytes.length < 1 || bytes.length > 4 * 1024 * 1024) throw new Error('INVALID_MEDIA_ARTIFACT')
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, bytes as unknown as BufferSource))
  const packed = new Uint8Array(nonce.length + ciphertext.length); packed.set(nonce); packed.set(ciphertext, nonce.length)
  return { format: MEDIA_CIPHERTEXT_FORMAT, version: 1, mediaId, mimeType, originalSize: bytes.length, ciphertext: encodeBase64Url(packed), checksum: await digest(packed) as string }
}

export async function decryptMediaArtifact(artifact: EncryptedMediaArtifact, key: CryptoKey): Promise<Uint8Array> {
  if (artifact.format !== MEDIA_CIPHERTEXT_FORMAT || artifact.version !== 1 || !id.test(artifact.mediaId) || !hash.test(artifact.checksum)) throw new Error('INVALID_MEDIA_ARTIFACT')
  const packed = decodeBase64Url(artifact.ciphertext)
  if (await digest(packed) !== artifact.checksum || packed.length < 13) throw new Error('MEDIA_TAMPERED')
  try {
    const clear = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: packed.slice(0, 12) as unknown as BufferSource }, key, packed.slice(12) as unknown as BufferSource))
    if (clear.length !== artifact.originalSize) throw new Error('MEDIA_SIZE_MISMATCH')
    return clear
  } catch { throw new Error('MEDIA_DECRYPT_FAILED') }
}

export function createDisasterBundleManifest(input: Omit<DisasterBundleManifest, 'format' | 'version' | 'ciphertextOnly'>): DisasterBundleManifest {
  if (!id.test(input.workspaceId) || !Number.isSafeInteger(input.schemaVersion) || !Number.isSafeInteger(input.dataVersion) || !Number.isSafeInteger(input.keyEpoch)) throw new Error('INVALID_DISASTER_MANIFEST')
  return { ...input, format: DISASTER_BUNDLE_FORMAT, version: 1, ciphertextOnly: true, principalIds: [...new Set(input.principalIds)].sort(), mediaIds: [...new Set(input.mediaIds)].sort() }
}

export function validateDisasterBundle(bundle: unknown): asserts bundle is DisasterBundleV1 {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) throw new Error('INVALID_DISASTER_BUNDLE')
  const value = bundle as DisasterBundleV1
  if (value.manifest?.format !== DISASTER_BUNDLE_FORMAT || value.manifest.version !== 1 || value.manifest.ciphertextOnly !== true || typeof value.encryptedFamilyCiphertext !== 'string' || !Array.isArray(value.media) || !value.trustCheckpoint || typeof value.trustCheckpoint !== 'object') throw new Error('INVALID_DISASTER_BUNDLE')
  if (!value.media.every((item) => item.format === MEDIA_CIPHERTEXT_FORMAT && item.version === 1 && id.test(item.mediaId) && hash.test(item.checksum))) throw new Error('INVALID_DISASTER_BUNDLE')
}

export function familyCiphertextPayload(data: FamilyData): string {
  if (!data || !Array.isArray(data.persons) || !Array.isArray(data.relationships) || !Array.isArray(data.media)) throw new Error('INVALID_FAMILY_PAYLOAD')
  return JSON.stringify({ schemaVersion: data.schemaVersion, dataVersion: data.updatedAt, persons: data.persons.length, relationships: data.relationships.length, media: data.media.length })
}
