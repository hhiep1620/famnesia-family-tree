import { randomBytes } from 'node:crypto'
import { googleOAuthEnv, sessionMaxAgeSeconds } from './env.js'
import { AppError } from './http.js'
import { decryptToken, encryptToken } from './tokenEncryption.js'
import type { SessionRepository } from './sessionRepository.js'
import type { AuthSession } from './types.js'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
const SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.file']

interface TokenResponse {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  error?: string
  error_description?: string
}

interface UserInfo { sub?: string; email?: string; name?: string; picture?: string }

export function authorizationUrl(state: string, reconnect = false): string {
  const env = googleOAuthEnv()
  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    state,
    prompt: reconnect ? 'consent select_account' : 'select_account consent',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  })
  const result = await response.json() as TokenResponse
  if (!response.ok || !result.access_token) {
    const reconnect = result.error === 'invalid_grant'
    throw new AppError(reconnect ? 428 : 502, reconnect ? 'GOOGLE_RECONNECT_REQUIRED' : 'GOOGLE_OAUTH_FAILED', reconnect ? 'Google access has expired or was revoked. Please reconnect.' : 'Google authorization could not be completed.')
  }
  return result
}

export async function exchangeCode(code: string, repository: SessionRepository): Promise<AuthSession> {
  const env = googleOAuthEnv()
  const token = await tokenRequest(new URLSearchParams({
    code, client_id: env.clientId, client_secret: env.clientSecret,
    redirect_uri: env.redirectUri, grant_type: 'authorization_code',
  }))
  const userResponse = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${token.access_token}` } })
  const user = await userResponse.json() as UserInfo
  if (!userResponse.ok || !user.sub || !user.email) throw new AppError(502, 'GOOGLE_PROFILE_FAILED', 'Google account details could not be read.')
  const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds() * 1000).toISOString()
  const previousRefresh = await repository.getRefreshToken(user.sub)
  const encryptedRefreshToken = token.refresh_token ? encryptToken(token.refresh_token) : previousRefresh
  if (!encryptedRefreshToken) throw new AppError(428, 'GOOGLE_RECONNECT_REQUIRED', 'Google did not return offline access. Please reconnect and grant access.')
  await repository.saveRefreshToken(user.sub, encryptedRefreshToken, expiresAt)
  return {
    id: randomBytes(32).toString('base64url'), googleSub: user.sub, email: user.email,
    displayName: user.name, avatarUrl: user.picture, encryptedRefreshToken,
    encryptedAccessToken: encryptToken(token.access_token!),
    accessTokenExpiresAt: new Date(Date.now() + Math.max(30, (token.expires_in ?? 3600) - 60) * 1000).toISOString(),
    createdAt: new Date().toISOString(), expiresAt,
  }
}

export async function googleAccessToken(session: AuthSession, repository: SessionRepository): Promise<string> {
  if (session.encryptedAccessToken && session.accessTokenExpiresAt && new Date(session.accessTokenExpiresAt).getTime() > Date.now()) {
    return decryptToken(session.encryptedAccessToken)
  }
  const env = googleOAuthEnv()
  const token = await tokenRequest(new URLSearchParams({
    client_id: env.clientId, client_secret: env.clientSecret,
    refresh_token: decryptToken(session.encryptedRefreshToken), grant_type: 'refresh_token',
  }))
  session.encryptedAccessToken = encryptToken(token.access_token!)
  session.accessTokenExpiresAt = new Date(Date.now() + Math.max(30, (token.expires_in ?? 3600) - 60) * 1000).toISOString()
  session.lastSeenAt = new Date().toISOString()
  await repository.saveSession(session)
  return token.access_token!
}
