import { readCookie, SESSION_COOKIE } from './cookies.js'
import { AppError } from './http.js'
import { googleAccessToken } from './oauth.js'
import { sessions } from './sessionRepository.js'
import type { SafeUser } from './types.js'
import { backendSelection } from './backendSelectors.js'
import { createSupabaseAuthClient, createSupabaseUserClient } from './supabase/serverClient.js'

export interface AuthContext {
  backend: 'google-drive-oauth' | 'supabase'
  accessToken: string
  user: SafeUser
  expiresAt: string
  providerSubject: string
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization)
  if (!match) throw new AppError(401, 'AUTH_REQUIRED', 'A Supabase Bearer access token is required.')
  return match[1]
}

function jwtExpiry(token: string): string {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp?: unknown }
    if (typeof payload.exp === 'number' && Number.isFinite(payload.exp)) return new Date(payload.exp * 1000).toISOString()
  } catch { /* getUser already performs authoritative token validation. */ }
  return new Date(Date.now() + 60 * 60 * 1000).toISOString()
}

export interface VerifiedSupabaseIdentity {
  id: string
  email: string
  name: string
  avatarUrl?: string
}

export interface SupabaseAuthVerifier {
  verify(accessToken: string): Promise<VerifiedSupabaseIdentity>
  provision(accessToken: string, identity: VerifiedSupabaseIdentity): Promise<void>
}

function metadataText(metadata: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

const defaultSupabaseVerifier: SupabaseAuthVerifier = {
  async verify(accessToken) {
    // Supabase auth methods cannot run on a client configured with the custom
    // accessToken option. Verify the bearer token with an anonymous client,
    // then use a separate user-context client for RLS-protected queries.
    const client = createSupabaseAuthClient()
    const { data, error } = await client.auth.getUser(accessToken)
    const user = data.user
    if (error || !user?.id || !user.email) throw new AppError(401, 'SUPABASE_TOKEN_INVALID', 'The Supabase session is invalid or expired.')
    const metadata = user.user_metadata as Record<string, unknown>
    return {
      id: user.id,
      email: user.email,
      name: metadataText(metadata, 'full_name', 'name') ?? user.email,
      avatarUrl: metadataText(metadata, 'avatar_url', 'picture'),
    }
  },
  async provision(accessToken, identity) {
    const client = createSupabaseUserClient(accessToken)
    const { error } = await client.from('user_profiles').upsert({
      id: identity.id,
      email: identity.email,
      display_name: identity.name,
      avatar_url: identity.avatarUrl ?? null,
    }, { onConflict: 'id' })
    if (error) throw new AppError(503, 'SUPABASE_PROFILE_PROVISION_FAILED', 'Your authenticated profile could not be prepared.')
  },
}

export async function requireSupabaseAuth(request: Request, verifier: SupabaseAuthVerifier = defaultSupabaseVerifier): Promise<AuthContext> {
  const accessToken = bearerToken(request)
  const identity = await verifier.verify(accessToken)
  await verifier.provision(accessToken, identity)
  return {
    backend: 'supabase',
    accessToken,
    user: { id: identity.id, email: identity.email, name: identity.name, avatarUrl: identity.avatarUrl },
    expiresAt: jwtExpiry(accessToken),
    providerSubject: identity.id,
  }
}

async function requireGoogleDriveAuth(request: Request): Promise<AuthContext> {
  const sessionId = readCookie(request, SESSION_COOKIE)
  if (!sessionId) throw new AppError(401, 'AUTH_REQUIRED', 'Please sign in with Google.')
  const repository = sessions()
  const session = await repository.getSession(sessionId)
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    if (session) await repository.deleteSession(session.id)
    throw new AppError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.')
  }
  const accessToken = await googleAccessToken(session, repository)
  return {
    backend: 'google-drive-oauth',
    accessToken,
    user: { id: session.googleSub, email: session.email, name: session.displayName ?? session.email, avatarUrl: session.avatarUrl },
    expiresAt: session.expiresAt,
    providerSubject: session.googleSub,
  }
}

export async function requireAuth(request: Request): Promise<AuthContext> {
  return backendSelection().auth === 'supabase' ? requireSupabaseAuth(request) : requireGoogleDriveAuth(request)
}
