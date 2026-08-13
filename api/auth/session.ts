import { requireAuth } from '../_server/auth.js'
import { googlePickerEnv } from '../_server/env.js'
import { AppError, assertSameOrigin, withErrors, json, requireMethod } from '../_server/http.js'

export default {
  fetch(request: Request) {
    return withErrors(async () => {
      requireMethod(request, ['GET', 'POST'])
      if (request.method === 'POST') assertSameOrigin(request)
      const auth = await requireAuth(request)
      if (request.method === 'POST' && new URL(request.url).searchParams.get('resource') === 'picker') {
        let picker: ReturnType<typeof googlePickerEnv>
        try { picker = googlePickerEnv() }
        catch {
          throw new AppError(503, 'GOOGLE_PICKER_NOT_CONFIGURED', 'Google Picker chưa được cấu hình cho Famnesia.')
        }
        return json({ accessToken: auth.accessToken, ...picker })
      }
      if (request.method === 'POST') throw new AppError(400, 'AUTH_RESOURCE_INVALID', 'Auth resource không hợp lệ.')
      return json({ authenticated: true, user: auth.user, expiresAt: auth.session.expiresAt })
    })
  },
}
