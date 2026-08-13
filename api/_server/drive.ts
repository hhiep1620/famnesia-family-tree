import { createEmptyFamilyData, CURRENT_SCHEMA_VERSION, requireValidFamilyData, validateFamilyData } from '../../src/schema/familyDataSchema.js'
import { ACTIVITY_RETENTION_LIMIT, parseActivityJsonLines, retainRecentActivity, serializeActivityJsonLines } from '../../src/activity/activityRetention.js'
import { serializeFamilyData } from '../../src/import/exportFamilyData.js'
import { compactFamilyOperations, mergeFamilyOperations, operationCounts } from '../../src/draft/familyOperations.js'
import type { ActivityEvent, FamilyBackup, FamilyData } from '../../src/types/family.js'
import type { FamilyCommitMeta, FamilyCommitRequest, FamilyOperation } from '../../src/types/familyOperations.js'
import { AppError } from './http.js'
import type { WorkspaceAccess, WorkspaceRole } from './types.js'
import { collaborationApprovalEnabled } from './env.js'

export const DRIVE_API = 'https://www.googleapis.com/drive/v3'
export const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
export const FOLDER_MIME = 'application/vnd.google-apps.folder'
export const DRIVE_APP = 'family-tree'
export const FILE_FIELDS = 'id,name,mimeType,parents,appProperties,createdTime,modifiedTime,version,webViewLink,ownedByMe,inheritedPermissionsDisabled,md5Checksum,size,capabilities(canEdit,canAddChildren,canShare,canCopy,canListChildren,canDisableInheritedPermissions,canEnableInheritedPermissions)'

export interface DriveFile {
  id: string
  name: string
  mimeType?: string
  parents?: string[]
  appProperties?: Record<string, string>
  createdTime?: string
  modifiedTime?: string
  version?: string
  webViewLink?: string
  ownedByMe?: boolean
  inheritedPermissionsDisabled?: boolean
  md5Checksum?: string
  size?: string
  capabilities?: { canEdit?: boolean; canAddChildren?: boolean; canShare?: boolean; canCopy?: boolean; canListChildren?: boolean; canDisableInheritedPermissions?: boolean; canEnableInheritedPermissions?: boolean }
}

interface DriveFileVersion { file: DriveFile; etag?: string }

export interface WorkspaceResources {
  root: DriveFile
  familyData: DriveFile
  backups: DriveFile
  photos: DriveFile
  activity?: DriveFile
  access: WorkspaceAccess
}

export interface FamilyRevision { modifiedTime?: string; version?: string }
export interface FamilySnapshot { data: FamilyData; revision: FamilyRevision }
export interface WorkspaceMember { id: string; email?: string; name?: string; photoUrl?: string; role: WorkspaceRole; inherited: boolean }

export async function googleResponse(accessToken: string, path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...init?.headers },
  })
  if (!response.ok) {
    const raw = await response.text()
    let message = 'Google Drive request failed.'
    try { message = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? message } catch { /* no-op */ }
    if (response.status === 401) throw new AppError(428, 'GOOGLE_RECONNECT_REQUIRED', 'Google access has expired. Please reconnect.')
    if (response.status === 403) throw new AppError(403, 'DRIVE_ACCESS_DENIED', 'Google Drive denied this operation.')
    if (response.status === 404) throw new AppError(404, 'DRIVE_RESOURCE_NOT_FOUND', 'The requested Drive resource was not found.')
    throw new AppError(502, 'GOOGLE_DRIVE_FAILED', message)
  }
  return response
}

export async function googleJson<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await googleResponse(accessToken, path, init)
  if (response.status === 204) return undefined as T
  return await response.json() as T
}

export function escapeQuery(value: string): string { return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") }
export function propertyQuery(type: string): string {
  return `trashed = false and appProperties has { key='app' and value='${DRIVE_APP}' } and appProperties has { key='resourceType' and value='${type}' }`
}
export function driveProps(resourceType: string, extra: Record<string, string> = {}) { return { app: DRIVE_APP, resourceType, ...extra } }

export async function listFiles(accessToken: string, query: string, orderBy = 'modifiedTime desc'): Promise<DriveFile[]> {
  const params = new URLSearchParams({ q: query, spaces: 'drive', orderBy, pageSize: '1000', fields: `files(${FILE_FIELDS})` })
  const result = await googleJson<{ files?: DriveFile[] }>(accessToken, `/files?${params}`)
  return result.files ?? []
}

export async function getFile(accessToken: string, fileId: string): Promise<DriveFile> {
  return googleJson(accessToken, `/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(FILE_FIELDS)}`)
}

export async function getFileVersion(accessToken: string, fileId: string): Promise<DriveFileVersion> {
  const response = await googleResponse(accessToken, `/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(FILE_FIELDS)}`)
  return { file: await response.json() as DriveFile, etag: response.headers.get('etag') ?? undefined }
}

export async function createFolder(accessToken: string, name: string, resourceType: string, parentId?: string, extra: Record<string, string> = {}): Promise<DriveFile> {
  return googleJson(accessToken, `/files?fields=${encodeURIComponent(FILE_FIELDS)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, appProperties: driveProps(resourceType, extra), parents: parentId ? [parentId] : undefined }),
  })
}

export async function createJsonFile(accessToken: string, name: string, parentId: string, resourceType: string, content: string, extra: Record<string, string> = {}): Promise<DriveFile> {
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify({ name, parents: [parentId], mimeType: 'application/json', appProperties: driveProps(resourceType, extra) })], { type: 'application/json' }))
  form.append('file', new Blob([content], { type: 'application/json' }))
  const response = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=${encodeURIComponent(FILE_FIELDS)}`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form,
  })
  if (!response.ok) {
    if (response.status === 403) throw new AppError(403, 'DRIVE_ACCESS_DENIED', 'Google Drive denied this operation.')
    throw new AppError(502, 'GOOGLE_DRIVE_FAILED', 'The file could not be created in Google Drive.')
  }
  return await response.json() as DriveFile
}

export async function findChild(accessToken: string, parentId: string, type: string): Promise<DriveFile | undefined> {
  return (await listFiles(accessToken, `${propertyQuery(type)} and '${escapeQuery(parentId)}' in parents`))[0]
}

export async function findChildByProperty(accessToken: string, parentId: string, type: string, key: string, value: string): Promise<DriveFile | undefined> {
  return (await listFiles(accessToken, `${propertyQuery(type)} and appProperties has { key='${escapeQuery(key)}' and value='${escapeQuery(value)}' } and '${escapeQuery(parentId)}' in parents`))[0]
}

async function ensureOwnerWorkspace(accessToken: string): Promise<DriveFile> {
  const roots = await listFiles(accessToken, propertyQuery('workspace-root'))
  const owned = roots.find((file) => file.ownedByMe)
  if (owned) return owned
  return createFolder(accessToken, 'Famnesia', 'workspace-root')
}

async function ensureResources(accessToken: string, root: DriveFile): Promise<WorkspaceResources> {
  const access = accessOf(root)
  let [familyData, backups, photos, activity] = await Promise.all([
    findChild(accessToken, root.id, 'family-data'), findChild(accessToken, root.id, 'backups'), findChild(accessToken, root.id, 'photos'), findChild(accessToken, root.id, 'activity'),
  ])
  if ((!familyData || !backups || !photos) && access.role !== 'owner') {
    throw new AppError(409, 'WORKSPACE_INCOMPLETE', 'This shared workspace is incomplete. Ask its owner to open it once.')
  }
  backups ??= await createFolder(accessToken, 'backups', 'backups', root.id)
  photos ??= await createFolder(accessToken, 'photos', 'photos', root.id)
  if (!activity && access.role !== 'viewer') activity = await createFolder(accessToken, 'activity', 'activity', root.id)
  familyData ??= await createJsonFile(accessToken, 'family.json', root.id, 'family-data', `${JSON.stringify(createEmptyFamilyData(), null, 2)}\n`, { schemaVersion: String(CURRENT_SCHEMA_VERSION) })
  return { root, familyData, backups, photos, activity, access }
}

function accessOf(root: DriveFile): WorkspaceAccess {
  const approval = collaborationApprovalEnabled()
  const role: WorkspaceRole = root.ownedByMe ? 'owner' : root.capabilities?.canEdit ? 'contributor' : 'viewer'
  return {
    id: root.id, name: root.name, role, canRead: true,
    canEdit: role !== 'viewer', canUpload: role !== 'viewer', canManageMembers: role === 'owner',
    canCommitDirectly: role === 'owner' || (!approval && role === 'contributor'),
    canSubmitDraft: approval && role === 'contributor', canReviewDrafts: approval && role === 'owner',
    ownedByMe: Boolean(root.ownedByMe), webViewLink: root.webViewLink,
  }
}

export async function listWorkspaces(accessToken: string): Promise<WorkspaceAccess[]> {
  let roots = await listFiles(accessToken, propertyQuery('workspace-root'), 'name')
  if (roots.length === 0) {
    await ensureResources(accessToken, await ensureOwnerWorkspace(accessToken))
    roots = await listFiles(accessToken, propertyQuery('workspace-root'), 'name')
  }
  return roots.map(accessOf).sort((a, b) => Number(b.ownedByMe) - Number(a.ownedByMe) || a.name.localeCompare(b.name))
}

export async function workspaceResources(accessToken: string, workspaceId: string, minimum: WorkspaceRole = 'viewer'): Promise<WorkspaceResources> {
  const root = await getFile(accessToken, workspaceId)
  if (root.appProperties?.app !== DRIVE_APP || root.appProperties?.resourceType !== 'workspace-root' || root.mimeType !== FOLDER_MIME) {
    throw new AppError(404, 'WORKSPACE_NOT_FOUND', 'Famnesia workspace not found.')
  }
  const result = await ensureResources(accessToken, root)
  const level = { viewer: 0, contributor: 1, owner: 2 }
  if (level[result.access.role] < level[minimum]) throw new AppError(403, 'INSUFFICIENT_ROLE', `This operation requires ${minimum} access.`)
  return result
}

function revision(file: DriveFile): FamilyRevision { return { modifiedTime: file.modifiedTime, version: file.version } }
function sameRevision(expected: FamilyRevision | undefined, current: DriveFile): boolean {
  if (!expected) return true
  if (expected.version && current.version) return expected.version === current.version
  if (expected.modifiedTime && current.modifiedTime) return expected.modifiedTime === current.modifiedTime
  return true
}

export async function downloadText(accessToken: string, fileId: string): Promise<string> {
  return (await googleResponse(accessToken, `/files/${encodeURIComponent(fileId)}?alt=media`)).text()
}

export async function loadFamily(accessToken: string, workspaceId: string): Promise<{ snapshot: FamilySnapshot; workspace: WorkspaceAccess & { rootFolderUrl: string } }> {
  const resource = await workspaceResources(accessToken, workspaceId)
  const current = await getFile(accessToken, resource.familyData.id)
  const text = await downloadText(accessToken, resource.familyData.id)
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new AppError(422, 'FAMILY_JSON_INVALID', 'family.json is not valid JSON.') }
  return { snapshot: { data: requireValidFamilyData(value), revision: revision(current) }, workspace: { ...resource.access, rootFolderUrl: resource.root.webViewLink ?? `https://drive.google.com/drive/folders/${resource.root.id}` } }
}

export async function saveFamily(accessToken: string, workspaceId: string, data: FamilyData, expected: FamilyRevision | undefined, mode: 'save' | 'replace' | 'restore' | 'merge' = 'save', actor?: { email: string; name?: string }): Promise<FamilySnapshot> {
  const minimum: WorkspaceRole = mode === 'replace' || mode === 'restore' || collaborationApprovalEnabled() ? 'owner' : 'contributor'
  const resource = await workspaceResources(accessToken, workspaceId, minimum)
  const current = await getFile(accessToken, resource.familyData.id)
  if (!sameRevision(expected, current)) throw new AppError(409, 'FAMILY_DATA_CONFLICT', 'Family data changed in another session. Reload before saving.', { currentRevision: revision(current) })
  const currentContent = await downloadText(accessToken, resource.familyData.id)
  if (mode !== 'save') {
    await createJsonFile(accessToken, backupName(), resource.backups.id, 'family-backup', currentContent, {
      schemaVersion: String(CURRENT_SCHEMA_VERSION), reason: mode === 'restore' ? 'before-restore' : mode === 'merge' ? 'before-merge' : 'before-import',
    })
  }
  const updatedAt = new Date().toISOString()
  const next = requireValidFamilyData({ ...requireValidFamilyData(data), updatedAt })
  const response = await fetch(`${UPLOAD_API}/files/${encodeURIComponent(resource.familyData.id)}?uploadType=media&fields=${encodeURIComponent(FILE_FIELDS)}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' }, body: serializeFamilyData(next, updatedAt),
  })
  if (!response.ok) throw new AppError(response.status === 403 ? 403 : 502, response.status === 403 ? 'DRIVE_ACCESS_DENIED' : 'GOOGLE_DRIVE_FAILED', 'family.json could not be saved.')
  const written = await response.json() as DriveFile
  if (actor) {
    let before: FamilyData | undefined
    try { before = requireValidFamilyData(JSON.parse(currentContent)) } catch { /* family write already validated independently */ }
    const action = describeFamilyMutation(mode, before, next)
    await appendActivity(accessToken, workspaceId, { actorEmail: actor.email, actorName: actor.name, ...action }).catch((error) => console.error('Activity append failed', error instanceof Error ? error.message : String(error)))
  }
  return { data: next, revision: revision(written) }
}

function commitCountLabels(operations: FamilyOperation[]): Record<string, number> {
  const raw = operationCounts(operations)
  const labels: Record<string, string> = {
    'profile.create': 'profileCreated', 'profile.update': 'profileUpdated', 'subject.set': 'subjectSet',
    'person.create': 'personCreated', 'person.update': 'personUpdated', 'person.delete': 'personDeleted',
    'relationship.create': 'relationshipCreated', 'relationship.update': 'relationshipUpdated', 'relationship.delete': 'relationshipDeleted',
    'media.attach': 'mediaAttached', 'media.primary.set': 'mediaPrimarySet', 'media.caption.update': 'mediaCaptionUpdated', 'media.delete': 'mediaDeleted',
    'settings.duplicate_suppression.add': 'duplicateSuppressionAdded',
  }
  return Object.fromEntries(Object.entries(raw).map(([key, count]) => [labels[key] ?? key, count]))
}

async function writeCommittedFamily(accessToken: string, file: DriveFile, etag: string | undefined, data: FamilyData, commitId: string): Promise<DriveFile> {
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify({ appProperties: { ...(file.appProperties ?? {}), lastCommitId: commitId } })], { type: 'application/json' }))
  form.append('file', new Blob([serializeFamilyData(data, data.updatedAt)], { type: 'application/json' }))
  const response = await fetch(`${UPLOAD_API}/files/${encodeURIComponent(file.id)}?uploadType=multipart&fields=${encodeURIComponent(FILE_FIELDS)}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, ...(etag ? { 'If-Match': etag } : {}) }, body: form,
  })
  if (response.status === 412) throw new AppError(409, 'FAMILY_COMMIT_RACE', 'Family data changed while the commit was being prepared.')
  if (!response.ok) throw new AppError(response.status === 403 ? 403 : 502, response.status === 403 ? 'DRIVE_ACCESS_DENIED' : 'GOOGLE_DRIVE_FAILED', 'family.json could not be committed.')
  return await response.json() as DriveFile
}

async function appendCommitActivity(accessToken: string, workspaceId: string, actor: { email: string; name?: string }, commit: FamilyCommitMeta): Promise<void> {
  const existing = await listActivity(accessToken, workspaceId).catch(() => [])
  if (existing.some((event) => event.metadata?.commitId === commit.commitId)) return
  await appendActivity(accessToken, workspaceId, {
    actorEmail: actor.email,
    actorName: actor.name,
    action: 'family.commit',
    entityType: 'dataset',
    summary: `${actor.name ?? actor.email} đã lưu ${commit.operationCount} thay đổi`,
    metadata: { commitId: commit.commitId, operationCount: commit.operationCount, counts: commit.counts },
  })
}

async function validateCommitPhotoReferences(accessToken: string, workspaceId: string, photosFolderId: string, operations: FamilyOperation[]): Promise<void> {
  const ids = [...new Set(operations.filter((item) => item.type === 'media.attach').map((item) => String((item.value as { driveFileId?: unknown } | undefined)?.driveFileId ?? '')).filter(Boolean))]
  const checks = await Promise.all(ids.map(async (fileId) => {
    try {
      const file = await getFile(accessToken, fileId)
      return file.appProperties?.resourceType === 'person-photo' && file.appProperties?.workspaceId === workspaceId && await isInsidePhotoFolder(accessToken, file, photosFolderId)
    } catch { return false }
  }))
  if (checks.some((valid) => !valid)) throw new AppError(422, 'FAMILY_COMMIT_INVALID', 'One or more photo references do not belong to this Famnesia workspace.')
}

export async function commitFamily(accessToken: string, workspaceId: string, request: FamilyCommitRequest, actor: { email: string; name?: string }): Promise<{ snapshot: FamilySnapshot; commit: FamilyCommitMeta }> {
  const operations = compactFamilyOperations(request.operations)
  const commit: FamilyCommitMeta = { commitId: request.commitId, operationCount: operations.length, counts: commitCountLabels(operations) }
  const resource = await workspaceResources(accessToken, workspaceId, collaborationApprovalEnabled() ? 'owner' : 'contributor')

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const currentVersion = await getFileVersion(accessToken, resource.familyData.id)
    const currentText = await downloadText(accessToken, resource.familyData.id)
    let latest: FamilyData
    try { latest = requireValidFamilyData(JSON.parse(currentText)) }
    catch { throw new AppError(422, 'FAMILY_JSON_INVALID', 'family.json is not valid Famnesia data.') }

    if (currentVersion.file.appProperties?.lastCommitId === request.commitId) {
      const idempotentCommit = { ...commit, idempotent: true }
      await appendCommitActivity(accessToken, workspaceId, actor, idempotentCommit).catch((error) => console.error('Commit activity append failed', error instanceof Error ? error.message : String(error)))
      return { snapshot: { data: latest, revision: revision(currentVersion.file) }, commit: idempotentCommit }
    }

    const merged = mergeFamilyOperations(latest, operations)
    if (merged.conflicts.length) {
      throw new AppError(409, 'FAMILY_COMMIT_CONFLICT', 'Some changes conflict with the latest Drive version.', {
        conflicts: merged.conflicts,
        latestSnapshot: { data: latest, revision: revision(currentVersion.file) },
      })
    }
    const updatedAt = new Date().toISOString()
    const validation = validateFamilyData({ ...merged.data, updatedAt })
    if (!validation.data) throw new AppError(422, 'FAMILY_COMMIT_INVALID', 'The combined changes failed genealogy validation.', { errors: validation.errors.slice(0, 50) })
    await validateCommitPhotoReferences(accessToken, workspaceId, resource.photos.id, operations)

    try {
      const written = await writeCommittedFamily(accessToken, currentVersion.file, currentVersion.etag, validation.data, request.commitId)
      await appendCommitActivity(accessToken, workspaceId, actor, commit).catch((error) => console.error('Commit activity append failed', error instanceof Error ? error.message : String(error)))
      const referenced = new Set(validation.data.media.map((item) => item.driveFileId))
      const removedPhotoIds = latest.media.filter((item) => !referenced.has(item.driveFileId)).map((item) => item.driveFileId)
      await Promise.allSettled(removedPhotoIds.map((fileId) => deletePhoto(accessToken, workspaceId, fileId)))
      await cleanupOrphanPhotos(accessToken, workspaceId, validation.data).catch((error) => { console.error('Photo cleanup failed', error instanceof Error ? error.message : String(error)); return 0 })
      return { snapshot: { data: validation.data, revision: revision(written) }, commit }
    } catch (error) {
      if (error instanceof AppError && error.code === 'FAMILY_COMMIT_RACE' && attempt < 2) continue
      throw error
    }
  }
  throw new AppError(409, 'FAMILY_COMMIT_CONFLICT', 'Family data kept changing. Please review and save again.')
}

function describeFamilyMutation(mode: 'save' | 'replace' | 'restore' | 'merge', before: FamilyData | undefined, after: FamilyData): Pick<ActivityEvent, 'action' | 'entityType' | 'entityId' | 'summary' | 'metadata'> {
  if (mode === 'replace') return { action: 'dataset.imported', entityType: 'dataset', summary: 'Imported family dataset', metadata: { people: after.persons.length, relationships: after.relationships.length, media: after.media.length } }
  if (mode === 'restore') return { action: 'backup.restored', entityType: 'dataset', summary: 'Restored a family backup' }
  if (mode === 'merge') return { action: 'person.merged', entityType: 'person', summary: 'Merged duplicate people', metadata: { peopleBefore: before?.persons.length, peopleAfter: after.persons.length } }
  if (!before) return { action: 'dataset.updated', entityType: 'dataset', summary: 'Updated family data' }
  const personDelta = after.persons.length - before.persons.length
  const relationshipDelta = after.relationships.length - before.relationships.length
  const mediaDelta = after.media.length - before.media.length
  if (personDelta === 1) { const added = after.persons.find((person) => !before?.persons.some((old) => old.id === person.id)); return { action: 'person.created', entityType: 'person', entityId: added?.id, summary: `Added ${added?.name ?? 'a person'}` } }
  if (personDelta === -1) {
    const removed = before.persons.find((person) => !after.persons.some((current) => current.id === person.id))
    return {
      action: 'person.deleted', entityType: 'person', entityId: removed?.id, summary: `Deleted ${removed?.name ?? 'a person'}`,
      metadata: { relationshipsRemoved: Math.max(0, -relationshipDelta), mediaRemoved: Math.max(0, -mediaDelta) },
    }
  }
  if (relationshipDelta === 1) return { action: 'relationship.created', entityType: 'relationship', summary: 'Added a relationship' }
  if (relationshipDelta === -1) return { action: 'relationship.deleted', entityType: 'relationship', summary: 'Deleted a relationship' }
  if (mediaDelta === 1) return { action: 'photo.uploaded', entityType: 'photo', summary: 'Uploaded a photo' }
  const changed = after.persons.find((person) => JSON.stringify(person) !== JSON.stringify(before?.persons.find((old) => old.id === person.id)))
  return { action: changed ? 'person.updated' : 'dataset.updated', entityType: changed ? 'person' : 'dataset', entityId: changed?.id, summary: changed ? `Updated ${changed.name}` : 'Updated family data' }
}

async function writeTextFile(accessToken: string, fileId: string, content: string): Promise<void> {
  const response = await fetch(`${UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id`, { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/x-ndjson; charset=UTF-8' }, body: content })
  if (!response.ok) throw new AppError(502, 'ACTIVITY_WRITE_FAILED', 'Activity history could not be saved.')
}

export async function appendActivity(accessToken: string, workspaceId: string, input: Pick<ActivityEvent, 'actorEmail' | 'actorName' | 'action' | 'entityType' | 'entityId' | 'summary' | 'metadata'>): Promise<void> {
  const resource = await workspaceResources(accessToken, workspaceId, collaborationApprovalEnabled() ? 'owner' : 'contributor')
  const folder = resource.activity ?? await createFolder(accessToken, 'activity', 'activity', resource.root.id)
  const month = new Date().toISOString().slice(0, 7)
  const files = await listFiles(accessToken, `${propertyQuery('activity-log')} and '${escapeQuery(folder.id)}' in parents`, 'name desc')
  const contents = await Promise.all(files.map((file) => downloadText(accessToken, file.id)))
  const event: ActivityEvent = { id: crypto.randomUUID(), workspaceId, timestamp: new Date().toISOString(), ...input }
  const retained = retainRecentActivity([...parseActivityJsonLines(contents), event])
  const target = files.find((file) => file.appProperties?.month === month)
  if (target) await writeTextFile(accessToken, target.id, serializeActivityJsonLines(retained))
  else await createJsonFile(accessToken, `${month}.jsonl`, folder.id, 'activity-log', serializeActivityJsonLines(retained), { month })
  await Promise.allSettled(files.filter((file) => file.id !== target?.id).map((file) => googleResponse(accessToken, `/files/${encodeURIComponent(file.id)}`, { method: 'DELETE' })))
}

export async function listActivity(accessToken: string, workspaceId: string, limit = ACTIVITY_RETENTION_LIMIT): Promise<ActivityEvent[]> {
  const resource = await workspaceResources(accessToken, workspaceId)
  if (!resource.activity) return []
  const files = await listFiles(accessToken, `${propertyQuery('activity-log')} and '${escapeQuery(resource.activity.id)}' in parents`, 'name desc')
  const events = parseActivityJsonLines(await Promise.all(files.map((file) => downloadText(accessToken, file.id))))
  return retainRecentActivity(events, limit)
}

function backupName(): string { return `famnesia_${new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').replace(/\.\d{3}Z$/, '')}.json` }

export async function createBackup(accessToken: string, workspaceId: string, data: FamilyData, reason = 'manual'): Promise<FamilyBackup> {
  const resource = await workspaceResources(accessToken, workspaceId, collaborationApprovalEnabled() ? 'owner' : 'contributor')
  const file = await createJsonFile(accessToken, backupName(), resource.backups.id, 'family-backup', serializeFamilyData(requireValidFamilyData(data)), { schemaVersion: String(CURRENT_SCHEMA_VERSION), reason })
  return { id: file.id, name: file.name, createdTime: file.createdTime, modifiedTime: file.modifiedTime, reason }
}

export async function listBackups(accessToken: string, workspaceId: string): Promise<FamilyBackup[]> {
  const resource = await workspaceResources(accessToken, workspaceId)
  return (await listFiles(accessToken, `${propertyQuery('family-backup')} and '${escapeQuery(resource.backups.id)}' in parents`, 'createdTime desc')).map((file) => ({
    id: file.id, name: file.name, createdTime: file.createdTime, modifiedTime: file.modifiedTime, reason: file.appProperties?.reason,
  }))
}

export async function loadBackup(accessToken: string, workspaceId: string, backupId: string): Promise<FamilyData> {
  const resource = await workspaceResources(accessToken, workspaceId, 'owner')
  const backup = await getFile(accessToken, backupId)
  if (!backup.parents?.includes(resource.backups.id) || backup.appProperties?.resourceType !== 'family-backup') throw new AppError(404, 'BACKUP_NOT_FOUND', 'Backup not found in this workspace.')
  try { return requireValidFamilyData(JSON.parse(await downloadText(accessToken, backup.id))) }
  catch { throw new AppError(422, 'BACKUP_INVALID', 'The selected backup is invalid.') }
}

export async function uploadPhoto(accessToken: string, workspaceId: string, file: Blob, filename: string, profileId?: string, personId?: string, uploadedBy?: string): Promise<string> {
  const resource = await workspaceResources(accessToken, workspaceId, collaborationApprovalEnabled() ? 'owner' : 'contributor')
  if (!file.type.startsWith('image/')) throw new AppError(415, 'PHOTO_TYPE_INVALID', 'Only image files can be uploaded.')
  if (file.size > 10 * 1024 * 1024) throw new AppError(413, 'PHOTO_TOO_LARGE', 'Photo must be 10 MB or smaller.')
  let parentId = resource.photos.id
  if (profileId) {
    const profileFolder = await findChildByProperty(accessToken, resource.photos.id, 'photo-profile-folder', 'profileId', profileId)
      ?? await createFolder(accessToken, profileId, 'photo-profile-folder', resource.photos.id, { profileId })
    parentId = profileFolder.id
    if (personId) {
      const personFolder = await findChildByProperty(accessToken, profileFolder.id, 'photo-person-folder', 'personId', personId)
        ?? await createFolder(accessToken, personId, 'photo-person-folder', profileFolder.id, { profileId, personId })
      parentId = personFolder.id
    }
  }
  const form = new FormData()
  const createdAt = new Date().toISOString()
  form.append('metadata', new Blob([JSON.stringify({ name: `${Date.now()}-${filename}`, parents: [parentId], appProperties: driveProps('person-photo', { workspaceId, ...(profileId ? { profileId } : {}), ...(personId ? { personId } : {}), ...(uploadedBy ? { uploadedBy } : {}), createdAt }) })], { type: 'application/json' }))
  form.append('file', file, filename)
  const response = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form })
  if (!response.ok) throw new AppError(502, 'PHOTO_UPLOAD_FAILED', 'Photo could not be uploaded to Google Drive.')
  const result = await response.json() as { id?: string }
  if (!result.id) throw new AppError(502, 'PHOTO_UPLOAD_FAILED', 'Google Drive did not return a photo ID.')
  return result.id
}

export async function cleanupOrphanPhotos(accessToken: string, workspaceId: string, data?: FamilyData, ttlDays = Number(process.env.FAMNESIA_ORPHAN_PHOTO_TTL_DAYS ?? 7)): Promise<number> {
  await workspaceResources(accessToken, workspaceId, collaborationApprovalEnabled() ? 'owner' : 'contributor')
  const snapshot = data ?? (await loadFamily(accessToken, workspaceId)).snapshot.data
  const referenced = new Set(snapshot.media.map((item) => item.driveFileId))
  const cutoff = Date.now() - Math.max(1, ttlDays) * 24 * 60 * 60 * 1000
  const candidates = await listFiles(accessToken, `${propertyQuery('person-photo')} and appProperties has { key='workspaceId' and value='${escapeQuery(workspaceId)}' }`, 'createdTime')
  const orphanIds = candidates.filter((file) => !referenced.has(file.id) && Date.parse(file.createdTime ?? file.appProperties?.createdAt ?? '') < cutoff).map((file) => file.id)
  await Promise.allSettled(orphanIds.map((fileId) => googleResponse(accessToken, `/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' })))
  return orphanIds.length
}

async function isInsidePhotoFolder(accessToken: string, file: DriveFile, photosFolderId: string, depth = 0): Promise<boolean> {
  if (file.parents?.includes(photosFolderId)) return true
  if (depth >= 3 || !file.parents?.length) return false
  for (const parentId of file.parents) {
    const parent = await getFile(accessToken, parentId)
    if (parent.mimeType !== FOLDER_MIME || parent.appProperties?.app !== DRIVE_APP) continue
    if (await isInsidePhotoFolder(accessToken, parent, photosFolderId, depth + 1)) return true
  }
  return false
}

export async function readPhoto(accessToken: string, workspaceId: string, fileId: string): Promise<Response> {
  const resource = await workspaceResources(accessToken, workspaceId)
  const file = await getFile(accessToken, fileId)
  if (file.appProperties?.resourceType !== 'person-photo' || !await isInsidePhotoFolder(accessToken, file, resource.photos.id)) throw new AppError(404, 'PHOTO_NOT_FOUND', 'Photo not found in this workspace.')
  return googleResponse(accessToken, `/files/${encodeURIComponent(fileId)}?alt=media`)
}

export async function deletePhoto(accessToken: string, workspaceId: string, fileId: string): Promise<void> {
  const resource = await workspaceResources(accessToken, workspaceId, collaborationApprovalEnabled() ? 'owner' : 'contributor')
  const file = await getFile(accessToken, fileId)
  if (file.appProperties?.resourceType !== 'person-photo' || !await isInsidePhotoFolder(accessToken, file, resource.photos.id)) throw new AppError(404, 'PHOTO_NOT_FOUND', 'Photo not found in this workspace.')
  await googleResponse(accessToken, `/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' })
}

interface DrivePermission { id: string; emailAddress?: string; displayName?: string; photoLink?: string; role: string; type: string; permissionDetails?: { inherited?: boolean }[] }
function memberRole(permission: DrivePermission): WorkspaceRole { return permission.role === 'owner' ? 'owner' : permission.role === 'writer' ? 'contributor' : 'viewer' }

export async function listMembers(accessToken: string, workspaceId: string): Promise<WorkspaceMember[]> {
  await workspaceResources(accessToken, workspaceId, 'owner')
  const fields = 'permissions(id,emailAddress,displayName,photoLink,role,type,permissionDetails(inherited))'
  const result = await googleJson<{ permissions?: DrivePermission[] }>(accessToken, `/files/${encodeURIComponent(workspaceId)}/permissions?fields=${encodeURIComponent(fields)}&pageSize=100`)
  return (result.permissions ?? []).filter((item) => item.type === 'user').map((item) => ({ id: item.id, email: item.emailAddress, name: item.displayName, photoUrl: item.photoLink, role: memberRole(item), inherited: Boolean(item.permissionDetails?.some((detail) => detail.inherited)) }))
}

export async function addMember(accessToken: string, workspaceId: string, email: string, role: Exclude<WorkspaceRole, 'owner'>): Promise<void> {
  await workspaceResources(accessToken, workspaceId, 'owner')
  await googleJson(accessToken, `/files/${encodeURIComponent(workspaceId)}/permissions?sendNotificationEmail=true&fields=id`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'user', role: role === 'contributor' && !collaborationApprovalEnabled() ? 'writer' : 'reader', emailAddress: email }),
  })
}

export async function updateMember(accessToken: string, workspaceId: string, permissionId: string, role: Exclude<WorkspaceRole, 'owner'>): Promise<void> {
  await workspaceResources(accessToken, workspaceId, 'owner')
  await googleJson(accessToken, `/files/${encodeURIComponent(workspaceId)}/permissions/${encodeURIComponent(permissionId)}?fields=id`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: role === 'contributor' && !collaborationApprovalEnabled() ? 'writer' : 'reader' }),
  })
}

export async function removeMember(accessToken: string, workspaceId: string, permissionId: string): Promise<void> {
  await workspaceResources(accessToken, workspaceId, 'owner')
  await googleResponse(accessToken, `/files/${encodeURIComponent(workspaceId)}/permissions/${encodeURIComponent(permissionId)}`, { method: 'DELETE' })
}
