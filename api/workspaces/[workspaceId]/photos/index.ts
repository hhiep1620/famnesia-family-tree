import { requireAuth } from '../../../_server/auth.js'
import { uploadPhoto } from '../../../_server/drive.js'
import { AppError, assertSameOrigin, json, pathParameter, requireMethod, withErrors } from '../../../_server/http.js'
import { collaborationApprovalEnabled } from '../../../_server/env.js'
import { collaborationWorkspaceInfo, uploadDraftPhoto } from '../../../_server/collaboration.js'

export default { fetch(request: Request) { return withErrors(async () => {
  requireMethod(request, ['POST'])
  assertSameOrigin(request)
  const auth = await requireAuth(request)
  const form = await request.formData()
  const file = form.get('photo')
  if (!(file instanceof File)) throw new AppError(400, 'PHOTO_REQUIRED', 'A photo file is required.')
  const profileId = form.get('profileId')
  const personId = form.get('personId')
  const workspaceId = pathParameter(request, 'workspaces')
  const profile = typeof profileId === 'string' ? profileId : undefined
  const person = typeof personId === 'string' ? personId : undefined
  const access = collaborationApprovalEnabled() ? await collaborationWorkspaceInfo(auth.accessToken, workspaceId, auth.user) : undefined
  const id = access?.role === 'contributor'
    ? await uploadDraftPhoto(auth.accessToken, workspaceId, auth.user, file, file.name, profile, person)
    : await uploadPhoto(auth.accessToken, workspaceId, file, file.name, profile, person, auth.session.googleSub)
  return json({ id }, { status: 201 })
}) } }
