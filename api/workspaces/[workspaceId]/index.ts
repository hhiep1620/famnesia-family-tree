import { requireAuth } from '../../_server/auth.js'
import { workspaceResources } from '../../_server/drive.js'
import { json, pathParameter, requireMethod, withErrors } from '../../_server/http.js'

export default { fetch(request: Request) { return withErrors(async () => {
  requireMethod(request, ['GET'])
  const auth = await requireAuth(request)
  const workspace = await workspaceResources(auth.accessToken, pathParameter(request, 'workspaces'))
  return json({ workspace: { ...workspace.access, rootFolderUrl: workspace.root.webViewLink ?? `https://drive.google.com/drive/folders/${workspace.root.id}` } })
}) } }
