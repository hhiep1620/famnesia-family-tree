import { clearOAuthStateCookie, sessionCookie, validateOAuthState } from '../_server/cookies.js'
import { googleOAuthEnv } from '../_server/env.js'
import { AppError, apiError, requireMethod } from '../_server/http.js'
import { exchangeCode } from '../_server/oauth.js'
import { sessions } from '../_server/sessionRepository.js'

function appOrigin(): string {
  const redirect = new URL(googleOAuthEnv().redirectUri)
  return redirect.origin
}

function failure(error: unknown): Response {
  const code = error instanceof AppError ? error.code : 'AUTH_CALLBACK_FAILED'
  apiError(error)
  return new Response(null, { status: 302, headers: { Location: `${appOrigin()}/?auth_error=${encodeURIComponent(code)}`, 'Set-Cookie': clearOAuthStateCookie(), 'Cache-Control': 'no-store' } })
}

export default {
  async fetch(request: Request) {
    try {
      requireMethod(request, ['GET'])
      const url = new URL(request.url)
      if (!validateOAuthState(request, url.searchParams.get('state'))) throw new AppError(400, 'OAUTH_STATE_INVALID', 'OAuth state is invalid or expired.')
      if (url.searchParams.get('error')) throw new AppError(400, 'GOOGLE_AUTH_CANCELLED', 'Google sign-in was cancelled.')
      const code = url.searchParams.get('code')
      if (!code) throw new AppError(400, 'OAUTH_CODE_MISSING', 'Google did not return an authorization code.')
      const repository = sessions()
      const session = await exchangeCode(code, repository)
      await repository.saveSession(session)
      const headers = new Headers({ Location: `${appOrigin()}/`, 'Cache-Control': 'no-store' })
      headers.append('Set-Cookie', sessionCookie(session.id))
      headers.append('Set-Cookie', clearOAuthStateCookie())
      return new Response(null, { status: 302, headers })
    } catch (error) { return failure(error) }
  },
}
