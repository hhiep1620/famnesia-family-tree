import { json, pathParameter, requireMethod, withErrors } from '../../_server/http.js'
import { requestBackend } from '../../_server/requestBackend.js'

export default { fetch(request: Request) { return withErrors(async () => {
  requireMethod(request, ['GET'])
  const backend = await requestBackend(request)
  return json({ workspace: await backend.workspaces.get(pathParameter(request, 'workspaces')) })
}) } }
