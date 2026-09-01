import { describe, expect, it } from 'vitest'
import { createDisasterBundleManifest, decryptMediaArtifact, encryptMediaArtifact, validateDisasterBundle } from '../src/security/disasterBundle'

describe('CR-10 encrypted disaster bundle', () => {
  it('encrypts media client-side and detects tampering', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    const clear = new TextEncoder().encode('private-media')
    const artifact = await encryptMediaArtifact('M1', clear, 'image/png', key)
    expect(artifact.ciphertext).not.toContain('private-media')
    expect(await decryptMediaArtifact(artifact, key)).toEqual(clear)
    await expect(decryptMediaArtifact({ ...artifact, ciphertext: `${artifact.ciphertext}x` }, key)).rejects.toThrow()
  })

  it('requires ciphertext-only manifest and rejects raw-key-shaped bundles', () => {
    const manifest = createDisasterBundleManifest({ workspaceId: 'W1', createdAt: '2026-09-01T00:00:00Z', schemaVersion: 3, dataVersion: 4, keyEpoch: 2, principalIds: ['cp_b', 'cp_a'], mediaIds: [] })
    expect(manifest).toMatchObject({ format: 'famnesia-encrypted-disaster-bundle', ciphertextOnly: true, principalIds: ['cp_a', 'cp_b'], mediaIds: [] })
    const valid = { manifest, encryptedFamilyCiphertext: 'A'.repeat(22), media: [], trustCheckpoint: { checkpointHash: 'opaque' } }
    expect(() => validateDisasterBundle(valid)).not.toThrow()
    expect(() => validateDisasterBundle({ ...valid, rawWorkspaceKey: 'plaintext-secret' })).toThrow('INVALID_DISASTER_BUNDLE')
    expect(() => validateDisasterBundle({ ...valid, manifest: { ...manifest, ciphertextOnly: false } })).toThrow('INVALID_DISASTER_BUNDLE')
  })
})
