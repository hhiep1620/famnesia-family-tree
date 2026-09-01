import { assertSameOrigin, json, pathParameter, readJson, requireMethod, withErrors } from '../../../_server/http.js'
import type { FamilyData } from '../../../../src/types/family.js'
import { requestBackend } from '../../../_server/requestBackend.js'

export default { fetch(request: Request) { return withErrors(async () => {
  requireMethod(request, ['GET', 'POST'])
  if (request.method === 'POST') assertSameOrigin(request)
  const backend = await requestBackend(request)
  const workspaceId = pathParameter(request, 'workspaces')
  if (request.method === 'GET') {
    const backupId = new URL(request.url).searchParams.get('backupId')
    if (backupId) return json({ data: await backend.backups.load(workspaceId, backupId) })
    return json({ backups: await backend.backups.list(workspaceId) })
  }
  const body = await readJson<{ data: FamilyData; reason?: string }>(request)
  const backup = await backend.backups.create(workspaceId, body.data, body.reason)
  return json({ backup }, { status: 201 })
}) } }
