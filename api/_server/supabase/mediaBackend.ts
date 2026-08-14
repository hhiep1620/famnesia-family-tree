import { createHash } from 'node:crypto'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '../../../src/types/database.generated.js'
import { AppError } from '../http.js'

const BUCKET = 'family-media'
export const MEDIA_MAX_BYTES = 4 * 1024 * 1024
export const MEDIA_THUMB_MAX_BYTES = 512 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface ValidatedImage {
  bytes: Uint8Array
  mimeType: 'image/webp' | 'image/jpeg' | 'image/png'
  extension: 'webp' | 'jpg' | 'png'
  checksum: string
}

function detectedMime(bytes: Uint8Array): ValidatedImage['mimeType'] | undefined {
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return 'image/webp'
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  return undefined
}

export async function validateImageBlob(blob: Blob, maxBytes = MEDIA_MAX_BYTES): Promise<ValidatedImage> {
  if (blob.size < 1 || blob.size > maxBytes) throw new AppError(413, 'PHOTO_SIZE_INVALID', `Photo must be between 1 byte and ${maxBytes} bytes.`)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const mimeType = detectedMime(bytes)
  if (!mimeType) throw new AppError(415, 'PHOTO_MAGIC_INVALID', 'Photo content is not a supported JPEG, PNG or WebP image.')
  if (blob.type && blob.type !== mimeType) throw new AppError(415, 'PHOTO_MIME_MISMATCH', 'Photo MIME type does not match its content.')
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp'
  return { bytes, mimeType, extension, checksum: createHash('sha256').update(bytes).digest('hex') }
}

function mediaError(error: PostgrestError, fallback: string): never {
  const message = error.message || fallback
  if (error.code === '42501') throw new AppError(403, 'MEDIA_FORBIDDEN', 'You do not have permission to access this private media object.')
  if (error.code === '23503') throw new AppError(422, 'MEDIA_REFERENCE_INVALID', 'The selected profile or person does not exist in this workspace.')
  if (error.code === '22023') throw new AppError(422, 'MEDIA_METADATA_INVALID', 'The media upload metadata is invalid.')
  console.error({ name: 'SupabaseMediaError', code: error.code, message })
  throw new AppError(502, 'SUPABASE_MEDIA_FAILED', fallback)
}

function payload(value: Json | null): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError(502, 'SUPABASE_MEDIA_RESPONSE_INVALID', 'Supabase returned an invalid media response.')
  return value as Record<string, unknown>
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new AppError(502, 'SUPABASE_MEDIA_RESPONSE_INVALID', `Supabase media response omitted ${name}.`)
  return value
}

function placeholder(mediaId: string): Response {
  const initials = mediaId.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'FM'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="128" fill="#dce8df"/><text x="128" y="145" text-anchor="middle" font-family="serif" font-size="64" fill="#3f6f62">${initials}</text></svg>`
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } })
}

export class SupabaseMediaRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async upload(workspaceId: string, originalBlob: Blob, profileId?: string, personId?: string, thumbnailBlob?: Blob): Promise<string> {
    await this.cleanupExpired(workspaceId)
    if (!profileId || !personId) throw new AppError(422, 'MEDIA_REFERENCE_REQUIRED', 'A profile and person are required for a private media upload.')
    const [original, thumbnail] = await Promise.all([
      validateImageBlob(originalBlob),
      validateImageBlob(thumbnailBlob ?? originalBlob, MEDIA_THUMB_MAX_BYTES),
    ])
    const prepared = await this.client.rpc('prepare_media_upload', {
      p_workspace_id: workspaceId,
      p_profile_legacy_id: profileId,
      p_person_legacy_id: personId,
    })
    if (prepared.error) mediaError(prepared.error, 'Could not prepare a private media upload.')
    const preparedPayload = payload(prepared.data)
    const uploadId = text(preparedPayload.uploadId, 'uploadId')
    const prefix = text(preparedPayload.objectPrefix, 'objectPrefix')
    const stagingOriginal = `${prefix}/staging-original.${original.extension}`
    const stagingThumb = `${prefix}/staging-thumb.webp`
    const originalPath = `${prefix}/original.${original.extension}`
    const thumbnailPath = `${prefix}/thumb.webp`
    const storage = this.client.storage.from(BUCKET)
    const createdPaths: string[] = []
    try {
      const originalResult = await storage.upload(stagingOriginal, original.bytes, { contentType: original.mimeType, cacheControl: '3600', upsert: false })
      if (originalResult.error) throw originalResult.error
      createdPaths.push(stagingOriginal)
      const thumbResult = await storage.upload(stagingThumb, thumbnail.bytes, { contentType: thumbnail.mimeType, cacheControl: '3600', upsert: false })
      if (thumbResult.error) throw thumbResult.error
      createdPaths.push(stagingThumb)
      const moveOriginal = await storage.move(stagingOriginal, originalPath)
      if (moveOriginal.error) throw moveOriginal.error
      createdPaths.splice(createdPaths.indexOf(stagingOriginal), 1, originalPath)
      const moveThumb = await storage.move(stagingThumb, thumbnailPath)
      if (moveThumb.error) throw moveThumb.error
      createdPaths.splice(createdPaths.indexOf(stagingThumb), 1, thumbnailPath)
      const verified = await this.client.rpc('verify_media_upload', {
        p_upload_id: uploadId,
        p_original_path: originalPath,
        p_thumbnail_path: thumbnailPath,
        p_mime_type: original.mimeType,
        p_byte_size: original.bytes.byteLength,
        p_thumbnail_byte_size: thumbnail.bytes.byteLength,
        p_checksum: original.checksum,
      })
      if (verified.error) mediaError(verified.error, 'Could not verify the private media upload.')
      console.info({ name: 'SupabaseMediaUpload', workspaceId, bytes: original.bytes.byteLength, thumbnailBytes: thumbnail.bytes.byteLength })
      return uploadId
    } catch (error) {
      if (createdPaths.length) await storage.remove(createdPaths).catch(() => undefined)
      try { await this.client.rpc('discard_media_upload', { p_upload_id: uploadId }) } catch { /* TTL cleanup remains available. */ }
      if (error instanceof AppError) throw error
      const message = error instanceof Error ? error.message : 'Storage upload failed.'
      console.error({ name: 'SupabaseStorageUploadError', workspaceId, message })
      throw new AppError(502, 'SUPABASE_MEDIA_UPLOAD_FAILED', 'Private photo upload failed. No family metadata was changed.')
    }
  }

  async read(workspaceId: string, mediaId: string, variant: 'original' | 'thumb' = 'original'): Promise<Response> {
    const result = await this.client.from('media')
      .select('storage_bucket, storage_path, thumbnail_storage_path, mime_type')
      .eq('workspace_id', workspaceId).eq('legacy_id', mediaId).maybeSingle()
    if (result.error) mediaError(result.error, 'Could not read media metadata.')
    if (!result.data) throw new AppError(404, 'PHOTO_NOT_FOUND', 'Photo was not found.')
    const path = variant === 'thumb' ? result.data.thumbnail_storage_path ?? result.data.storage_path : result.data.storage_path
    if (result.data.storage_bucket !== BUCKET || !path) return placeholder(mediaId)
    const downloaded = await this.client.storage.from(BUCKET).download(path)
    if (downloaded.error || !downloaded.data) return placeholder(mediaId)
    return new Response(downloaded.data, { headers: { 'Content-Type': downloaded.data.type || result.data.mime_type || 'application/octet-stream' } })
  }

  async delete(workspaceId: string, mediaId: string): Promise<void> {
    if (UUID.test(mediaId)) {
      const result = await this.client.from('media_uploads')
        .select('id, status, original_path, thumbnail_path, object_prefix')
        .eq('workspace_id', workspaceId).eq('id', mediaId).maybeSingle()
      if (result.error) mediaError(result.error, 'Could not inspect the staged upload.')
      if (!result.data) return
      if (result.data.status === 'attached') throw new AppError(409, 'MEDIA_DELETE_REQUIRES_COMMIT', 'Committed media must be removed through Save all.')
      const paths = [
        result.data.original_path, result.data.thumbnail_path,
        `${result.data.object_prefix}/staging-original.webp`, `${result.data.object_prefix}/staging-original.jpg`,
        `${result.data.object_prefix}/staging-original.png`, `${result.data.object_prefix}/staging-thumb.webp`,
      ].filter((value): value is string => Boolean(value))
      if (paths.length) await this.client.storage.from(BUCKET).remove(paths)
      const discarded = await this.client.rpc('discard_media_upload', { p_upload_id: mediaId })
      if (discarded.error && !discarded.error.message.includes('NOT_DISCARDABLE')) mediaError(discarded.error, 'Could not discard the staged upload.')
      return
    }
    const canonical = await this.client.from('media').select('id').eq('workspace_id', workspaceId).eq('legacy_id', mediaId).maybeSingle()
    if (canonical.error) mediaError(canonical.error, 'Could not inspect canonical media.')
    if (canonical.data) throw new AppError(409, 'MEDIA_DELETE_REQUIRES_COMMIT', 'Committed media must be removed through Save all.')
  }

  async cleanupQueued(workspaceId: string): Promise<void> {
    const queued = await this.client.from('media_cleanup_queue')
      .select('id, original_path, thumbnail_path, attempt_count')
      .eq('workspace_id', workspaceId).eq('status', 'pending').limit(20)
    if (queued.error) return
    for (const item of queued.data) {
      const paths = [item.original_path, item.thumbnail_path].filter((value): value is string => Boolean(value))
      const removed = await this.client.storage.from(BUCKET).remove(paths)
      if (removed.error) {
        await this.client.from('media_cleanup_queue').update({ status: 'failed', attempt_count: item.attempt_count + 1, last_error: removed.error.message }).eq('id', item.id)
      } else {
        await this.client.from('media_cleanup_queue').update({ status: 'completed', attempt_count: item.attempt_count + 1, completed_at: new Date().toISOString(), last_error: null }).eq('id', item.id)
      }
    }
  }

  async cleanupExpired(workspaceId: string): Promise<void> {
    const expired = await this.client.from('media_uploads')
      .select('id, object_prefix, original_path, thumbnail_path')
      .eq('workspace_id', workspaceId)
      .in('status', ['staging', 'verified', 'discarded'])
      .lt('expires_at', new Date().toISOString())
      .limit(10)
    if (expired.error) return
    for (const item of expired.data) {
      const paths = [
        item.original_path, item.thumbnail_path,
        `${item.object_prefix}/staging-original.webp`, `${item.object_prefix}/staging-original.jpg`,
        `${item.object_prefix}/staging-original.png`, `${item.object_prefix}/staging-thumb.webp`,
      ].filter((value): value is string => Boolean(value))
      await this.client.storage.from(BUCKET).remove(paths)
      await this.client.from('media_uploads').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', item.id)
    }
  }
}
