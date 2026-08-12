import { createEmptyFamilyData, CURRENT_SCHEMA_VERSION, requireValidFamilyData } from '../../src/schema/familyDataSchema.js'
import { serializeFamilyData } from '../../src/import/exportFamilyData.js'
import type { FamilyBackup, FamilyData } from '../../src/types/family.js'
import { AppError } from './http.js'
import type { WorkspaceAccess, WorkspaceRole } from './types.js'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const APP = 'family-tree'
const FILE_FIELDS = 'id,name,mimeType,parents,appProperties,createdTime,modifiedTime,version,webViewLink,ownedByMe,capabilities(canEdit,canAddChildren,canShare)'

interface DriveFile {
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
  capabilities?: { canEdit?: boolean; canAddChildren?: boolean; canShare?: boolean }
}

export interface WorkspaceResources {
  root: DriveFile
  familyData: DriveFile
  backups: DriveFile
  photos: DriveFile
  access: WorkspaceAccess
}

export interface FamilyRevision { modifiedTime?: string; version?: string }
export interface FamilySnapshot { data: FamilyData; revision: FamilyRevision }
export interface WorkspaceMember { id: string; email?: string; name?: string; photoUrl?: string; role: WorkspaceRole; inherited: boolean }

async function googleResponse(accessToken: string, path: string, init?: RequestInit): Promise<Response> {
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

async function googleJson<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await googleResponse(accessToken, path, init)
  if (response.status === 204) return undefined as T
  return await response.json() as T
}

function escapeQuery(value: string): string { return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") }
function propertyQuery(type: string): string {
  return `trashed = false and appProperties has { key='app' and value='${APP}' } and appProperties has { key='resourceType' and value='${type}' }`
}
function props(resourceType: string, extra: Record<string, string> = {}) { return { app: APP, resourceType, ...extra } }

async function listFiles(accessToken: string, query: string, orderBy = 'modifiedTime desc'): Promise<DriveFile[]> {
  const params = new URLSearchParams({ q: query, spaces: 'drive', orderBy, pageSize: '1000', fields: `files(${FILE_FIELDS})` })
  const result = await googleJson<{ files?: DriveFile[] }>(accessToken, `/files?${params}`)
  return result.files ?? []
}

async function getFile(accessToken: string, fileId: string): Promise<DriveFile> {
  return googleJson(accessToken, `/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(FILE_FIELDS)}`)
}

async function createFolder(accessToken: string, name: string, resourceType: string, parentId?: string): Promise<DriveFile> {
  return googleJson(accessToken, `/files?fields=${encodeURIComponent(FILE_FIELDS)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, appProperties: props(resourceType), parents: parentId ? [parentId] : undefined }),
  })
}

async function createJsonFile(accessToken: string, name: string, parentId: string, resourceType: string, content: string, extra: Record<string, string> = {}): Promise<DriveFile> {
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify({ name, parents: [parentId], mimeType: 'application/json', appProperties: props(resourceType, extra) })], { type: 'application/json' }))
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

async function findChild(accessToken: string, parentId: string, type: string): Promise<DriveFile | undefined> {
  return (await listFiles(accessToken, `${propertyQuery(type)} and '${escapeQuery(parentId)}' in parents`))[0]
}

async function ensureOwnerWorkspace(accessToken: string): Promise<DriveFile> {
  const roots = await listFiles(accessToken, propertyQuery('workspace-root'))
  const owned = roots.find((file) => file.ownedByMe)
  if (owned) return owned
  return createFolder(accessToken, 'Famnesia', 'workspace-root')
}

async function ensureResources(accessToken: string, root: DriveFile): Promise<WorkspaceResources> {
  const access = accessOf(root)
  let [familyData, backups, photos] = await Promise.all([
    findChild(accessToken, root.id, 'family-data'), findChild(accessToken, root.id, 'backups'), findChild(accessToken, root.id, 'photos'),
  ])
  if ((!familyData || !backups || !photos) && access.role !== 'owner') {
    throw new AppError(409, 'WORKSPACE_INCOMPLETE', 'This shared workspace is incomplete. Ask its owner to open it once.')
  }
  backups ??= await createFolder(accessToken, 'backups', 'backups', root.id)
  photos ??= await createFolder(accessToken, 'photos', 'photos', root.id)
  familyData ??= await createJsonFile(accessToken, 'family.json', root.id, 'family-data', `${JSON.stringify(createEmptyFamilyData(), null, 2)}\n`, { schemaVersion: String(CURRENT_SCHEMA_VERSION) })
  return { root, familyData, backups, photos, access }
}

function accessOf(root: DriveFile): WorkspaceAccess {
  const role: WorkspaceRole = root.ownedByMe ? 'owner' : root.capabilities?.canEdit ? 'editor' : 'viewer'
  return {
    id: root.id, name: root.name, role, canRead: true,
    canEdit: role !== 'viewer', canUpload: role !== 'viewer', canManageMembers: role === 'owner',
    ownedByMe: Boolean(root.ownedByMe), webViewLink: root.webViewLink,
  }
}

export async function listWorkspaces(accessToken: string): Promise<WorkspaceAccess[]> {
  let roots = await listFiles(accessToken, propertyQuery('workspace-root'), 'name')
  if (!roots.some((root) => root.ownedByMe)) {
    await ensureResources(accessToken, await ensureOwnerWorkspace(accessToken))
    roots = await listFiles(accessToken, propertyQuery('workspace-root'), 'name')
  }
  return roots.map(accessOf).sort((a, b) => Number(b.ownedByMe) - Number(a.ownedByMe) || a.name.localeCompare(b.name))
}

export async function workspaceResources(accessToken: string, workspaceId: string, minimum: WorkspaceRole = 'viewer'): Promise<WorkspaceResources> {
  const root = await getFile(accessToken, workspaceId)
  if (root.appProperties?.app !== APP || root.appProperties?.resourceType !== 'workspace-root' || root.mimeType !== FOLDER_MIME) {
    throw new AppError(404, 'WORKSPACE_NOT_FOUND', 'Famnesia workspace not found.')
  }
  const result = await ensureResources(accessToken, root)
  const level = { viewer: 0, editor: 1, owner: 2 }
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

async function downloadText(accessToken: string, fileId: string): Promise<string> {
  return (await googleResponse(accessToken, `/files/${encodeURIComponent(fileId)}?alt=media`)).text()
}

export async function loadFamily(accessToken: string, workspaceId: string): Promise<{ snapshot: FamilySnapshot; workspace: WorkspaceAccess & { rootFolderUrl: string } }> {
  const resource = await workspaceResources(accessToken, workspaceId)
  const text = await downloadText(accessToken, resource.familyData.id)
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new AppError(422, 'FAMILY_JSON_INVALID', 'family.json is not valid JSON.') }
  return { snapshot: { data: requireValidFamilyData(value), revision: revision(resource.familyData) }, workspace: { ...resource.access, rootFolderUrl: resource.root.webViewLink ?? `https://drive.google.com/drive/folders/${resource.root.id}` } }
}

export async function saveFamily(accessToken: string, workspaceId: string, data: FamilyData, expected: FamilyRevision | undefined, mode: 'save' | 'replace' | 'restore' = 'save'): Promise<FamilySnapshot> {
  const minimum: WorkspaceRole = mode === 'save' ? 'editor' : 'owner'
  const resource = await workspaceResources(accessToken, workspaceId, minimum)
  const current = await getFile(accessToken, resource.familyData.id)
  if (!sameRevision(expected, current)) throw new AppError(409, 'FAMILY_DATA_CONFLICT', 'Family data changed in another session. Reload before saving.', { currentRevision: revision(current) })
  if (mode !== 'save') {
    const currentContent = await downloadText(accessToken, resource.familyData.id)
    await createJsonFile(accessToken, backupName(), resource.backups.id, 'family-backup', currentContent, {
      schemaVersion: String(CURRENT_SCHEMA_VERSION), reason: mode === 'restore' ? 'before-restore' : 'before-import',
    })
  }
  const updatedAt = new Date().toISOString()
  const next = requireValidFamilyData({ ...requireValidFamilyData(data), updatedAt })
  const response = await fetch(`${UPLOAD_API}/files/${encodeURIComponent(resource.familyData.id)}?uploadType=media&fields=${encodeURIComponent(FILE_FIELDS)}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' }, body: serializeFamilyData(next, updatedAt),
  })
  if (!response.ok) throw new AppError(response.status === 403 ? 403 : 502, response.status === 403 ? 'DRIVE_ACCESS_DENIED' : 'GOOGLE_DRIVE_FAILED', 'family.json could not be saved.')
  return { data: next, revision: revision(await response.json() as DriveFile) }
}

function backupName(): string { return `famnesia_${new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').replace(/\.\d{3}Z$/, '')}.json` }

export async function createBackup(accessToken: string, workspaceId: string, data: FamilyData, reason = 'manual'): Promise<FamilyBackup> {
  const resource = await workspaceResources(accessToken, workspaceId, 'editor')
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

export async function uploadPhoto(accessToken: string, workspaceId: string, file: Blob, filename: string): Promise<string> {
  const resource = await workspaceResources(accessToken, workspaceId, 'editor')
  if (!file.type.startsWith('image/')) throw new AppError(415, 'PHOTO_TYPE_INVALID', 'Only image files can be uploaded.')
  if (file.size > 10 * 1024 * 1024) throw new AppError(413, 'PHOTO_TOO_LARGE', 'Photo must be 10 MB or smaller.')
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify({ name: `${Date.now()}-${filename}`, parents: [resource.photos.id], appProperties: props('person-photo') })], { type: 'application/json' }))
  form.append('file', file, filename)
  const response = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form })
  if (!response.ok) throw new AppError(502, 'PHOTO_UPLOAD_FAILED', 'Photo could not be uploaded to Google Drive.')
  const result = await response.json() as { id?: string }
  if (!result.id) throw new AppError(502, 'PHOTO_UPLOAD_FAILED', 'Google Drive did not return a photo ID.')
  return result.id
}

export async function readPhoto(accessToken: string, workspaceId: string, fileId: string): Promise<Response> {
  const resource = await workspaceResources(accessToken, workspaceId)
  const file = await getFile(accessToken, fileId)
  if (!file.parents?.includes(resource.photos.id) || file.appProperties?.resourceType !== 'person-photo') throw new AppError(404, 'PHOTO_NOT_FOUND', 'Photo not found in this workspace.')
  return googleResponse(accessToken, `/files/${encodeURIComponent(fileId)}?alt=media`)
}

export async function deletePhoto(accessToken: string, workspaceId: string, fileId: string): Promise<void> {
  const resource = await workspaceResources(accessToken, workspaceId, 'editor')
  const file = await getFile(accessToken, fileId)
  if (!file.parents?.includes(resource.photos.id) || file.appProperties?.resourceType !== 'person-photo') throw new AppError(404, 'PHOTO_NOT_FOUND', 'Photo not found in this workspace.')
  await googleResponse(accessToken, `/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' })
}

interface DrivePermission { id: string; emailAddress?: string; displayName?: string; photoLink?: string; role: string; type: string; permissionDetails?: { inherited?: boolean }[] }
function memberRole(permission: DrivePermission): WorkspaceRole { return permission.role === 'owner' ? 'owner' : permission.role === 'writer' ? 'editor' : 'viewer' }

export async function listMembers(accessToken: string, workspaceId: string): Promise<WorkspaceMember[]> {
  await workspaceResources(accessToken, workspaceId, 'owner')
  const fields = 'permissions(id,emailAddress,displayName,photoLink,role,type,permissionDetails(inherited))'
  const result = await googleJson<{ permissions?: DrivePermission[] }>(accessToken, `/files/${encodeURIComponent(workspaceId)}/permissions?fields=${encodeURIComponent(fields)}&pageSize=100`)
  return (result.permissions ?? []).filter((item) => item.type === 'user').map((item) => ({ id: item.id, email: item.emailAddress, name: item.displayName, photoUrl: item.photoLink, role: memberRole(item), inherited: Boolean(item.permissionDetails?.some((detail) => detail.inherited)) }))
}

export async function addMember(accessToken: string, workspaceId: string, email: string, role: Exclude<WorkspaceRole, 'owner'>): Promise<void> {
  await workspaceResources(accessToken, workspaceId, 'owner')
  await googleJson(accessToken, `/files/${encodeURIComponent(workspaceId)}/permissions?sendNotificationEmail=true&fields=id`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'user', role: role === 'editor' ? 'writer' : 'reader', emailAddress: email }),
  })
}

export async function updateMember(accessToken: string, workspaceId: string, permissionId: string, role: Exclude<WorkspaceRole, 'owner'>): Promise<void> {
  await workspaceResources(accessToken, workspaceId, 'owner')
  await googleJson(accessToken, `/files/${encodeURIComponent(workspaceId)}/permissions/${encodeURIComponent(permissionId)}?fields=id`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: role === 'editor' ? 'writer' : 'reader' }),
  })
}

export async function removeMember(accessToken: string, workspaceId: string, permissionId: string): Promise<void> {
  await workspaceResources(accessToken, workspaceId, 'owner')
  await googleResponse(accessToken, `/files/${encodeURIComponent(workspaceId)}/permissions/${encodeURIComponent(permissionId)}`, { method: 'DELETE' })
}
