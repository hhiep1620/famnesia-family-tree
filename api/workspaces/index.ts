import { requireAuth } from '../_server/auth.js'
import { listWorkspaces } from '../_server/drive.js'
import { json, requireMethod, withErrors } from '../_server/http.js'

export default { fetch(request: Request) { return withErrors(async () => {
  requireMethod(request, ['GET'])
  const auth = await requireAuth(request)
  return json({ workspaces: await listWorkspaces(auth.accessToken) })
}) } }
