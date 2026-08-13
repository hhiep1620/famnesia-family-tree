import { requireAuth } from '../../_server/auth.js'
import { appendActivity, listActivity, loadFamily, saveFamily, type FamilyRevision } from '../../_server/drive.js'
import { AppError, assertSameOrigin, json, pathParameter, readJsonLimited, requireMethod, withErrors } from '../../_server/http.js'
import type { FamilyData } from '../../../src/types/family.js'
import { validateFamilyData } from '../../../src/schema/familyDataSchema.js'
import { findDangerousObjectKey } from '../../../src/import/security/contentSanitization.js'
import { IMPORT_LIMITS } from '../../../src/import/security/importLimits.js'

interface SaveBody { data: FamilyData; expectedRevision?: FamilyRevision; mode?: 'save' | 'replace' | 'restore' | 'merge' }
export default { fetch(request: Request) { return withErrors(async () => {
  requireMethod(request, ['GET', 'PUT'])
  if (request.method === 'PUT') assertSameOrigin(request)
  const auth = await requireAuth(request)
  const workspaceId = pathParameter(request, 'workspaces')
  if (request.method === 'GET') {
    if (new URL(request.url).searchParams.get('resource') === 'activity') return json({ activity: await listActivity(auth.accessToken, workspaceId) })
    return json(await loadFamily(auth.accessToken, workspaceId))
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
  return json({ snapshot: await saveFamily(auth.accessToken, workspaceId, body.data, body.expectedRevision, body.mode, { email: auth.user.email, name: auth.user.name }) })
}) } }
