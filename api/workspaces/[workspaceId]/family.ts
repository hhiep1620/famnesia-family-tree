import { isFamilyOperation } from '../../../src/draft/familyOperations.js'
import { findDangerousObjectKey } from '../../../src/import/security/contentSanitization.js'
import { IMPORT_LIMITS } from '../../../src/import/security/importLimits.js'
import { validateFamilyData } from '../../../src/schema/familyDataSchema.js'
import type { FamilyData } from '../../../src/types/family.js'
import type { FamilyCommitRequest } from '../../../src/types/familyOperations.js'
import type { DraftReviewRequest } from '../../../src/types/collaboration.js'
import { draftReviewRequestProblem } from '../../_server/collaborationIntegrity.js'
import { requireAuth } from '../../_server/auth.js'
import { appendActivity, commitFamily, listActivity, loadFamily, saveFamily, type FamilyRevision } from '../../_server/drive.js'
import { collaborationStatus, collaborationWorkspaceAccess, collaborationWorkspaceInfo, listReviewDrafts, markMirrorChanged, reviewFamilyDraft, submitFamilyDraft } from '../../_server/collaboration.js'
import { collaborationApprovalEnabled } from '../../_server/env.js'
import { syncDriveMirror } from '../../_server/mirror.js'
import { AppError, assertSameOrigin, json, pathParameter, readJsonLimited, requireMethod, withErrors } from '../../_server/http.js'

interface SaveBody { data: FamilyData; expectedRevision?: FamilyRevision; mode?: 'save' | 'replace' | 'restore' | 'merge' }
const MAX_COMMIT_BYTES = 2 * 1024 * 1024
const MAX_OPERATIONS = 1000

function validCommitId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value)
}

export default { fetch(request: Request) { return withErrors(async () => {
  const operation = new URL(request.url).searchParams.get('operation')
  requireMethod(request, operation ? ['POST'] : ['GET', 'PUT'])
  if (request.method !== 'GET') assertSameOrigin(request)
  const auth = await requireAuth(request)
  const workspaceId = pathParameter(request, 'workspaces')

  if (operation === 'commit' || operation === 'draft-submit') {
    const body = await readJsonLimited<FamilyCommitRequest>(request, MAX_COMMIT_BYTES)
    if (!validCommitId(body.commitId)) throw new AppError(400, 'FAMILY_COMMIT_ID_INVALID', 'A valid commitId is required.')
    if (!Array.isArray(body.operations) || body.operations.length === 0 || body.operations.length > MAX_OPERATIONS || !body.operations.every(isFamilyOperation)) {
      throw new AppError(422, 'FAMILY_COMMIT_INVALID', 'Commit operations are invalid or exceed the allowed limit.')
    }
    if (typeof body.clientCreatedAt !== 'string' || Number.isNaN(Date.parse(body.clientCreatedAt))) throw new AppError(422, 'FAMILY_COMMIT_INVALID', 'clientCreatedAt must be a valid ISO timestamp.')
    if (operation === 'draft-submit') return json(await submitFamilyDraft(auth.accessToken, workspaceId, auth.user, body), { status: 201 })
    if (collaborationApprovalEnabled() && !(await collaborationWorkspaceInfo(auth.accessToken, workspaceId, auth.user)).canCommitDirectly) {
      throw new AppError(403, 'APPROVAL_REQUIRED', 'Contributors must submit this change as a Draft for owner approval.')
    }
    const result = await commitFamily(auth.accessToken, workspaceId, body, { email: auth.user.email, name: auth.user.name })
    await markMirrorChanged(workspaceId)
    return json(result)
  }

  if (operation === 'draft-review') {
    const body = await readJsonLimited<DraftReviewRequest>(request, MAX_COMMIT_BYTES)
    const problem = draftReviewRequestProblem(body)
    if (problem === 'reject_note_required') throw new AppError(422, 'DRAFT_REJECT_NOTE_REQUIRED', 'A reason is required when rejecting changes.')
    if (problem) throw new AppError(422, 'DRAFT_REVIEW_INVALID', 'Draft review request is invalid.')
    return json(await reviewFamilyDraft(auth.accessToken, workspaceId, auth.user, body))
  }
  if (operation === 'mirror-sync') return json(await syncDriveMirror(auth.accessToken, workspaceId, auth.user))

  if (request.method === 'GET') {
    const resource = new URL(request.url).searchParams.get('resource')
    if (resource === 'activity') return json({ activity: await listActivity(auth.accessToken, workspaceId) })
    if (resource === 'drafts') return json({ drafts: await listReviewDrafts(auth.accessToken, workspaceId, auth.user) })
    if (resource === 'collaboration-status') return json({ status: await collaborationStatus(auth.accessToken, workspaceId, auth.user) })
    const loaded = await loadFamily(auth.accessToken, workspaceId)
    return json({ ...loaded, workspace: await collaborationWorkspaceAccess(auth.accessToken, loaded.workspace, auth.user) })
  }
  if (collaborationApprovalEnabled() && !(await collaborationWorkspaceInfo(auth.accessToken, workspaceId, auth.user)).canCommitDirectly) {
    throw new AppError(403, 'APPROVAL_REQUIRED', 'Contributors must submit this change as a Draft for owner approval.')
  }
  const body = await readJsonLimited<SaveBody>(request, 11 * 1024 * 1024)
  const validationErrors: string[] = []
  const dangerousPath = findDangerousObjectKey(body.data, 'data')
  if (dangerousPath) validationErrors.push('Potentially unsafe data structure detected.')
  if ((body.data?.persons?.length ?? 0) > IMPORT_LIMITS.persons) validationErrors.push('Import contains too many people.')
  if ((body.data?.relationships?.length ?? 0) > IMPORT_LIMITS.relationships) validationErrors.push('Import contains too many relationships.')
  if ((body.data?.media?.length ?? 0) > IMPORT_LIMITS.media) validationErrors.push('Import contains too many media references.')
  const schema = validationErrors.length ? undefined : validateFamilyData(body.data)
  if (schema && schema.errors.length) validationErrors.push(...schema.errors)
  if (validationErrors.length) {
    if (body.mode === 'replace') await appendActivity(auth.accessToken, workspaceId, { actorEmail: auth.user.email, actorName: auth.user.name, action: 'dataset.import_failed', entityType: 'dataset', summary: 'Import validation failed', metadata: { errorCount: validationErrors.length } }).catch(() => undefined)
    throw new AppError(422, 'FAMILY_DATA_INVALID', 'Family data failed security or genealogy validation.', { errors: validationErrors.slice(0, 50) })
  }
  const snapshot = await saveFamily(auth.accessToken, workspaceId, body.data, body.expectedRevision, body.mode, { email: auth.user.email, name: auth.user.name })
  await markMirrorChanged(workspaceId)
  return json({ snapshot })
}) } }
