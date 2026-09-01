import { createOAuthState, oauthReturnCookie } from '../_server/cookies.js'
import { authorizationUrl } from '../_server/oauth.js'
import { requireMethod, withErrors } from '../_server/http.js'
import { requireGoogleDriveAuthBackend } from '../_server/backendSelectors.js'

export default {
  fetch(request: Request) {
    return withErrors(async () => {
      requireMethod(request, ['GET'])
      requireGoogleDriveAuthBackend()
      const { state, cookie } = createOAuthState()
      const url = new URL(request.url)
      const reconnect = url.searchParams.get('reconnect') === '1'
      const headers = new Headers({ Location: authorizationUrl(state, reconnect), 'Cache-Control': 'no-store' })
      headers.append('Set-Cookie', cookie)
      headers.append('Set-Cookie', oauthReturnCookie(url.searchParams.get('returnTo')))
      return new Response(null, { status: 302, headers })
    })
  },
}
