import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { isProduction, sessionMaxAgeSeconds, sessionSecret } from './env.js'

export const SESSION_COOKIE = 'family_session'
export const OAUTH_STATE_COOKIE = 'family_oauth_state'
export const OAUTH_RETURN_COOKIE = 'family_oauth_return'

function encode(value: string): string { return encodeURIComponent(value) }

export function readCookie(request: Request, name: string): string | undefined {
  const cookie = request.headers.get('cookie') ?? ''
  for (const item of cookie.split(';')) {
    const [key, ...parts] = item.trim().split('=')
    if (key === name) return decodeURIComponent(parts.join('='))
  }
  return undefined
}

function cookie(name: string, value: string, maxAge: number): string {
  return [
    `${name}=${encode(value)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
    isProduction() ? 'Secure' : '',
  ].filter(Boolean).join('; ')
}

export function sessionCookie(sessionId: string): string {
  return cookie(SESSION_COOKIE, sessionId, sessionMaxAgeSeconds())
}

export function clearSessionCookie(): string { return cookie(SESSION_COOKIE, '', 0) }
export function clearOAuthStateCookie(): string { return cookie(OAUTH_STATE_COOKIE, '', 0) }
export function clearOAuthReturnCookie(): string { return cookie(OAUTH_RETURN_COOKIE, '', 0) }

export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  try {
    const parsed = new URL(value, 'https://famnesia.invalid')
    if (parsed.origin !== 'https://famnesia.invalid') return '/'
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch { return '/' }
}

export function oauthReturnCookie(value: string | null | undefined): string {
  return cookie(OAUTH_RETURN_COOKIE, safeReturnPath(value), 600)
}

export function readOAuthReturnPath(request: Request): string {
  return safeReturnPath(readCookie(request, OAUTH_RETURN_COOKIE))
}

function sign(value: string): string {
  return createHmac('sha256', sessionSecret()).update(value).digest('base64url')
}

export function createOAuthState(): { state: string; cookie: string } {
  const state = randomBytes(32).toString('base64url')
  return { state, cookie: cookie(OAUTH_STATE_COOKIE, `${state}.${sign(state)}`, 600) }
}

export function validateOAuthState(request: Request, returnedState: string | null): boolean {
  const stored = readCookie(request, OAUTH_STATE_COOKIE)
  if (!stored || !returnedState) return false
  const [state, signature] = stored.split('.')
  if (!state || !signature || state !== returnedState) return false
  const expected = Buffer.from(sign(state))
  const actual = Buffer.from(signature)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
