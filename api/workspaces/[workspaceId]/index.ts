import { requireAuth } from '../../_server/auth.js'
import { workspaceResources } from '../../_server/drive.js'
import { json, pathParameter, requireMethod, withErrors } from '../../_server/http.js'
import { collaborationWorkspaceAccess } from '../../_server/collaboration.js'

export default { fetch(request: Request) { return withErrors(async () => {
  requireMethod(request, ['GET'])
  const auth = await requireAuth(request)
  const workspace = await workspaceResources(auth.accessToken, pathParameter(request, 'workspaces'))
  const access = await collaborationWorkspaceAccess(auth.accessToken, workspace.access, auth.user)
  return json({ workspace: { ...access, rootFolderUrl: workspace.root.webViewLink ?? `https://drive.google.com/drive/folders/${workspace.root.id}` } })
}) } }
