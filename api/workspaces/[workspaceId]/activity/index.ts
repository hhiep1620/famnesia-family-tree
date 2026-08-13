import { requireAuth } from '../../../_server/auth.js'
import { listActivity } from '../../../_server/drive.js'
import { json, pathParameter, requireMethod, withErrors } from '../../../_server/http.js'

export default { fetch(request: Request) { return withErrors(async () => {
  requireMethod(request, ['GET'])
  const auth = await requireAuth(request)
  const workspaceId = pathParameter(request, 'workspaces')
  return json({ activity: await listActivity(auth.accessToken, workspaceId) })
}) } }
