import { requireAuth } from '../../_server/auth.js'
import { loadFamily, saveFamily, type FamilyRevision } from '../../_server/drive.js'
import { assertSameOrigin, json, pathParameter, readJson, requireMethod, withErrors } from '../../_server/http.js'
import type { FamilyData } from '../../../src/types/family.js'

interface SaveBody { data: FamilyData; expectedRevision?: FamilyRevision; mode?: 'save' | 'replace' | 'restore' }
export default { fetch(request: Request) { return withErrors(async () => {
  requireMethod(request, ['GET', 'PUT'])
  if (request.method === 'PUT') assertSameOrigin(request)
  const auth = await requireAuth(request)
  const workspaceId = pathParameter(request, 'workspaces')
  if (request.method === 'GET') return json(await loadFamily(auth.accessToken, workspaceId))
  const body = await readJson<SaveBody>(request)
  return json({ snapshot: await saveFamily(auth.accessToken, workspaceId, body.data, body.expectedRevision, body.mode) })
}) } }
