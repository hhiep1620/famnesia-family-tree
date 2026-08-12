import { requireAuth } from '../../../_server/auth.js'
import { createBackup, listBackups, loadBackup } from '../../../_server/drive.js'
import { assertSameOrigin, json, pathParameter, readJson, requireMethod, withErrors } from '../../../_server/http.js'
import type { FamilyData } from '../../../../src/types/family.js'

export default { fetch(request: Request) { return withErrors(async () => {
  requireMethod(request, ['GET', 'POST'])
  if (request.method === 'POST') assertSameOrigin(request)
  const auth = await requireAuth(request)
  const workspaceId = pathParameter(request, 'workspaces')
  if (request.method === 'GET') {
    const backupId = new URL(request.url).searchParams.get('backupId')
    if (backupId) return json({ data: await loadBackup(auth.accessToken, workspaceId, backupId) })
    return json({ backups: await listBackups(auth.accessToken, workspaceId) })
  }
  const body = await readJson<{ data: FamilyData; reason?: string }>(request)
  return json({ backup: await createBackup(auth.accessToken, workspaceId, body.data, body.reason) }, { status: 201 })
}) } }
