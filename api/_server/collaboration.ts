import { createHash } from 'node:crypto'
import { compactFamilyOperations, mergeFamilyOperations, operationReviewClosure } from '../../src/draft/familyOperations.js'
import type { WorkspaceInfo } from '../../src/types/family.js'
import type { DraftAssetIntegrity, DraftReviewRequest, DraftReviewResult, ReviewDraft, ReviewDraftSummary, SubmittedFamilyDraft, SubmitDraftResult } from '../../src/types/collaboration.js'
import type { FamilyOperation } from '../../src/types/familyOperations.js'
import { collaborationApprovalEnabled } from './env.js'
import { collaboration, type CollaborationMemberRecord } from './collaborationRepository.js'
import { deriveCollaborationAccess } from './collaborationAccess.js'
import { assetsForOperations, draftAssetIds, draftPayloadHash, draftReviewRequestProblem } from './collaborationIntegrity.js'
import { AppError } from './http.js'
import type { SafeUser, WorkspaceAccess } from './types.js'
import {
  FILE_FIELDS, UPLOAD_API, appendActivity, commitFamily, createBackup, createFolder, createJsonFile,
  downloadText, driveProps, findChild, findChildByProperty, getFile, getFileVersion, googleJson, googleResponse,
  loadFamily, workspaceResources,
} from './drive.js'

const DRAFT_SCHEMA_VERSION = 1 as const
const DRAFT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

interface DrivePermission {
  id: string
  emailAddress?: string
  displayName?: string
  photoLink?: string
  role: string
  type: string
  permissionDetails?: { inherited?: boolean }[]
}

function requireEnabled(): void {
  if (!collaborationApprovalEnabled()) throw new AppError(404, 'COLLAB_APPROVAL_DISABLED', 'Draft approval is not enabled for this workspace.')
}

function normalizeEmail(value: string): string { return value.trim().toLowerCase() }
function memberKey(email: string): string { return createHash('sha256').update(normalizeEmail(email)).digest('hex').slice(0, 20) }
function stableHash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
function terminal(status: ReviewDraftSummary['status']): boolean { return status === 'approved' || status === 'rejected' || status === 'invalid' }

async function writeJson(accessToken: string, fileId: string, value: unknown, etag?: string): Promise<void> {
  const response = await fetch(`${UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=${encodeURIComponent(FILE_FIELDS)}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8', ...(etag ? { 'If-Match': etag } : {}) },
    body: `${JSON.stringify(value, null, 2)}\n`,
  })
  if (response.status === 412) throw new AppError(409, 'DRAFT_REVISION_CHANGED', 'Draft changed while this request was being processed. Reload it before continuing.')
  if (!response.ok) throw new AppError(response.status === 403 ? 403 : 502, response.status === 403 ? 'DRIVE_ACCESS_DENIED' : 'DRAFT_WRITE_FAILED', 'Draft could not be saved in Google Drive.')
}

async function readDraftPayload(accessToken: string, summary: ReviewDraftSummary): Promise<SubmittedFamilyDraft> {
  let payload: SubmittedFamilyDraft
  try { payload = JSON.parse(await downloadText(accessToken, summary.fileId)) as SubmittedFamilyDraft }
  catch { throw new AppError(422, 'DRAFT_INVALID', 'Draft payload is not valid JSON.') }
  if (payload.schemaVersion !== DRAFT_SCHEMA_VERSION || payload.id !== summary.id || payload.workspaceId !== summary.workspaceId || !Array.isArray(payload.operations) || !Array.isArray(payload.assets)) {
    throw new AppError(422, 'DRAFT_INVALID', 'Draft payload does not match its workflow record.')
  }
  if (draftPayloadHash(payload) !== summary.payloadHash) throw new AppError(409, 'DRAFT_TAMPERED', 'Draft content changed outside Famnesia and cannot be reviewed safely.')
  for (const asset of payload.assets) {
    const current = await getFile(accessToken, asset.fileId).catch(() => undefined)
    if (!current || current.appProperties?.resourceType !== 'draft-photo' || current.appProperties.workspaceId !== summary.workspaceId
      || (asset.version && current.version !== asset.version) || (asset.md5Checksum && current.md5Checksum !== asset.md5Checksum)
      || (asset.size && current.size !== asset.size)) {
      throw new AppError(409, 'DRAFT_TAMPERED', 'A draft photo changed after submission and must be submitted again.')
    }
  }
  return payload
}

async function resolveDraftAssets(accessToken: string, workspaceId: string, assetsFolderId: string, operations: FamilyOperation[]): Promise<DraftAssetIntegrity[]> {
  const assets: DraftAssetIntegrity[] = []
  for (const fileId of draftAssetIds(operations)) {
    const file = await getFile(accessToken, fileId)
    if (file.appProperties?.resourceType !== 'draft-photo' || file.appProperties.workspaceId !== workspaceId || !file.parents?.includes(assetsFolderId)) {
      throw new AppError(422, 'DRAFT_PHOTO_INVALID', 'A draft photo does not belong to this contributor draft.')
    }
    assets.push({ fileId, version: file.version, md5Checksum: file.md5Checksum, size: file.size })
  }
  return assets
}

function draftView(summary: ReviewDraftSummary, payload: SubmittedFamilyDraft): ReviewDraft {
  return { ...summary, operations: compactFamilyOperations(payload.operations) }
}

async function permissions(accessToken: string, fileId: string): Promise<DrivePermission[]> {
  const fields = 'permissions(id,emailAddress,displayName,photoLink,role,type,permissionDetails(inherited))'
  return (await googleJson<{ permissions?: DrivePermission[] }>(accessToken, `/files/${encodeURIComponent(fileId)}/permissions?fields=${encodeURIComponent(fields)}&pageSize=100`)).permissions ?? []
}

async function ensureDraftsRoot(accessToken: string, workspaceId: string): Promise<string> {
  const resource = await workspaceResources(accessToken, workspaceId, 'owner')
  const folder = await findChild(accessToken, resource.root.id, 'collaboration-drafts')
    ?? await createFolder(accessToken, 'drafts', 'collaboration-drafts', resource.root.id, { workspaceId })
  return folder.id
}

async function createDirectPermission(accessToken: string, fileId: string, email: string, role: 'writer' | 'reader', notify = false): Promise<string> {
  const result = await googleJson<{ id?: string }>(accessToken, `/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=${notify ? 'true' : 'false'}&fields=id`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'user', role, emailAddress: normalizeEmail(email) }),
  })
  if (!result.id) throw new AppError(502, 'DRIVE_PERMISSION_FAILED', 'Google Drive did not return a permission ID.')
  return result.id
}

async function ensureContributorResources(accessToken: string, workspaceId: string, email: string, rootPermissionId: string): Promise<CollaborationMemberRecord> {
  const repository = collaboration()
  const normalized = normalizeEmail(email)
  const existing = await repository.getMember(workspaceId, normalized)
  const draftsRootId = await ensureDraftsRoot(accessToken, workspaceId)
  const key = memberKey(normalized)
  const folder = existing?.draftFolderId ? await getFile(accessToken, existing.draftFolderId) : await findChildByProperty(accessToken, draftsRootId, 'member-draft-folder', 'memberKey', key)
    ?? await createFolder(accessToken, key, 'member-draft-folder', draftsRootId, { workspaceId, memberKey: key })
  if (!folder.inheritedPermissionsDisabled) {
    if (folder.capabilities?.canDisableInheritedPermissions === false) throw new AppError(403, 'DRAFT_LIMITED_ACCESS_UNAVAILABLE', 'Google Drive does not allow this account to make the contributor Draft folder private.')
    const limited = await googleJson<typeof folder>(accessToken, `/files/${encodeURIComponent(folder.id)}?fields=${encodeURIComponent(FILE_FIELDS)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inheritedPermissionsDisabled: true }),
    })
    if (!limited.inheritedPermissionsDisabled) throw new AppError(502, 'DRAFT_LIMITED_ACCESS_FAILED', 'Google Drive did not confirm Limited Access on the contributor Draft folder.')
  }
  const direct = (await permissions(accessToken, folder.id)).find((item) => normalizeEmail(item.emailAddress ?? '') === normalized && item.role === 'writer' && !item.permissionDetails?.some((detail) => detail.inherited))
  const draftPermissionId = direct?.id ?? await createDirectPermission(accessToken, folder.id, normalized, 'writer')
  const draftFile = existing?.draftFileId ? await getFile(accessToken, existing.draftFileId) : await findChild(accessToken, folder.id, 'active-family-draft')
    ?? await createJsonFile(accessToken, 'active-draft.json', folder.id, 'active-family-draft', '{}\n', { workspaceId, memberKey: key })
  const assets = existing?.assetsFolderId ? await getFile(accessToken, existing.assetsFolderId) : await findChild(accessToken, folder.id, 'draft-assets')
    ?? await createFolder(accessToken, 'assets', 'draft-assets', folder.id, { workspaceId, memberKey: key })
  const member: CollaborationMemberRecord = {
    workspaceId, email: normalized, rootPermissionId, draftFolderId: folder.id, draftPermissionId,
    draftFileId: draftFile.id, assetsFolderId: assets.id, role: 'contributor', migratedAt: new Date().toISOString(),
  }
  await repository.saveMember(member)
  return member
}

async function updateRootPermission(accessToken: string, workspaceId: string, permissionId: string, role: 'writer' | 'reader'): Promise<void> {
  await googleJson(accessToken, `/files/${encodeURIComponent(workspaceId)}/permissions/${encodeURIComponent(permissionId)}?fields=id`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }),
  })
}

export async function migrateLegacyEditors(accessToken: string, workspaceId: string): Promise<void> {
  if (!collaborationApprovalEnabled()) return
  await workspaceResources(accessToken, workspaceId, 'owner')
  const repository = collaboration()
  const rootPermissions = await permissions(accessToken, workspaceId)
  for (const permission of rootPermissions.filter((item) => item.type === 'user' && item.role === 'writer' && item.emailAddress)) {
    try {
      const member = await ensureContributorResources(accessToken, workspaceId, permission.emailAddress!, permission.id)
      await updateRootPermission(accessToken, workspaceId, permission.id, 'reader')
      await repository.saveMember({ ...member, migrationError: undefined, migratedAt: new Date().toISOString() })
    } catch (error) {
      await repository.saveMember({ workspaceId, email: permission.emailAddress!, rootPermissionId: permission.id, role: 'contributor', migrationError: error instanceof Error ? error.message : String(error) })
    }
  }
}

export async function collaborationWorkspaceAccess(accessToken: string, access: WorkspaceAccess, user: SafeUser): Promise<WorkspaceAccess> {
  if (!collaborationApprovalEnabled()) return access
  if (access.ownedByMe) {
    await migrateLegacyEditors(accessToken, access.id)
    return deriveCollaborationAccess(access, undefined, false)
  }
  const member = await collaboration().getMember(access.id, user.email)
  let draftFolderCanEdit = false
  if (member?.role === 'contributor' && member.draftFolderId) {
    const folder = await getFile(accessToken, member.draftFolderId).catch(() => undefined)
    draftFolderCanEdit = Boolean(folder?.capabilities?.canEdit)
  }
  return deriveCollaborationAccess(access, member?.role, draftFolderCanEdit, Boolean(member?.migrationError))
}

export async function listCollaborationMembers(accessToken: string, workspaceId: string) {
  requireEnabled()
  await migrateLegacyEditors(accessToken, workspaceId)
  const repository = collaboration()
  return Promise.all((await permissions(accessToken, workspaceId)).filter((item) => item.type === 'user').map(async (permission) => {
    const record = permission.emailAddress ? await repository.getMember(workspaceId, permission.emailAddress) : null
    return {
      id: permission.id, email: permission.emailAddress, name: permission.displayName, photoUrl: permission.photoLink,
      role: permission.role === 'owner' ? 'owner' as const : record?.role === 'contributor' ? 'contributor' as const : 'viewer' as const,
      inherited: Boolean(permission.permissionDetails?.some((detail) => detail.inherited)), migrationRequired: Boolean(record?.migrationError || permission.role === 'writer'),
    }
  }))
}

export async function addCollaborationMember(accessToken: string, workspaceId: string, email: string, role: 'contributor' | 'viewer'): Promise<void> {
  requireEnabled(); await workspaceResources(accessToken, workspaceId, 'owner')
  const normalized = normalizeEmail(email)
  const existing = (await permissions(accessToken, workspaceId)).find((item) => normalizeEmail(item.emailAddress ?? '') === normalized)
  const permissionId = existing?.id ?? await createDirectPermission(accessToken, workspaceId, normalized, 'reader', true)
  if (existing && existing.role !== 'reader') await updateRootPermission(accessToken, workspaceId, permissionId, 'reader')
  if (role === 'contributor') await ensureContributorResources(accessToken, workspaceId, normalized, permissionId)
  else await collaboration().saveMember({ workspaceId, email: normalized, rootPermissionId: permissionId, role: 'viewer', migratedAt: new Date().toISOString() })
  if (await collaboration().getMirrorGeneration(workspaceId) === 0) await collaboration().bumpMirrorGeneration(workspaceId)
}

export async function updateCollaborationMember(accessToken: string, workspaceId: string, permissionId: string, role: 'contributor' | 'viewer'): Promise<void> {
  requireEnabled(); await workspaceResources(accessToken, workspaceId, 'owner')
  const permission = (await permissions(accessToken, workspaceId)).find((item) => item.id === permissionId)
  if (!permission?.emailAddress || permission.role === 'owner') throw new AppError(404, 'MEMBER_NOT_FOUND', 'Workspace member was not found.')
  await updateRootPermission(accessToken, workspaceId, permissionId, 'reader')
  if (role === 'contributor') await ensureContributorResources(accessToken, workspaceId, permission.emailAddress, permissionId)
  else {
    const existing = await collaboration().getMember(workspaceId, permission.emailAddress)
    if (existing?.draftPermissionId && existing.draftFolderId) await googleResponse(accessToken, `/files/${encodeURIComponent(existing.draftFolderId)}/permissions/${encodeURIComponent(existing.draftPermissionId)}`, { method: 'DELETE' }).catch(() => undefined)
    await collaboration().saveMember({ ...(existing ?? {}), workspaceId, email: permission.emailAddress, rootPermissionId: permissionId, draftPermissionId: undefined, role: 'viewer', migratedAt: new Date().toISOString() })
  }
}

export async function removeCollaborationMember(accessToken: string, workspaceId: string, permissionId: string): Promise<void> {
  requireEnabled(); await workspaceResources(accessToken, workspaceId, 'owner')
  const permission = (await permissions(accessToken, workspaceId)).find((item) => item.id === permissionId)
  if (!permission?.emailAddress || permission.role === 'owner') throw new AppError(404, 'MEMBER_NOT_FOUND', 'Workspace member was not found.')
  const existing = await collaboration().getMember(workspaceId, permission.emailAddress)
  if (existing?.draftPermissionId && existing.draftFolderId) await googleResponse(accessToken, `/files/${encodeURIComponent(existing.draftFolderId)}/permissions/${encodeURIComponent(existing.draftPermissionId)}`, { method: 'DELETE' }).catch(() => undefined)
  await googleResponse(accessToken, `/files/${encodeURIComponent(workspaceId)}/permissions/${encodeURIComponent(permissionId)}`, { method: 'DELETE' })
  if (existing) await collaboration().saveMember({ ...existing, rootPermissionId: 'revoked', draftPermissionId: undefined, role: 'viewer', migratedAt: new Date().toISOString() })
  else await collaboration().deleteMember(workspaceId, permission.emailAddress)
}

async function submitFamilyDraftLocked(accessToken: string, workspaceId: string, user: SafeUser, input: { baseRevision?: SubmittedFamilyDraft['baseRevision']; operations: FamilyOperation[]; clientCreatedAt: string }): Promise<SubmitDraftResult> {
  requireEnabled()
  const member = await collaboration().getMember(workspaceId, user.email)
  if (!member || member.role !== 'contributor' || !member.draftFolderId || !member.draftFileId || !member.assetsFolderId) throw new AppError(403, 'APPROVAL_REQUIRED', 'Your contributor access is not ready. Ask the owner to retry member migration.')
  const folder = await getFile(accessToken, member.draftFolderId)
  if (!folder.capabilities?.canEdit) throw new AppError(403, 'APPROVAL_REQUIRED', 'You do not have permission to submit a draft for this workspace.')
  const operations = compactFamilyOperations(input.operations)
  if (!operations.length) throw new AppError(422, 'DRAFT_EMPTY', 'Draft must contain at least one change.')
  const assets = await resolveDraftAssets(accessToken, workspaceId, member.assetsFolderId, operations)
  const repository = collaboration()
  const existing = await repository.getDraftForAuthor(workspaceId, user.id)
  const now = new Date().toISOString()
  const payload: SubmittedFamilyDraft = {
    schemaVersion: DRAFT_SCHEMA_VERSION, id: existing?.id ?? `draft_${crypto.randomUUID()}`, workspaceId,
    author: { id: user.id, email: normalizeEmail(user.email), name: user.name }, baseRevision: input.baseRevision,
    revision: (existing?.revision ?? 0) + 1, operations, assets, clientCreatedAt: input.clientCreatedAt, submittedAt: now,
  }
  const version = await getFileVersion(accessToken, member.draftFileId)
  await writeJson(accessToken, member.draftFileId, payload, version.etag)
  const summary: ReviewDraftSummary = {
    id: payload.id, workspaceId, author: payload.author, revision: payload.revision, status: 'pending', operationCount: operations.length,
    submittedAt: existing?.submittedAt ?? now, updatedAt: now, payloadHash: draftPayloadHash(payload), fileId: member.draftFileId,
    cleanupAssetIds: existing?.cleanupAssetIds, baseRevision: input.baseRevision, reviewHistory: existing?.reviewHistory ?? [],
  }
  await repository.saveDraft(summary)
  return { draft: draftView(summary, payload), mirrorGeneration: await repository.getMirrorGeneration(workspaceId) }
}

export async function submitFamilyDraft(accessToken: string, workspaceId: string, user: SafeUser, input: { baseRevision?: SubmittedFamilyDraft['baseRevision']; operations: FamilyOperation[]; clientCreatedAt: string }): Promise<SubmitDraftResult> {
  requireEnabled()
  const repository = collaboration()
  const lockToken = await repository.acquireAuthorWorkflowLock(workspaceId, user.id)
  if (!lockToken) throw new AppError(409, 'DRAFT_REVIEW_IN_PROGRESS', 'The owner is reviewing this Draft. Wait a moment, refresh, and submit the latest revision again.')
  try { return await submitFamilyDraftLocked(accessToken, workspaceId, user, input) }
  finally { await repository.releaseAuthorWorkflowLock(workspaceId, user.id, lockToken) }
}

async function promoteDraftPhotos(accessToken: string, workspaceId: string, operations: FamilyOperation[]): Promise<{ operations: FamilyOperation[]; sourceIds: string[] }> {
  const resource = await workspaceResources(accessToken, workspaceId, 'owner')
  const promoted: FamilyOperation[] = []
  const sourceIds: string[] = []
  for (const operation of operations) {
    if (operation.type !== 'media.attach') { promoted.push(operation); continue }
    const media = structuredClone(operation.value as { driveFileId?: string; profileId?: string; personId?: string })
    if (!media.driveFileId) throw new AppError(422, 'DRAFT_PHOTO_INVALID', 'Draft photo reference is missing.')
    const source = await getFile(accessToken, media.driveFileId)
    if (source.appProperties?.resourceType !== 'draft-photo' || source.appProperties.workspaceId !== workspaceId || !source.capabilities?.canCopy) throw new AppError(422, 'DRAFT_PHOTO_INVALID', 'Draft photo cannot be promoted safely.')
    const copied = await googleJson<{ id?: string }>(accessToken, `/files/${encodeURIComponent(source.id)}/copy?fields=id`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: source.name, parents: [resource.photos.id], appProperties: driveProps('person-photo', { workspaceId, ...(media.profileId ? { profileId: media.profileId } : {}), ...(media.personId ? { personId: media.personId } : {}), createdAt: new Date().toISOString() }) }),
    })
    if (!copied.id) throw new AppError(502, 'DRAFT_PHOTO_PROMOTION_FAILED', 'Google Drive did not return the approved photo ID.')
    sourceIds.push(source.id); media.driveFileId = copied.id; promoted.push({ ...operation, value: media })
  }
  return { operations: promoted, sourceIds }
}

async function detachDraftAssets(accessToken: string, assetsFolderId: string | undefined, fileIds: string[]): Promise<void> {
  if (!assetsFolderId) return
  await Promise.allSettled(fileIds.map((fileId) => googleResponse(accessToken, `/files/${encodeURIComponent(fileId)}?removeParents=${encodeURIComponent(assetsFolderId)}&fields=id`, { method: 'PATCH' })))
}

export async function listReviewDrafts(accessToken: string, workspaceId: string, user: SafeUser): Promise<ReviewDraft[]> {
  requireEnabled()
  const resource = await workspaceResources(accessToken, workspaceId)
  const repository = collaboration()
  if (resource.access.ownedByMe) await cleanupExpiredDrafts(accessToken, workspaceId)
  const summaries = resource.access.ownedByMe ? await repository.listDrafts(workspaceId) : [await repository.getDraftForAuthor(workspaceId, user.id)].filter((item): item is ReviewDraftSummary => Boolean(item))
  const views: ReviewDraft[] = []
  for (const summary of summaries) {
    if (terminal(summary.status)) { views.push({ ...summary, operations: [] }); continue }
    try { views.push(draftView(summary, await readDraftPayload(accessToken, summary))) }
    catch (error) {
      const invalid = { ...summary, status: 'invalid' as const, updatedAt: new Date().toISOString(), terminalAt: new Date().toISOString(), note: error instanceof Error ? error.message : String(error) }
      await repository.saveDraft(invalid); views.push({ ...invalid, operations: [] })
    }
  }
  return views
}

async function reviewFamilyDraftLocked(accessToken: string, workspaceId: string, user: SafeUser, request: DraftReviewRequest): Promise<DraftReviewResult> {
  requireEnabled(); await workspaceResources(accessToken, workspaceId, 'owner')
  const repository = collaboration()
  const summary = await repository.getDraft(workspaceId, request.draftId)
  if (!summary) throw new AppError(404, 'DRAFT_NOT_FOUND', 'Draft was not found.')
  if (terminal(summary.status)) throw new AppError(409, 'DRAFT_ALREADY_REVIEWED', 'Draft has already reached a final decision.')
  if (summary.revision !== request.draftRevision) throw new AppError(409, 'DRAFT_REVISION_CHANGED', 'Draft changed after you opened it. Reload the latest revision.')
  const requestProblem = draftReviewRequestProblem(request)
  if (requestProblem === 'reject_note_required') throw new AppError(422, 'DRAFT_REJECT_NOTE_REQUIRED', 'A reason is required when rejecting changes.')
  if (requestProblem) throw new AppError(422, 'DRAFT_REVIEW_INVALID', 'Draft review request is invalid.')
  const draftFileBefore = await getFileVersion(accessToken, summary.fileId)
  const payload = await readDraftPayload(accessToken, summary)
  const draftFileVerified = await getFileVersion(accessToken, summary.fileId)
  if (draftFileBefore.file.version !== draftFileVerified.file.version) throw new AppError(409, 'DRAFT_REVISION_CHANGED', 'Draft changed while it was being opened. Reload the latest revision.')
  const allIds = payload.operations.map((operation) => operation.id)
  const requestedIds = request.operationIds === undefined ? allIds : [...new Set(request.operationIds)]
  if (requestedIds.some((id) => !allIds.includes(id))) throw new AppError(422, 'DRAFT_OPERATION_INVALID', 'One or more selected changes are not part of this draft.')
  const selectedIds = operationReviewClosure(payload.operations, requestedIds, request.decision)
  const selected = payload.operations.filter((operation) => selectedIds.includes(operation.id))
  const selectedAssetIds = draftAssetIds(selected)
  let remaining = compactFamilyOperations(payload.operations.filter((operation) => !selectedIds.includes(operation.id)))
  const now = new Date().toISOString()
  let snapshot: DraftReviewResult['snapshot']
  let mirrorGeneration = await repository.getMirrorGeneration(workspaceId)
  let detachedPhotoIds: string[] = []
  if (request.decision === 'approve') {
    const latest = await loadFamily(accessToken, workspaceId)
    const draftFileCurrent = await getFileVersion(accessToken, summary.fileId)
    if (draftFileCurrent.file.version !== draftFileVerified.file.version) throw new AppError(409, 'DRAFT_REVISION_CHANGED', 'Draft changed before approval. Reload the latest revision; official data was not changed.')
    await createBackup(accessToken, workspaceId, latest.snapshot.data, 'before-draft-approval')
    const promoted = await promoteDraftPhotos(accessToken, workspaceId, selected)
    detachedPhotoIds = promoted.sourceIds
    const result = await commitFamily(accessToken, workspaceId, {
      commitId: `review_${summary.id}_${summary.revision}_${stableHash(selectedIds).slice(0, 12)}`,
      baseRevision: latest.snapshot.revision, operations: promoted.operations, clientCreatedAt: now,
    }, { email: summary.author.email, name: summary.author.name })
    snapshot = result.snapshot
    const rebased = mergeFamilyOperations(result.snapshot.data, remaining)
    if (rebased.conflicts.length) {
      summary.status = 'needs_changes'
      summary.note = `Có ${rebased.conflicts.length} thay đổi xung đột với dữ liệu chính thức mới nhất. Hãy mở Draft và cập nhật lại trước khi gửi.`
    }
    summary.baseRevision = result.snapshot.revision
  }
  const history = [...summary.reviewHistory, { id: crypto.randomUUID(), reviewerEmail: user.email, reviewerName: user.name, decision: request.decision, operationIds: selectedIds, note: request.note?.trim() || undefined, createdAt: now }]
  const status: ReviewDraftSummary['status'] = remaining.length
    ? (summary.status === 'needs_changes' ? 'needs_changes' : 'partially_reviewed')
    : request.decision === 'approve' ? 'approved' : 'rejected'
  const nextPayload: SubmittedFamilyDraft = { ...payload, revision: payload.revision + 1, operations: remaining, assets: assetsForOperations(payload.assets, remaining), baseRevision: summary.baseRevision, submittedAt: now }
  const nextSummary: ReviewDraftSummary = {
    ...summary, revision: nextPayload.revision, status, operationCount: remaining.length, updatedAt: now,
    terminalAt: terminal(status) ? now : undefined, note: status === 'needs_changes' ? summary.note : request.note?.trim() || summary.note, payloadHash: draftPayloadHash(nextPayload), reviewHistory: history,
    cleanupAssetIds: [...new Set([...(summary.cleanupAssetIds ?? []), ...selectedAssetIds])],
  }
  await writeJson(accessToken, summary.fileId, nextPayload, draftFileVerified.etag)
  await repository.saveDraft(nextSummary)
  const member = await repository.getMember(workspaceId, summary.author.email)
  await detachDraftAssets(accessToken, member?.assetsFolderId, detachedPhotoIds)
  await appendActivity(accessToken, workspaceId, {
    actorEmail: user.email, actorName: user.name, action: request.decision === 'approve' ? 'draft.approved' : 'draft.rejected', entityType: 'draft', entityId: summary.id,
    summary: `${user.name} đã ${request.decision === 'approve' ? 'duyệt' : 'từ chối'} ${selectedIds.length} thay đổi của ${summary.author.name}`,
    metadata: { draftId: summary.id, draftRevision: request.draftRevision, selected: selectedIds.length, automatic: selectedIds.filter((id) => !requestedIds.includes(id)).length, partial: remaining.length > 0 },
  }).catch(() => undefined)
  mirrorGeneration = await repository.bumpMirrorGeneration(workspaceId)
  return { draft: draftView(nextSummary, nextPayload), appliedOperationIds: selectedIds, automaticallyIncludedOperationIds: selectedIds.filter((id) => !requestedIds.includes(id)), mirrorGeneration, snapshot }
}

export async function reviewFamilyDraft(accessToken: string, workspaceId: string, user: SafeUser, request: DraftReviewRequest): Promise<DraftReviewResult> {
  requireEnabled(); await workspaceResources(accessToken, workspaceId, 'owner')
  const repository = collaboration()
  const initial = await repository.getDraft(workspaceId, request.draftId)
  if (!initial) throw new AppError(404, 'DRAFT_NOT_FOUND', 'Draft was not found.')
  const lockToken = await repository.acquireAuthorWorkflowLock(workspaceId, initial.author.id)
  if (!lockToken) throw new AppError(409, 'DRAFT_REVISION_CHANGED', 'Draft is being updated. Reload the latest revision before reviewing it.')
  try { return await reviewFamilyDraftLocked(accessToken, workspaceId, user, request) }
  finally { await repository.releaseAuthorWorkflowLock(workspaceId, initial.author.id, lockToken) }
}

export async function cleanupExpiredDrafts(accessToken: string, workspaceId: string, authorId?: string): Promise<number> {
  if (!collaborationApprovalEnabled()) return 0
  const repository = collaboration()
  const cutoff = Date.now() - DRAFT_RETENTION_MS
  const expired = (await repository.listDrafts(workspaceId)).filter((draft) => (!authorId || draft.author.id === authorId) && terminal(draft.status) && Date.parse(draft.terminalAt ?? draft.updatedAt) < cutoff)
  for (const draft of expired) {
    const lockToken = await repository.acquireAuthorWorkflowLock(workspaceId, draft.author.id)
    if (!lockToken) continue
    try {
      const member = await repository.getMember(workspaceId, draft.author.email)
      await detachDraftAssets(accessToken, member?.assetsFolderId, draft.cleanupAssetIds ?? [])
      const active = await repository.getDraftForAuthor(workspaceId, draft.author.id)
      if (!active || active.fileId !== draft.fileId) await writeJson(accessToken, draft.fileId, {})
      await repository.deleteDraft(workspaceId, draft.id)
    } finally { await repository.releaseAuthorWorkflowLock(workspaceId, draft.author.id, lockToken) }
  }
  return expired.length
}

export async function collaborationStatus(accessToken: string, workspaceId: string, user: SafeUser) {
  if (!collaborationApprovalEnabled()) return { enabled: false, workspaceRole: 'viewer' as const, pendingDraftCount: 0, mirrorGeneration: 0 }
  const loaded = await loadFamily(accessToken, workspaceId)
  const access = await collaborationWorkspaceAccess(accessToken, loaded.workspace, user)
  if (access.role === 'owner') await cleanupExpiredDrafts(accessToken, workspaceId)
  else if (access.role === 'contributor') await cleanupExpiredDrafts(accessToken, workspaceId, user.id)
  const repository = collaboration()
  const drafts = access.role === 'owner' ? await repository.listDrafts(workspaceId) : []
  const ownSummary = access.role === 'contributor'
    ? await repository.getDraftForAuthor(workspaceId, user.id) ?? (await repository.listDrafts(workspaceId)).find((draft) => draft.author.id === user.id) ?? null
    : null
  const mirror = access.role === 'contributor' ? await repository.getMirror(workspaceId, user.id) : null
  let ownDraft: ReviewDraft | undefined
  if (ownSummary && terminal(ownSummary.status)) ownDraft = { ...ownSummary, operations: [] }
  else if (ownSummary) {
    try { ownDraft = draftView(ownSummary, await readDraftPayload(accessToken, ownSummary)) }
    catch (error) {
      const invalid = { ...ownSummary, status: 'invalid' as const, updatedAt: new Date().toISOString(), terminalAt: new Date().toISOString(), note: error instanceof Error ? error.message : String(error) }
      await repository.saveDraft(invalid); ownDraft = { ...invalid, operations: [] }
    }
  }
  return {
    enabled: true, workspaceRole: access.role, pendingDraftCount: drafts.filter((draft) => !terminal(draft.status)).length,
    ownDraft, mirrorGeneration: await repository.getMirrorGeneration(workspaceId), migrationRequired: access.migrationRequired,
    mirror: mirror ? { status: mirror.status, generation: mirror.generation, syncedGeneration: mirror.syncedGeneration, lastSyncedAt: mirror.lastSyncedAt, mirrorFolderUrl: mirror.rootFolderId ? `https://drive.google.com/drive/folders/${mirror.rootFolderId}` : undefined, error: mirror.error } : undefined,
  }
}

export async function markMirrorChanged(workspaceId: string): Promise<number> {
  return collaborationApprovalEnabled() ? collaboration().bumpMirrorGeneration(workspaceId) : 0
}

export async function collaborationWorkspaceInfo(accessToken: string, workspaceId: string, user: SafeUser): Promise<WorkspaceInfo> {
  const loaded = await loadFamily(accessToken, workspaceId)
  return await collaborationWorkspaceAccess(accessToken, loaded.workspace, user) as WorkspaceInfo
}

export async function uploadDraftPhoto(accessToken: string, workspaceId: string, user: SafeUser, file: Blob, filename: string, profileId?: string, personId?: string): Promise<string> {
  requireEnabled()
  const member = await collaboration().getMember(workspaceId, user.email)
  if (!member?.assetsFolderId || member.role !== 'contributor') throw new AppError(403, 'APPROVAL_REQUIRED', 'Your contributor draft folder is not ready.')
  if (!file.type.startsWith('image/')) throw new AppError(415, 'PHOTO_TYPE_INVALID', 'Only image files can be uploaded.')
  if (file.size > 10 * 1024 * 1024) throw new AppError(413, 'PHOTO_TOO_LARGE', 'Photo must be 10 MB or smaller.')
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify({ name: `${Date.now()}-${filename}`, parents: [member.assetsFolderId], appProperties: driveProps('draft-photo', { workspaceId, memberKey: memberKey(user.email), ...(profileId ? { profileId } : {}), ...(personId ? { personId } : {}), createdAt: new Date().toISOString() }) })], { type: 'application/json' }))
  form.append('file', file, filename)
  const response = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form })
  if (!response.ok) throw new AppError(response.status === 403 ? 403 : 502, response.status === 403 ? 'DRIVE_ACCESS_DENIED' : 'PHOTO_UPLOAD_FAILED', 'Draft photo could not be uploaded.')
  const result = await response.json() as { id?: string }
  if (!result.id) throw new AppError(502, 'PHOTO_UPLOAD_FAILED', 'Google Drive did not return a photo ID.')
  return result.id
}

export async function deleteDraftPhoto(accessToken: string, workspaceId: string, user: SafeUser, fileId: string): Promise<void> {
  const member = await collaboration().getMember(workspaceId, user.email)
  if (!member?.assetsFolderId) throw new AppError(403, 'APPROVAL_REQUIRED', 'Your contributor draft folder is not ready.')
  const file = await getFile(accessToken, fileId)
  if (file.appProperties?.resourceType !== 'draft-photo' || file.appProperties.workspaceId !== workspaceId || !file.parents?.includes(member.assetsFolderId)) throw new AppError(404, 'PHOTO_NOT_FOUND', 'Draft photo was not found.')
  await googleResponse(accessToken, `/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' })
}

export async function readDraftPhoto(accessToken: string, workspaceId: string, user: SafeUser, fileId: string): Promise<Response> {
  const file = await getFile(accessToken, fileId)
  const resource = await workspaceResources(accessToken, workspaceId)
  if (file.appProperties?.resourceType !== 'draft-photo' || file.appProperties.workspaceId !== workspaceId) throw new AppError(404, 'PHOTO_NOT_FOUND', 'Draft photo was not found.')
  if (!resource.access.ownedByMe) {
    const member = await collaboration().getMember(workspaceId, user.email)
    if (!member?.assetsFolderId || !file.parents?.includes(member.assetsFolderId)) throw new AppError(404, 'PHOTO_NOT_FOUND', 'Draft photo was not found.')
  }
  return googleResponse(accessToken, `/files/${encodeURIComponent(fileId)}?alt=media`)
}
