import { requireAuth } from '../../../_server/auth.js'
import { deletePhoto, readPhoto } from '../../../_server/drive.js'
import { assertSameOrigin, pathParameter, requireMethod, withErrors } from '../../../_server/http.js'

export default { fetch(request: Request) { return withErrors(async () => {
  requireMethod(request, ['GET', 'DELETE'])
  if (request.method === 'DELETE') assertSameOrigin(request)
  const auth = await requireAuth(request)
  const workspaceId = pathParameter(request, 'workspaces')
  const photoId = pathParameter(request, 'photos')
  if (request.method === 'DELETE') {
    await deletePhoto(auth.accessToken, workspaceId, photoId)
    return new Response(null, { status: 204 })
  }
  const source = await readPhoto(auth.accessToken, workspaceId, photoId)
  const headers = new Headers()
  headers.set('Content-Type', source.headers.get('content-type') ?? 'application/octet-stream')
  headers.set('Cache-Control', 'private, no-store')
  return new Response(source.body, { status: 200, headers })
}) } }
