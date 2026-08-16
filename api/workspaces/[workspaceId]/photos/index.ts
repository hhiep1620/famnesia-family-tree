import { AppError, assertSameOrigin, json, pathParameter, requireMethod, withErrors } from '../../../_server/http.js'
import { requestBackend } from '../../../_server/requestBackend.js'

export default { fetch(request: Request) { return withErrors(async () => {
  requireMethod(request, ['POST'])
  assertSameOrigin(request)
  const backend = await requestBackend(request)
  const form = await request.formData()
  const file = form.get('photo')
  const thumbnail = form.get('thumbnail')
  if (!(file instanceof File)) throw new AppError(400, 'PHOTO_REQUIRED', 'A photo file is required.')
  if (thumbnail !== null && !(thumbnail instanceof File)) throw new AppError(400, 'PHOTO_THUMBNAIL_INVALID', 'The photo thumbnail is invalid.')
  const profileId = form.get('profileId')
  const personId = form.get('personId')
  const workspaceId = pathParameter(request, 'workspaces')
  const profile = typeof profileId === 'string' ? profileId : undefined
  const person = typeof personId === 'string' ? personId : undefined
  const id = await backend.media.upload(workspaceId, file, file.name, profile, person, thumbnail ?? undefined)
  return json({ id }, { status: 201 })
}) } }
