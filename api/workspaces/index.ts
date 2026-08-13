import { requireAuth } from '../_server/auth.js'
import { listWorkspaces, loadFamily } from '../_server/drive.js'
import { AppError, assertSameOrigin, json, readJson, requireMethod, withErrors } from '../_server/http.js'
import { collaborationWorkspaceAccess } from '../_server/collaboration.js'

export default { fetch(request: Request) { return withErrors(async () => {
  requireMethod(request, ['GET', 'POST'])
  if (request.method === 'POST') assertSameOrigin(request)
  const auth = await requireAuth(request)
  if (request.method === 'POST') {
    const body = await readJson<{ workspaceId?: unknown }>(request)
    if (typeof body.workspaceId !== 'string' || !/^[A-Za-z0-9_-]{10,200}$/.test(body.workspaceId)) {
      throw new AppError(400, 'WORKSPACE_ID_INVALID', 'Thư mục Google Drive được chọn không hợp lệ.')
    }
    const connected = await loadFamily(auth.accessToken, body.workspaceId)
    return json({ workspace: await collaborationWorkspaceAccess(auth.accessToken, connected.workspace, auth.user) })
  }
  const workspaces = await listWorkspaces(auth.accessToken)
  return json({ workspaces: await Promise.all(workspaces.map((workspace) => collaborationWorkspaceAccess(auth.accessToken, workspace, auth.user))) })
}) } }
