import { requireAuth } from '../../../_server/auth.js'
import { uploadPhoto } from '../../../_server/drive.js'
import { AppError, assertSameOrigin, json, pathParameter, requireMethod, withErrors } from '../../../_server/http.js'

export default { fetch(request: Request) { return withErrors(async () => {
  requireMethod(request, ['POST'])
  assertSameOrigin(request)
  const auth = await requireAuth(request)
  const form = await request.formData()
  const file = form.get('photo')
  if (!(file instanceof File)) throw new AppError(400, 'PHOTO_REQUIRED', 'A photo file is required.')
  const id = await uploadPhoto(auth.accessToken, pathParameter(request, 'workspaces'), file, file.name)
  return json({ id }, { status: 201 })
}) } }
