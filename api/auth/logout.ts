import { clearSessionCookie, readCookie, SESSION_COOKIE } from '../_server/cookies.js'
import { assertSameOrigin, json, requireMethod, withErrors } from '../_server/http.js'
import { sessions } from '../_server/sessionRepository.js'
import { backendSelection } from '../_server/backendSelectors.js'

export default {
  fetch(request: Request) {
    return withErrors(async () => {
      requireMethod(request, ['POST'])
      assertSameOrigin(request)
      if (backendSelection().auth === 'google-drive-oauth') {
        const id = readCookie(request, SESSION_COOKIE)
        if (id) await sessions().deleteSession(id)
      }
      return json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } })
    })
  },
}
