import { createOAuthState } from '../_server/cookies.js'
import { authorizationUrl } from '../_server/oauth.js'
import { requireMethod, withErrors } from '../_server/http.js'
import { requireGoogleDriveAuthBackend } from '../_server/backendSelectors.js'

export default {
  fetch(request: Request) {
    return withErrors(async () => {
      requireMethod(request, ['GET'])
      requireGoogleDriveAuthBackend()
      const { state, cookie } = createOAuthState()
      const reconnect = new URL(request.url).searchParams.get('reconnect') === '1'
      return new Response(null, { status: 302, headers: { Location: authorizationUrl(state, reconnect), 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } })
    })
  },
}
