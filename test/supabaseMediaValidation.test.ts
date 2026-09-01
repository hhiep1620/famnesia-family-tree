import { describe, expect, it } from 'vitest'
import { MEDIA_MAX_BYTES, MEDIA_THUMB_MAX_BYTES, validateImageBlob } from '../server/_server/supabase/mediaBackend.js'
import { ApiError } from '../server/_server/http.js'

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 1])
const webp = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80])

describe('Supabase private media validation', () => {
  it.each([
    [png, 'image/png', 'png'],
    [jpeg, 'image/jpeg', 'jpg'],
    [webp, 'image/webp', 'webp'],
  ] as const)('accepts supported magic bytes for %s', async (bytes, mime, extension) => {
    const result = await validateImageBlob(new Blob([bytes], { type: mime }))
    expect(result).toMatchObject({ mimeType: mime, extension })
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects MIME spoofing and unsupported content', async () => {
    await expect(validateImageBlob(new Blob([png], { type: 'image/jpeg' }))).rejects.toMatchObject<ApiError>({ status: 415, code: 'PHOTO_MIME_MISMATCH' })
    await expect(validateImageBlob(new Blob(['<svg/>'], { type: 'image/svg+xml' }))).rejects.toMatchObject<ApiError>({ status: 415, code: 'PHOTO_MAGIC_INVALID' })
  })

  it('enforces original and thumbnail limits before Storage', async () => {
    await expect(validateImageBlob(new Blob([new Uint8Array(MEDIA_MAX_BYTES + 1)], { type: 'image/png' }))).rejects.toMatchObject<ApiError>({ status: 413 })
    await expect(validateImageBlob(new Blob([new Uint8Array(MEDIA_THUMB_MAX_BYTES + 1)], { type: 'image/png' }), MEDIA_THUMB_MAX_BYTES)).rejects.toMatchObject<ApiError>({ status: 413 })
  })
})
