import type { GoogleUser } from '../types/family'
import * as authApi from './authApi'
import { ApiError, configureBearerAccessTokenProvider } from './apiClient'
import { getSupabaseBrowserClient } from './supabase/browserClient'
import type { Database } from '../types/database.generated'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface AuthSessionInfo {
  authenticated: true
  user: GoogleUser
  expiresAt: string
}

export interface AuthRepositoryContract {
  readonly backend: 'google-drive-oauth' | 'supabase'
  getSession(): Promise<AuthSessionInfo>
  signIn(): Promise<void>
  signOut(): Promise<void>
  reconnect(): Promise<void>
  refreshSession(): Promise<AuthSessionInfo>
  onAuthStateChange(listener: () => void): () => void
}

export const googleDriveAuthRepository: AuthRepositoryContract = {
  backend: 'google-drive-oauth',
  getSession: authApi.getSession,
  async signIn() { window.location.assign('/api/auth/login') },
  async signOut() { await authApi.logout() },
  reconnect: authApi.reconnect,
  refreshSession: authApi.getSession,
  onAuthStateChange: () => () => undefined,
}

export function createSupabaseAuthRepository(
  client: SupabaseClient<Database>,
  origin: () => string = () => window.location.origin,
): AuthRepositoryContract {
  const startGoogleSignIn = async () => {
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: origin(), scopes: 'openid email profile' },
    })
    if (error) throw new ApiError(502, 'SUPABASE_GOOGLE_SIGN_IN_FAILED', error.message)
  }
  const installTokenProvider = () => configureBearerAccessTokenProvider(async () => {
    const { data } = await client.auth.getSession()
    return data.session?.access_token
  })
  const verifiedSession = async (): Promise<AuthSessionInfo> => {
    const { data, error } = await client.auth.getSession()
    if (error) throw new ApiError(401, 'SUPABASE_SESSION_INVALID', 'Phiên Supabase không hợp lệ hoặc đã hết hạn.')
    if (!data.session) throw new ApiError(401, 'AUTH_REQUIRED', 'Bạn chưa đăng nhập.')
    installTokenProvider()
    return authApi.getSession()
  }
  return {
    backend: 'supabase',
    getSession: verifiedSession,
    signIn: startGoogleSignIn,
    async signOut() {
      const { error } = await client.auth.signOut()
      configureBearerAccessTokenProvider(undefined)
      if (error) throw new ApiError(502, 'SUPABASE_SIGN_OUT_FAILED', error.message)
    },
    reconnect: startGoogleSignIn,
    async refreshSession() {
      const { error } = await client.auth.refreshSession()
      if (error) {
        configureBearerAccessTokenProvider(undefined)
        throw new ApiError(401, 'SUPABASE_SESSION_EXPIRED', 'Phiên Supabase đã hết hạn. Hãy đăng nhập lại.')
      }
      return verifiedSession()
    },
    onAuthStateChange(listener) {
      const { data } = client.auth.onAuthStateChange(() => queueMicrotask(listener))
      return () => data.subscription.unsubscribe()
    },
  }
}

let selectedRepository: Promise<AuthRepositoryContract> | undefined

export function resolveAuthRepository(): Promise<AuthRepositoryContract> {
  selectedRepository ??= authApi.getAuthConfig().then(({ authBackend }) => authBackend === 'supabase'
    ? createSupabaseAuthRepository(getSupabaseBrowserClient())
    : googleDriveAuthRepository)
  return selectedRepository
}

export function resetAuthRepositorySelectionForTests(): void {
  selectedRepository = undefined
  configureBearerAccessTokenProvider(undefined)
}
