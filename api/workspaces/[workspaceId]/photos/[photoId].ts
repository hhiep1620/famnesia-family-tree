import { assertSameOrigin, pathParameter, requireMethod, withErrors } from '../../../_server/http.js'
import { requestBackend } from '../../../_server/requestBackend.js'

export default { fetch(request: Request) { return withErrors(async () => {
  requireMethod(request, ['GET', 'DELETE'])
  if (request.method === 'DELETE') assertSameOrigin(request)
  const backend = await requestBackend(request)
  const workspaceId = pathParameter(request, 'workspaces')
  const photoId = pathParameter(request, 'photos')
  if (request.method === 'DELETE') {
    await backend.media.delete(workspaceId, photoId)
    return new Response(null, { status: 204 })
  }
  const variant = new URL(request.url).searchParams.get('variant') === 'thumb' ? 'thumb' : 'original'
  const source = await backend.media.read(workspaceId, photoId, variant)
  const headers = new Headers()
  headers.set('Content-Type', source.headers.get('content-type') ?? 'application/octet-stream')
  headers.set('Cache-Control', 'private, no-store')
  return new Response(source.body, { status: 200, headers })
}) } }
