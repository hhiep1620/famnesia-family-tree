import { requireAuth } from '../_server/auth.js'
import { googlePickerEnv } from '../_server/env.js'
import { AppError, assertSameOrigin, json, requireMethod, withErrors } from '../_server/http.js'

export default {
  fetch(request: Request) {
    return withErrors(async () => {
      requireMethod(request, ['POST'])
      assertSameOrigin(request)
      const auth = await requireAuth(request)
      let picker: ReturnType<typeof googlePickerEnv>
      try { picker = googlePickerEnv() }
      catch {
        throw new AppError(503, 'GOOGLE_PICKER_NOT_CONFIGURED', 'Google Picker chưa được cấu hình cho Famnesia.')
      }
      return json({ accessToken: auth.accessToken, ...picker })
    })
  },
}
