import { isFamilyOperation } from '../../../src/draft/familyOperations.js'
import { findDangerousObjectKey } from '../../../src/import/security/contentSanitization.js'
import { IMPORT_LIMITS } from '../../../src/import/security/importLimits.js'
import { validateFamilyData } from '../../../src/schema/familyDataSchema.js'
import type { FamilyData } from '../../../src/types/family.js'
import type { FamilyCommitRequest } from '../../../src/types/familyOperations.js'
import type { FamilyRevision } from '../../../src/types/familyOperations.js'
import { AppError, assertSameOrigin, json, pathParameter, readJsonLimited, requireMethod, withErrors } from '../../_server/http.js'
import { requestBackend } from '../../_server/requestBackend.js'

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
  const backend = await requestBackend(request)
  const workspaceId = pathParameter(request, 'workspaces')

  if (operation === 'commit') {
    const body = await readJsonLimited<FamilyCommitRequest>(request, MAX_COMMIT_BYTES)
    if (!validCommitId(body.commitId)) throw new AppError(400, 'FAMILY_COMMIT_ID_INVALID', 'A valid commitId is required.')
    if (!Array.isArray(body.operations) || body.operations.length === 0 || body.operations.length > MAX_OPERATIONS || !body.operations.every(isFamilyOperation)) {
      throw new AppError(422, 'FAMILY_COMMIT_INVALID', 'Commit operations are invalid or exceed the allowed limit.')
    }
    if (typeof body.clientCreatedAt !== 'string' || Number.isNaN(Date.parse(body.clientCreatedAt))) throw new AppError(422, 'FAMILY_COMMIT_INVALID', 'clientCreatedAt must be a valid ISO timestamp.')
    const result = await backend.family.commit(workspaceId, body)
    return json(result)
  }

  if (operation === 'draft-submit' || operation === 'draft-review' || operation === 'mirror-sync') {
    throw new AppError(410, 'LEGACY_DRAFT_DISABLED', 'Legacy draft collaboration is disabled.')
  }

  if (request.method === 'GET') {
    const resource = new URL(request.url).searchParams.get('resource')
    if (resource === 'activity') return json({ activity: await backend.family.listActivity(workspaceId) })
    if (resource === 'commit-status') {
      const commitId = new URL(request.url).searchParams.get('commitId')
      if (!validCommitId(commitId)) throw new AppError(400, 'FAMILY_COMMIT_ID_INVALID', 'A valid commitId is required.')
      return json(await backend.family.commitStatus(workspaceId, commitId))
    }
    if (resource === 'drafts' || resource === 'collaboration-status') {
      throw new AppError(410, 'LEGACY_DRAFT_DISABLED', 'Legacy draft collaboration is disabled.')
    }
    return json(await backend.family.load(workspaceId))
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
    if (body.mode === 'replace') await backend.family.recordActivity(workspaceId, { actorEmail: backend.user.email, actorName: backend.user.name, action: 'dataset.import_failed', entityType: 'dataset', summary: 'Import validation failed', metadata: { errorCount: validationErrors.length } }).catch(() => undefined)
    throw new AppError(422, 'FAMILY_DATA_INVALID', 'Family data failed security or genealogy validation.', { errors: validationErrors.slice(0, 50) })
  }
  const snapshot = await backend.family.save(workspaceId, body.data, body.expectedRevision, body.mode)
  return json({ snapshot })
}) } }
