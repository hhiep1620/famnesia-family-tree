import { AppError, assertSameOrigin, json, readJson, requireMethod, withErrors } from '../_server/http.js'
import { requestBackend } from '../_server/requestBackend.js'

export default { fetch(request: Request) { return withErrors(async () => {
  requireMethod(request, ['GET', 'POST'])
  if (request.method === 'POST') assertSameOrigin(request)
  const backend = await requestBackend(request)
  if (request.method === 'POST') {
    const body = await readJson<{ workspaceId?: unknown }>(request)
    if (typeof body.workspaceId !== 'string' || !/^[A-Za-z0-9_-]{10,200}$/.test(body.workspaceId)) {
      throw new AppError(400, 'WORKSPACE_ID_INVALID', 'Thư mục Google Drive được chọn không hợp lệ.')
    }
    return json({ workspace: await backend.workspaces.connect(body.workspaceId) })
  }
  return json({ workspaces: await backend.workspaces.list() })
}) } }
