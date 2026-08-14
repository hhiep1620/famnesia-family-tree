import { AppError, assertSameOrigin, json, pathParameter, readJson, requireMethod, withErrors } from '../../../_server/http.js'
import { requestBackend } from '../../../_server/requestBackend.js'

export default { fetch(request: Request) { return withErrors(async () => {
  requireMethod(request, ['GET', 'POST', 'PATCH', 'DELETE'])
  if (request.method !== 'GET') assertSameOrigin(request)
  const backend = await requestBackend(request)
  const workspaceId = pathParameter(request, 'workspaces')
  if (request.method === 'GET') return json({ members: await backend.members.list(workspaceId) })
  const body = await readJson<{ permissionId?: string; email?: string; role?: 'editor' | 'contributor' | 'viewer' }>(request)
  if (body.role !== undefined && body.role !== 'editor' && body.role !== 'contributor' && body.role !== 'viewer') throw new AppError(400, 'ROLE_INVALID', 'Role must be editor, contributor or viewer.')
  if (request.method === 'POST') {
    if (!body.email || !/^\S+@\S+\.\S+$/.test(body.email) || !body.role) throw new AppError(400, 'MEMBER_INVALID', 'A valid email and role are required.')
    const invitation = await backend.members.add(workspaceId, body.email.toLowerCase(), body.role)
    return json({ ok: true, invitation }, { status: 201 })
  }
  if (!body.permissionId) throw new AppError(400, 'MEMBER_INVALID', 'Permission ID is required.')
  if (request.method === 'DELETE') {
    await backend.members.remove(workspaceId, body.permissionId)
    return new Response(null, { status: 204 })
  }
  if (!body.role) throw new AppError(400, 'ROLE_INVALID', 'Role must be editor, contributor or viewer.')
  await backend.members.update(workspaceId, body.permissionId, body.role)
  return json({ ok: true })
}) } }
