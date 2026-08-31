import { describe, expect, it } from 'vitest'
import {
  CRYPTO_SUITE,
  canonicalize,
  decodeBase64Url,
  decodeUtf8,
  deriveWriterAeadKey,
  decryptEnvelope,
  encodeBase64Url,
  encodeUtf8,
  encryptEnvelopeWithWriterKey,
  nonceFromCounter,
  parseEncryptedEnvelope,
  type AuthenticatedContextV1,
} from '../src/crypto/contract'

const rawKey = decodeBase64Url('AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8')
const wrongRawKey = decodeBase64Url('Hh0cGxoZGBcWFRQTEhEQDw4NDAsKCQgHBgUEAwIBAAA')
const nonce = decodeBase64Url('ICEiIyQlJicoKSor')
const aad: AuthenticatedContextV1 = {
  workspaceId: 'ws-test-01',
  entityId: 'person-test-01',
  fieldClass: 'family-profile',
  schemaVersion: 1,
  dataVersion: 7,
  keyId: 'wk-test-01',
  keyEpoch: 2,
  writerId: 'writer-test-01',
  purpose: 'family-content',
}

function mutateBase64Url(value: string): string {
  const bytes = decodeBase64Url(value)
  bytes[0] ^= 1
  return encodeBase64Url(bytes)
}

describe('crypto contract v1', () => {
  it('matches the deterministic unicode known-answer vector', async () => {
    const key = await deriveWriterAeadKey(rawKey, aad.writerId, aad.keyId, aad.keyEpoch, aad.purpose, ['encrypt', 'decrypt'])
    const envelope = await encryptEnvelopeWithWriterKey(encodeUtf8('Gia phả — Nguyễn 👪'), key, aad, nonce)
    expect(envelope.ciphertext).toBe('Yey_0pq37DikXpEXGgA3BfX75WBSa9OfKaSqHHXf7lKmoTEmhLyE5rNVmg')
    expect(decodeUtf8(await decryptEnvelope(envelope, key, aad))).toBe('Gia phả — Nguyễn 👪')
  })

  it('round-trips the maximum permitted payload', async () => {
    const key = await deriveWriterAeadKey(rawKey, aad.writerId, aad.keyId, aad.keyEpoch, aad.purpose, ['encrypt', 'decrypt'])
    const payload = new Uint8Array(8 * 1024 * 1024)
    payload[0] = 1
    payload[payload.length - 1] = 255
    const envelope = await encryptEnvelopeWithWriterKey(payload, key, aad, crypto.getRandomValues(new Uint8Array(12)))
    const decrypted = await decryptEnvelope(envelope, key, aad)
    expect(decrypted.byteLength).toBe(payload.byteLength)
    expect(decrypted[0]).toBe(1)
    expect(decrypted[decrypted.length - 1]).toBe(255)
    await expect(encryptEnvelopeWithWriterKey(new Uint8Array(payload.length + 1), key, aad, nonce)).rejects.toThrow(
      'PLAINTEXT_TOO_LARGE',
    )
  })

  it.each([
    ['ciphertext', (envelope: Record<string, unknown>) => ({ ...envelope, ciphertext: mutateBase64Url(String(envelope.ciphertext)) })],
    ['nonce', (envelope: Record<string, unknown>) => ({ ...envelope, nonce: mutateBase64Url(String(envelope.nonce)) })],
  ])('rejects modified %s', async (_field, mutate) => {
    const key = await deriveWriterAeadKey(rawKey, aad.writerId, aad.keyId, aad.keyEpoch, aad.purpose, ['encrypt', 'decrypt'])
    const envelope = await encryptEnvelopeWithWriterKey(encodeUtf8('secret'), key, aad, nonce)
    await expect(decryptEnvelope(mutate(envelope as unknown as Record<string, unknown>), key, aad)).rejects.toThrow()
  })

  it('rejects wrong key, AAD/key ID and cross-workspace/entity swaps', async () => {
    const key = await deriveWriterAeadKey(rawKey, aad.writerId, aad.keyId, aad.keyEpoch, aad.purpose, ['encrypt', 'decrypt'])
    const wrongKey = await deriveWriterAeadKey(wrongRawKey, aad.writerId, aad.keyId, aad.keyEpoch, aad.purpose, ['decrypt'])
    const envelope = await encryptEnvelopeWithWriterKey(encodeUtf8('secret'), key, aad, nonce)
    await expect(decryptEnvelope(envelope, wrongKey, aad)).rejects.toThrow('AUTHENTICATION_FAILED')
    for (const changed of [
      { ...aad, keyId: 'wk-attacker' },
      { ...aad, workspaceId: 'ws-other' },
      { ...aad, entityId: 'person-other' },
      { ...aad, fieldClass: 'contact-phone' },
      { ...aad, writerId: 'writer-other' },
    ]) {
      await expect(decryptEnvelope(envelope, key, changed)).rejects.toThrow('AAD_CONTEXT_MISMATCH')
    }
  })

  it('rejects stale data, unknown versions, downgrade suites and extra fields', async () => {
    const key = await deriveWriterAeadKey(rawKey, aad.writerId, aad.keyId, aad.keyEpoch, aad.purpose, ['encrypt', 'decrypt'])
    const envelope = await encryptEnvelopeWithWriterKey(encodeUtf8('secret'), key, aad, nonce)
    await expect(decryptEnvelope(envelope, key, aad, 8)).rejects.toThrow('STALE_DATA_VERSION')
    expect(() => parseEncryptedEnvelope({ ...envelope, version: 0 })).toThrow('UNSUPPORTED_CRYPTO_VERSION')
    expect(() => parseEncryptedEnvelope({ ...envelope, suite: `${CRYPTO_SUITE}-DOWNGRADE` })).toThrow('UNSUPPORTED_CRYPTO_SUITE')
    expect(() => parseEncryptedEnvelope({ ...envelope, debug: true })).toThrow('INVALID_ENVELOPE_SHAPE')
  })

  it('canonicalizes independent property order and rejects non-I-JSON values', () => {
    expect(canonicalize({ z: 'ê', a: { y: 2, x: 1 } })).toBe('{"a":{"x":1,"y":2},"z":"ê"}')
    expect(canonicalize({ a: { x: 1, y: 2 }, z: 'ê' })).toBe(canonicalize({ z: 'ê', a: { y: 2, x: 1 } }))
    expect(() => canonicalize({ value: Number.NaN })).toThrow('NON_IJSON_NUMBER')
    expect(() => canonicalize({ value: '\ud800' })).toThrow('NON_IJSON_STRING')
  })

  it('encodes every modeled monotonic counter to a distinct 96-bit nonce', () => {
    const seen = new Set<string>()
    for (let counter = 0n; counter < 65_536n; counter += 1n) {
      seen.add(encodeBase64Url(nonceFromCounter(counter)))
    }
    expect(seen.size).toBe(65_536)
  })

  it('separates writer subkeys across devices and encodes counters injectively', async () => {
    const first = await deriveWriterAeadKey(rawKey, 'writer-device-a', aad.keyId, aad.keyEpoch, aad.purpose, ['encrypt'])
    const second = await deriveWriterAeadKey(rawKey, 'writer-device-b', aad.keyId, aad.keyEpoch, aad.purpose, ['encrypt'])
    const firstRaw = await crypto.subtle.exportKey('raw', first.cryptoKey).catch(() => null)
    const secondRaw = await crypto.subtle.exportKey('raw', second.cryptoKey).catch(() => null)
    expect(firstRaw).toBeNull()
    expect(secondRaw).toBeNull()
    const firstEnvelope = await encryptEnvelopeWithWriterKey(encodeUtf8('same'), first, { ...aad, writerId: 'writer-device-a' }, nonce)
    const secondEnvelope = await encryptEnvelopeWithWriterKey(encodeUtf8('same'), second, { ...aad, writerId: 'writer-device-b' }, nonce)
    expect(firstEnvelope.ciphertext).not.toBe(secondEnvelope.ciphertext)
    expect(encodeBase64Url(nonceFromCounter(1n))).not.toBe(encodeBase64Url(nonceFromCounter(2n)))
    expect(() => nonceFromCounter(1n << 96n)).toThrow('NONCE_COUNTER_EXHAUSTED')
  })

  it('rejects non-canonical base64url encodings', () => {
    expect(() => decodeBase64Url('_x')).toThrow('NON_CANONICAL_BASE64URL')
  })
})
