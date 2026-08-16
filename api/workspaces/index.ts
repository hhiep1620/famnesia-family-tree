import { AppError, assertSameOrigin, json, readJson, requireMethod, withErrors } from '../_server/http.js'
import { requestBackend } from '../_server/requestBackend.js'

export default { fetch(request: Request) { return withErrors(async () => {
  requireMethod(request, ['GET', 'POST'])
  if (request.method === 'POST') assertSameOrigin(request)
  const backend = await requestBackend(request)
  if (request.method === 'POST') {
    const body = await readJson<{ workspaceId?: unknown; name?: unknown; invitationToken?: unknown }>(request)
    if (typeof body.invitationToken === 'string') {
      return json({ workspace: await backend.workspaces.acceptInvitation(body.invitationToken) })
    }
    if (typeof body.name === 'string') {
      const name = body.name.trim()
      if (!name || name.length > 120) throw new AppError(400, 'WORKSPACE_NAME_INVALID', 'Tên workspace phải có từ 1 đến 120 ký tự.')
      return json({ workspace: await backend.workspaces.create(name) }, { status: 201 })
    }
    if (typeof body.workspaceId !== 'string' || !/^[A-Za-z0-9_-]{10,200}$/.test(body.workspaceId)) {
      throw new AppError(400, 'WORKSPACE_ID_INVALID', 'Workspace được chọn không hợp lệ.')
    }
    return json({ workspace: await backend.workspaces.connect(body.workspaceId) })
  }
  return json({ workspaces: await backend.workspaces.list() })
}) } }
