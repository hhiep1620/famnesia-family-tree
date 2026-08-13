import type { MirrorSyncResult } from '../../src/types/collaboration.js'
import { collaborationApprovalEnabled } from './env.js'
import { collaboration, type MirrorRecord } from './collaborationRepository.js'
import { AppError } from './http.js'
import type { SafeUser } from './types.js'
import {
  FOLDER_MIME, UPLOAD_API, createFolder, createJsonFile, downloadText, driveProps, escapeQuery,
  findChild, findChildByProperty, getFile, googleJson, googleResponse, listFiles, propertyQuery, workspaceResources,
  type DriveFile,
} from './drive.js'

const MAX_FILES_PER_SYNC = 20
const MAX_SYNC_MS = 7_000
const MIRROR_SCHEMA_VERSION = 1 as const
export const MIRROR_SNAPSHOT_LIMIT = 20

interface MirrorManifestEntry {
  destinationId: string
  version?: string
  mimeType?: string
  name: string
  parentSourceId?: string
}

interface MirrorManifest {
  schemaVersion: 1
  workspaceId: string
  generation: number
  updatedAt: string
  files: Record<string, MirrorManifestEntry>
}

export function expiredMirrorHistoryFileIds(history: Pick<DriveFile, 'id' | 'createdTime' | 'appProperties'>[]): string[] {
  const groups = new Map<string, typeof history>()
  for (const file of history.filter((item) => item.appProperties?.resourceType?.startsWith('mirror-history-'))) {
    const snapshot = file.appProperties?.generation ?? file.createdTime ?? file.id
    groups.set(snapshot, [...(groups.get(snapshot) ?? []), file])
  }
  return [...groups.entries()]
    .toSorted(([, left], [, right]) => Math.max(...right.map((file) => Date.parse(file.createdTime ?? '') || 0)) - Math.max(...left.map((file) => Date.parse(file.createdTime ?? '') || 0)))
    .slice(MIRROR_SNAPSHOT_LIMIT)
    .flatMap(([, files]) => files.map((file) => file.id))
}

function emptyManifest(workspaceId: string): MirrorManifest {
  return { schemaVersion: MIRROR_SCHEMA_VERSION, workspaceId, generation: 0, updatedAt: new Date(0).toISOString(), files: {} }
}

async function readManifest(accessToken: string, fileId: string, workspaceId: string): Promise<MirrorManifest> {
  try {
    const parsed = JSON.parse(await downloadText(accessToken, fileId)) as MirrorManifest
    return parsed.schemaVersion === MIRROR_SCHEMA_VERSION && parsed.workspaceId === workspaceId && parsed.files && typeof parsed.files === 'object' ? parsed : emptyManifest(workspaceId)
  } catch { return emptyManifest(workspaceId) }
}

async function writeManifest(accessToken: string, fileId: string, manifest: MirrorManifest): Promise<void> {
  const response = await fetch(`${UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' }, body: `${JSON.stringify(manifest, null, 2)}\n`,
  })
  if (!response.ok) throw new AppError(response.status === 403 ? 403 : 502, response.status === 403 ? 'DRIVE_ACCESS_DENIED' : 'MIRROR_WRITE_FAILED', 'Mirror manifest could not be saved.')
}

async function listChildren(accessToken: string, parentId: string): Promise<DriveFile[]> {
  return listFiles(accessToken, `trashed = false and '${escapeQuery(parentId)}' in parents`, 'name')
}

async function officialFiles(accessToken: string, workspaceId: string): Promise<{ file: DriveFile; parentSourceId: string; depth: number }[]> {
  const result: { file: DriveFile; parentSourceId: string; depth: number }[] = []
  const queue = [{ id: workspaceId, depth: 0 }]
  while (queue.length) {
    const current = queue.shift()!
    if (current.depth > 8) throw new AppError(422, 'MIRROR_TREE_TOO_DEEP', 'Workspace folder hierarchy is too deep to mirror safely.')
    for (const file of await listChildren(accessToken, current.id)) {
      const type = file.appProperties?.resourceType
      if (type === 'collaboration-drafts' || type === 'member-draft-folder' || type === 'draft-assets' || type === 'active-family-draft' || type === 'draft-photo') continue
      result.push({ file, parentSourceId: current.id, depth: current.depth + 1 })
      if (file.mimeType === FOLDER_MIME) queue.push({ id: file.id, depth: current.depth + 1 })
    }
  }
  return result.toSorted((left, right) => Number(right.file.mimeType === FOLDER_MIME) - Number(left.file.mimeType === FOLDER_MIME) || left.depth - right.depth || left.file.name.localeCompare(right.file.name))
}

async function ensureMirrorRecord(accessToken: string, workspaceId: string, user: SafeUser, generation: number): Promise<MirrorRecord> {
  const repository = collaboration()
  const existing = await repository.getMirror(workspaceId, user.id)
  if (existing?.rootFolderId && existing.latestFolderId && existing.historyFolderId && existing.stateFileId) return { ...existing, generation }
  const sourceRoot = await getFile(accessToken, workspaceId)
  const container = (await listFiles(accessToken, `${propertyQuery('mirror-container')} and 'root' in parents`, 'name')).find((item) => item.ownedByMe && item.appProperties?.ownerSub === user.id)
    ?? await createFolder(accessToken, 'Famnesia Mirrors', 'mirror-container', undefined, { ownerSub: user.id })
  const root = await findChildByProperty(accessToken, container.id, 'mirror-root', 'workspaceId', workspaceId)
    ?? await createFolder(accessToken, sourceRoot.name, 'mirror-root', container.id, { workspaceId })
  const latest = await findChild(accessToken, root.id, 'mirror-latest') ?? await createFolder(accessToken, 'latest', 'mirror-latest', root.id, { workspaceId })
  const history = await findChild(accessToken, root.id, 'mirror-history') ?? await createFolder(accessToken, 'history', 'mirror-history', root.id, { workspaceId })
  const state = await findChild(accessToken, root.id, 'mirror-state') ?? await createJsonFile(accessToken, 'mirror-state.json', root.id, 'mirror-state', `${JSON.stringify(emptyManifest(workspaceId), null, 2)}\n`, { workspaceId })
  const record: MirrorRecord = {
    workspaceId, googleSub: user.id, email: user.email, generation, syncedGeneration: existing?.syncedGeneration ?? -1,
    status: 'pending', rootFolderId: root.id, latestFolderId: latest.id, historyFolderId: history.id, stateFileId: state.id,
  }
  await repository.saveMirror(record)
  return record
}

async function copyFile(accessToken: string, source: DriveFile, parentId: string, workspaceId: string): Promise<string> {
  const copied = await googleJson<{ id?: string }>(accessToken, `/files/${encodeURIComponent(source.id)}/copy?fields=id`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      name: source.name, parents: [parentId], appProperties: driveProps('mirror-file', { workspaceId, sourceFileId: source.id, sourceVersion: source.version ?? '' }),
    }),
  })
  if (!copied.id) throw new AppError(502, 'MIRROR_COPY_FAILED', 'Google Drive did not return the mirrored file ID.')
  return copied.id
}

async function safelyDeleteManaged(accessToken: string, entry: MirrorManifestEntry, managedIds: Set<string>): Promise<boolean> {
  if (entry.mimeType === FOLDER_MIME) {
    const children = await listChildren(accessToken, entry.destinationId).catch(() => [])
    if (children.some((child) => !managedIds.has(child.id))) return false
  }
  await googleResponse(accessToken, `/files/${encodeURIComponent(entry.destinationId)}`, { method: 'DELETE' }).catch((error) => {
    if (error instanceof AppError && error.status === 404) return undefined
    throw error
  })
  return true
}

async function finalizeHistory(accessToken: string, workspaceId: string, generation: number, historyFolderId: string, manifest: MirrorManifest, sources: { file: DriveFile }[]): Promise<void> {
  const family = sources.find(({ file }) => file.appProperties?.resourceType === 'family-data')?.file
  if (family) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_')
    await createJsonFile(accessToken, `${stamp}-family.json`, historyFolderId, 'mirror-history-family', await downloadText(accessToken, family.id), { workspaceId, generation: String(generation) })
    await createJsonFile(accessToken, `${stamp}-manifest.json`, historyFolderId, 'mirror-history-manifest', `${JSON.stringify(manifest, null, 2)}\n`, { workspaceId, generation: String(generation) })
  }
  const history = await listChildren(accessToken, historyFolderId)
  await Promise.allSettled(expiredMirrorHistoryFileIds(history).map((fileId) => googleResponse(accessToken, `/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' })))
}

async function syncDriveMirrorLocked(accessToken: string, workspaceId: string, user: SafeUser): Promise<MirrorSyncResult> {
  if (!collaborationApprovalEnabled()) throw new AppError(404, 'COLLAB_APPROVAL_DISABLED', 'Drive mirror is not enabled.')
  const workspace = await workspaceResources(accessToken, workspaceId)
  if (workspace.access.ownedByMe) throw new AppError(403, 'MIRROR_OWNER_NOT_REQUIRED', 'Owners do not need a personal mirror of their own workspace.')
  const member = await collaboration().getMember(workspaceId, user.email)
  if (member?.role !== 'contributor') throw new AppError(403, 'MIRROR_CONTRIBUTOR_REQUIRED', 'Only contributors receive an automatic Drive mirror.')
  const repository = collaboration()
  let generation = await repository.getMirrorGeneration(workspaceId)
  if (generation === 0) generation = await repository.bumpMirrorGeneration(workspaceId)
  let record = await ensureMirrorRecord(accessToken, workspaceId, user, generation)
  record = { ...record, generation, status: 'syncing', error: undefined }
  await repository.saveMirror(record)
  try {
    const manifest = await readManifest(accessToken, record.stateFileId!, workspaceId)
    const sources = await officialFiles(accessToken, workspaceId)
    const sourceIds = new Set(sources.map(({ file }) => file.id))
    const managedDestinationIds = new Set(Object.values(manifest.files).map((entry) => entry.destinationId))
    const pendingSources = sources.filter(({ file }) => {
      const current = manifest.files[file.id]
      return !current || current.version !== file.version || current.name !== file.name
    })
    const deletedSourceIds = Object.keys(manifest.files).filter((sourceId) => !sourceIds.has(sourceId))
    const initialRemaining = pendingSources.length + deletedSourceIds.length
    const started = Date.now()
    let processed = 0

    for (const source of pendingSources) {
      if (processed >= MAX_FILES_PER_SYNC || Date.now() - started >= MAX_SYNC_MS) break
      const existing = manifest.files[source.file.id]
      const parentId = source.parentSourceId === workspaceId ? record.latestFolderId! : manifest.files[source.parentSourceId]?.destinationId
      if (!parentId) continue
      if (existing && source.file.mimeType !== FOLDER_MIME) await safelyDeleteManaged(accessToken, existing, managedDestinationIds)
      const destinationId = source.file.mimeType === FOLDER_MIME
        ? existing?.destinationId ?? (await createFolder(accessToken, source.file.name, 'mirror-folder', parentId, { workspaceId, sourceFileId: source.file.id })).id
        : await copyFile(accessToken, source.file, parentId, workspaceId)
      if (existing && source.file.mimeType === FOLDER_MIME && existing.name !== source.file.name) {
        await googleJson(accessToken, `/files/${encodeURIComponent(destinationId)}?fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: source.file.name }) })
      }
      if (existing) managedDestinationIds.delete(existing.destinationId)
      managedDestinationIds.add(destinationId)
      manifest.files[source.file.id] = { destinationId, version: source.file.version, mimeType: source.file.mimeType, name: source.file.name, parentSourceId: source.parentSourceId }
      processed += 1
    }
    for (const sourceId of deletedSourceIds) {
      if (processed >= MAX_FILES_PER_SYNC || Date.now() - started >= MAX_SYNC_MS) break
      const entry = manifest.files[sourceId]
      if (await safelyDeleteManaged(accessToken, entry, managedDestinationIds)) managedDestinationIds.delete(entry.destinationId)
      delete manifest.files[sourceId]
      processed += 1
    }

    const remaining = Math.max(0, initialRemaining - processed)
    manifest.updatedAt = new Date().toISOString()
    if (remaining === 0) manifest.generation = generation
    await writeManifest(accessToken, record.stateFileId!, manifest)
    if (remaining === 0 && record.syncedGeneration !== generation) await finalizeHistory(accessToken, workspaceId, generation, record.historyFolderId!, manifest, sources)
    record = {
      ...record, generation, syncedGeneration: remaining === 0 ? generation : record.syncedGeneration,
      status: remaining === 0 ? 'synced' : 'pending', cursor: remaining ? `${generation}:${manifest.updatedAt}` : undefined,
      lastSyncedAt: remaining === 0 ? manifest.updatedAt : record.lastSyncedAt,
    }
    await repository.saveMirror(record)
    return {
      status: record.status, generation, processed, remaining, cursor: record.cursor, mirrorFolderId: record.rootFolderId,
      mirrorFolderUrl: record.rootFolderId ? `https://drive.google.com/drive/folders/${record.rootFolderId}` : undefined, lastSyncedAt: record.lastSyncedAt,
    }
  } catch (error) {
    record = { ...record, status: 'failed', error: error instanceof Error ? error.message : String(error) }
    await repository.saveMirror(record)
    throw error
  }
}

export async function syncDriveMirror(accessToken: string, workspaceId: string, user: SafeUser): Promise<MirrorSyncResult> {
  if (!collaborationApprovalEnabled()) throw new AppError(404, 'COLLAB_APPROVAL_DISABLED', 'Drive mirror is not enabled.')
  const repository = collaboration()
  const lockId = `mirror:${user.id}`
  const lockToken = await repository.acquireAuthorWorkflowLock(workspaceId, lockId)
  if (!lockToken) throw new AppError(409, 'MIRROR_SYNC_IN_PROGRESS', 'This Drive mirror is already syncing in another Famnesia session.')
  try { return await syncDriveMirrorLocked(accessToken, workspaceId, user) }
  finally { await repository.releaseAuthorWorkflowLock(workspaceId, lockId, lockToken) }
}
