import { createOAuthState } from '../_server/cookies.js'
import { assertSameOrigin, json, requireMethod, withErrors } from '../_server/http.js'
import { authorizationUrl } from '../_server/oauth.js'
import { requireGoogleDriveAuthBackend } from '../_server/backendSelectors.js'

export default {
  fetch(request: Request) {
    return withErrors(async () => {
      requireMethod(request, ['POST'])
      assertSameOrigin(request)
      requireGoogleDriveAuthBackend()
      const { state, cookie } = createOAuthState()
      return json({ authorizationUrl: authorizationUrl(state, true) }, { headers: { 'Set-Cookie': cookie } })
    })
  },
}
