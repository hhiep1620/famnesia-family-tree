import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { requireValidFamilyData, validateFamilyData } from '../../src/schema/familyDataSchema.js'
import type { FamilyData } from '../../src/types/family.js'

export interface DriveBundleMediaEntry {
  mediaId: string
  path: string
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp'
}

export interface DriveBundleManifest {
  version: 1
  familyFile?: string
  sourceRevision?: string
  media: DriveBundleMediaEntry[]
}

export interface InspectedMedia extends DriveBundleMediaEntry {
  absolutePath: string
  bytes: number
  sha256: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
}

export interface DriveBundleInspection {
  root: string
  manifest: DriveBundleManifest
  familyData: FamilyData
  sourceSchemaVersion: number
  sourceChecksum: string
  manifestChecksum: string
  normalizedHash: string
  media: InspectedMedia[]
  counts: Record<'profiles' | 'persons' | 'relationships' | 'media', number>
  bytes: number
  warnings: string[]
}

function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex')
}

function deterministicUuid(input: string): string {
  const value = sha256(input).slice(0, 32)
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function withoutUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutUndefined)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, withoutUndefined(item)]))
  }
  return value
}

export function semanticFamilyValue(input: unknown): unknown {
  const data = requireValidFamilyData(input)
  const ordered = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => a.id.localeCompare(b.id))
  return withoutUndefined({
    schemaVersion: data.schemaVersion,
    profiles: ordered(data.profiles),
    persons: ordered(data.persons).map(({ createdAt: _created, updatedAt: _updated, ...item }) => item),
    relationships: ordered(data.relationships).map(({ createdAt: _created, updatedAt: _updated, ...item }) => item),
    media: ordered(data.media).map(({ driveFileId: _drive, fileId: _file, storagePath: _storage, createdAt: _created, ...item }) => item),
    settings: data.settings,
  })
}

export function semanticFamilyHash(input: unknown): string {
  return sha256(stable(semanticFamilyValue(input)))
}

function detectMime(buffer: Buffer): InspectedMedia['mimeType'] | undefined {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return undefined
}

async function containedFile(root: string, relative: string): Promise<string> {
  if (!relative || path.isAbsolute(relative)) throw new Error(`Bundle path không hợp lệ: ${relative || '(trống)'}`)
  const resolved = await realpath(path.resolve(root, relative))
  const prefix = `${root}${path.sep}`
  if (!resolved.startsWith(prefix)) throw new Error(`Bundle path thoát khỏi thư mục gốc: ${relative}`)
  const info = await stat(resolved)
  if (!info.isFile()) throw new Error(`Bundle path không phải file: ${relative}`)
  return resolved
}

function parseManifest(value: unknown): DriveBundleManifest {
  if (!value || typeof value !== 'object') throw new Error('manifest.json phải là JSON object.')
  const input = value as Record<string, unknown>
  if (input.version !== 1 || !Array.isArray(input.media)) throw new Error('manifest.json phải có version=1 và media array.')
  const media = input.media.map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error(`manifest.media[${index}] không hợp lệ.`)
    const item = entry as Record<string, unknown>
    if (typeof item.mediaId !== 'string' || !item.mediaId.trim() || typeof item.path !== 'string' || !item.path.trim()) {
      throw new Error(`manifest.media[${index}] thiếu mediaId/path.`)
    }
    if (item.mimeType !== undefined && !['image/jpeg', 'image/png', 'image/webp'].includes(String(item.mimeType))) {
      throw new Error(`manifest.media[${index}].mimeType không được hỗ trợ.`)
    }
    return { mediaId: item.mediaId.trim(), path: item.path, ...(item.mimeType ? { mimeType: item.mimeType as DriveBundleMediaEntry['mimeType'] } : {}) }
  })
  if (new Set(media.map((item) => item.mediaId)).size !== media.length) throw new Error('manifest.json có mediaId trùng.')
  return {
    version: 1,
    familyFile: typeof input.familyFile === 'string' ? input.familyFile : 'family.json',
    sourceRevision: typeof input.sourceRevision === 'string' ? input.sourceRevision : undefined,
    media,
  }
}

export async function inspectDriveBundle(bundlePath: string): Promise<DriveBundleInspection> {
  const root = await realpath(path.resolve(bundlePath))
  const manifestPath = await containedFile(root, 'manifest.json')
  const manifestRaw = await readFile(manifestPath)
  const manifest = parseManifest(JSON.parse(manifestRaw.toString('utf8')))
  const familyPath = await containedFile(root, manifest.familyFile ?? 'family.json')
  const familyRaw = await readFile(familyPath)
  const parsed = JSON.parse(familyRaw.toString('utf8')) as { schemaVersion?: unknown }
  const sourceSchemaVersion = typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : -1
  const familyData = requireValidFamilyData(parsed)
  const validation = validateFamilyData(familyData)
  const manifestIds = new Set(manifest.media.map((item) => item.mediaId))
  const expectedIds = new Set(familyData.media.map((item) => item.id))
  for (const id of expectedIds) if (!manifestIds.has(id)) throw new Error(`Thiếu file ảnh trong manifest cho media '${id}'.`)
  for (const id of manifestIds) if (!expectedIds.has(id)) throw new Error(`Manifest tham chiếu media không tồn tại '${id}'.`)

  const media: InspectedMedia[] = []
  for (const entry of manifest.media) {
    const absolutePath = await containedFile(root, entry.path)
    const buffer = await readFile(absolutePath)
    const mimeType = detectMime(buffer)
    if (!mimeType) throw new Error(`File ảnh hỏng/không hỗ trợ: ${entry.path}`)
    if (entry.mimeType && entry.mimeType !== mimeType) throw new Error(`MIME không khớp magic bytes: ${entry.path}`)
    media.push({ ...entry, absolutePath, bytes: buffer.byteLength, sha256: sha256(buffer), mimeType })
  }
  return {
    root, manifest, familyData, sourceSchemaVersion,
    sourceChecksum: sha256(familyRaw), manifestChecksum: sha256(manifestRaw),
    normalizedHash: semanticFamilyHash(familyData), media,
    counts: { profiles: familyData.profiles.length, persons: familyData.persons.length, relationships: familyData.relationships.length, media: familyData.media.length },
    bytes: media.reduce((sum, item) => sum + item.bytes, 0), warnings: validation.warnings,
  }
}

export function storageFamilyData(inspection: DriveBundleInspection, workspaceId: string, runId: string): FamilyData {
  const metadata = new Map(inspection.media.map((item) => [item.mediaId, item]))
  return requireValidFamilyData({
    ...inspection.familyData,
    media: inspection.familyData.media.map((item) => {
      const source = metadata.get(item.id)
      if (!source) throw new Error(`Không tìm thấy metadata cho media '${item.id}'.`)
      const extension = source.mimeType === 'image/jpeg' ? 'jpg' : source.mimeType === 'image/png' ? 'png' : 'webp'
      const profileSegment = deterministicUuid(`profile:${item.profileId}`)
      const personSegment = deterministicUuid(`person:${item.personId}`)
      const uploadSegment = deterministicUuid(`migration:${runId}:${item.id}`)
      return { ...item, fileId: item.id, storagePath: `${workspaceId}/${profileSegment}/${personSegment}/${uploadSegment}/original.${extension}` }
    }),
  })
}

export function reconciliationReport(source: DriveBundleInspection, target: unknown) {
  const targetData = requireValidFamilyData(target)
  const targetCounts = { profiles: targetData.profiles.length, persons: targetData.persons.length, relationships: targetData.relationships.length, media: targetData.media.length }
  const targetHash = semanticFamilyHash(targetData)
  const countMatch = Object.entries(source.counts).every(([key, count]) => targetCounts[key as keyof typeof targetCounts] === count)
  const targetPeople = new Map(targetData.persons.map((item) => [item.id, item]))
  const targetRelationships = new Map(targetData.relationships.map((item) => [item.id, item]))
  const targetMedia = new Map(targetData.media.map((item) => [item.id, item]))
  const sameInstant = (sourceValue?: string, targetValue?: string) => !sourceValue || (Boolean(targetValue) && Date.parse(sourceValue) === Date.parse(targetValue!))
  const timestampsMatch = source.familyData.persons.every((item) => sameInstant(item.createdAt, targetPeople.get(item.id)?.createdAt) && sameInstant(item.updatedAt, targetPeople.get(item.id)?.updatedAt))
    && source.familyData.relationships.every((item) => sameInstant(item.createdAt, targetRelationships.get(item.id)?.createdAt) && sameInstant(item.updatedAt, targetRelationships.get(item.id)?.updatedAt))
    && source.familyData.media.every((item) => sameInstant(item.createdAt, targetMedia.get(item.id)?.createdAt))
  return { sourceCounts: source.counts, targetCounts, sourceHash: source.normalizedHash, targetHash, countMatch, timestampsMatch, semanticMatch: targetHash === source.normalizedHash, clean: countMatch && timestampsMatch && targetHash === source.normalizedHash }
}

export function redactOwner(email: string): string {
  return sha256(email.trim().toLowerCase()).slice(0, 16)
}
