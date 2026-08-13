import { requireAuth } from '../../../_server/auth.js'
import { addMember, appendActivity, listMembers, removeMember, updateMember } from '../../../_server/drive.js'
import { AppError, assertSameOrigin, json, pathParameter, readJson, requireMethod, withErrors } from '../../../_server/http.js'
import { collaborationApprovalEnabled } from '../../../_server/env.js'
import { addCollaborationMember, listCollaborationMembers, removeCollaborationMember, updateCollaborationMember } from '../../../_server/collaboration.js'
import { markMirrorChanged } from '../../../_server/collaboration.js'

export default { fetch(request: Request) { return withErrors(async () => {
  requireMethod(request, ['GET', 'POST', 'PATCH', 'DELETE'])
  if (request.method !== 'GET') assertSameOrigin(request)
  const auth = await requireAuth(request)
  const workspaceId = pathParameter(request, 'workspaces')
  if (request.method === 'GET') return json({ members: collaborationApprovalEnabled() ? await listCollaborationMembers(auth.accessToken, workspaceId) : await listMembers(auth.accessToken, workspaceId) })
  const body = await readJson<{ permissionId?: string; email?: string; role?: 'contributor' | 'viewer' }>(request)
  if (body.role !== undefined && body.role !== 'contributor' && body.role !== 'viewer') throw new AppError(400, 'ROLE_INVALID', 'Role must be contributor or viewer.')
  if (request.method === 'POST') {
    if (!body.email || !/^\S+@\S+\.\S+$/.test(body.email) || !body.role) throw new AppError(400, 'MEMBER_INVALID', 'A valid email and role are required.')
    if (collaborationApprovalEnabled()) await addCollaborationMember(auth.accessToken, workspaceId, body.email.toLowerCase(), body.role)
    else await addMember(auth.accessToken, workspaceId, body.email.toLowerCase(), body.role)
    await appendActivity(auth.accessToken, workspaceId, { actorEmail: auth.user.email, actorName: auth.user.name, action: 'member.invited', entityType: 'member', summary: `Invited ${body.email.toLowerCase()} as ${body.role}` })
    await markMirrorChanged(workspaceId)
    return json({ ok: true }, { status: 201 })
  }
  if (!body.permissionId) throw new AppError(400, 'MEMBER_INVALID', 'Permission ID is required.')
  if (request.method === 'DELETE') {
    if (collaborationApprovalEnabled()) await removeCollaborationMember(auth.accessToken, workspaceId, body.permissionId)
    else await removeMember(auth.accessToken, workspaceId, body.permissionId)
    await appendActivity(auth.accessToken, workspaceId, { actorEmail: auth.user.email, actorName: auth.user.name, action: 'member.removed', entityType: 'member', entityId: body.permissionId, summary: 'Removed a workspace member' })
    await markMirrorChanged(workspaceId)
    return new Response(null, { status: 204 })
  }
  if (!body.role) throw new AppError(400, 'ROLE_INVALID', 'Role must be contributor or viewer.')
  if (collaborationApprovalEnabled()) await updateCollaborationMember(auth.accessToken, workspaceId, body.permissionId, body.role)
  else await updateMember(auth.accessToken, workspaceId, body.permissionId, body.role)
  await appendActivity(auth.accessToken, workspaceId, { actorEmail: auth.user.email, actorName: auth.user.name, action: 'member.role_changed', entityType: 'member', entityId: body.permissionId, summary: `Changed a member role to ${body.role}` })
  await markMirrorChanged(workspaceId)
  return json({ ok: true })
}) } }
