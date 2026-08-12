import { requireAuth } from '../../../_server/auth.js'
import { addMember, listMembers, removeMember, updateMember } from '../../../_server/drive.js'
import { AppError, assertSameOrigin, json, pathParameter, readJson, requireMethod, withErrors } from '../../../_server/http.js'

export default { fetch(request: Request) { return withErrors(async () => {
  requireMethod(request, ['GET', 'POST', 'PATCH', 'DELETE'])
  if (request.method !== 'GET') assertSameOrigin(request)
  const auth = await requireAuth(request)
  const workspaceId = pathParameter(request, 'workspaces')
  if (request.method === 'GET') return json({ members: await listMembers(auth.accessToken, workspaceId) })
  const body = await readJson<{ permissionId?: string; email?: string; role?: 'editor' | 'viewer' }>(request)
  if (request.method === 'POST') {
    if (!body.email || !/^\S+@\S+\.\S+$/.test(body.email) || !body.role) throw new AppError(400, 'MEMBER_INVALID', 'A valid email and role are required.')
    await addMember(auth.accessToken, workspaceId, body.email.toLowerCase(), body.role)
    return json({ ok: true }, { status: 201 })
  }
  if (!body.permissionId) throw new AppError(400, 'MEMBER_INVALID', 'Permission ID is required.')
  if (request.method === 'DELETE') {
    await removeMember(auth.accessToken, workspaceId, body.permissionId)
    return new Response(null, { status: 204 })
  }
  if (!body.role) throw new AppError(400, 'ROLE_INVALID', 'Role must be editor or viewer.')
  await updateMember(auth.accessToken, workspaceId, body.permissionId, body.role)
  return json({ ok: true })
}) } }
