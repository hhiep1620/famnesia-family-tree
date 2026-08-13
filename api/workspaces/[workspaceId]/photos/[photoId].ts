import { requireAuth } from '../../../_server/auth.js'
import { deletePhoto, readPhoto } from '../../../_server/drive.js'
import { assertSameOrigin, pathParameter, requireMethod, withErrors } from '../../../_server/http.js'
import { collaborationApprovalEnabled } from '../../../_server/env.js'
import { collaborationWorkspaceInfo, deleteDraftPhoto, readDraftPhoto } from '../../../_server/collaboration.js'

export default { fetch(request: Request) { return withErrors(async () => {
  requireMethod(request, ['GET', 'DELETE'])
  if (request.method === 'DELETE') assertSameOrigin(request)
  const auth = await requireAuth(request)
  const workspaceId = pathParameter(request, 'workspaces')
  const photoId = pathParameter(request, 'photos')
  const access = collaborationApprovalEnabled() ? await collaborationWorkspaceInfo(auth.accessToken, workspaceId, auth.user) : undefined
  if (request.method === 'DELETE') {
    if (access?.role === 'contributor') await deleteDraftPhoto(auth.accessToken, workspaceId, auth.user, photoId)
    else await deletePhoto(auth.accessToken, workspaceId, photoId)
    return new Response(null, { status: 204 })
  }
  let source: Response
  try { source = await readPhoto(auth.accessToken, workspaceId, photoId) }
  catch (error) {
    if (access?.role !== 'contributor' && !access?.canReviewDrafts) throw error
    source = await readDraftPhoto(auth.accessToken, workspaceId, auth.user, photoId)
  }
  const headers = new Headers()
  headers.set('Content-Type', source.headers.get('content-type') ?? 'application/octet-stream')
  headers.set('Cache-Control', 'private, no-store')
  return new Response(source.body, { status: 200, headers })
}) } }
