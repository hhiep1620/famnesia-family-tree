import { readCookie, SESSION_COOKIE } from './cookies.js'
import { AppError } from './http.js'
import { googleAccessToken } from './oauth.js'
import { sessions, type SessionRepository } from './sessionRepository.js'
import type { AuthSession, SafeUser } from './types.js'
import { requireGoogleDriveAuthBackend } from './backendSelectors.js'

export interface AuthContext {
  session: AuthSession
  repository: SessionRepository
  accessToken: string
  user: SafeUser
}

export async function requireAuth(request: Request): Promise<AuthContext> {
  requireGoogleDriveAuthBackend()
  const sessionId = readCookie(request, SESSION_COOKIE)
  if (!sessionId) throw new AppError(401, 'AUTH_REQUIRED', 'Please sign in with Google.')
  const repository = sessions()
  const session = await repository.getSession(sessionId)
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    if (session) await repository.deleteSession(session.id)
    throw new AppError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.')
  }
  const accessToken = await googleAccessToken(session, repository)
  return { session, repository, accessToken, user: { id: session.googleSub, email: session.email, name: session.displayName ?? session.email, avatarUrl: session.avatarUrl } }
}
