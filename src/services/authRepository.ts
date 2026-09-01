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
  async signIn() {
    const returnTo = `${window.location.pathname}${window.location.search}`
    window.location.assign(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`)
  },
  async signOut() { await authApi.logout() },
  reconnect: authApi.reconnect,
  refreshSession: authApi.getSession,
  onAuthStateChange: () => () => undefined,
}

export function createSupabaseAuthRepository(
  client: SupabaseClient<Database>,
  origin: () => string = () => window.location.origin,
): AuthRepositoryContract {
  let refreshFlight: ReturnType<typeof client.auth.refreshSession> | undefined
  const RETURN_TO_KEY = 'famnesia:auth:returnTo'
  const captureReturnTo = () => {
    if (typeof window === 'undefined') return
    const path = `${window.location.pathname}${window.location.search}`
    if (path.startsWith('/join/')) window.sessionStorage.setItem(RETURN_TO_KEY, path)
  }
  const restoreReturnTo = () => {
    if (typeof window === 'undefined') return
    const path = window.sessionStorage.getItem(RETURN_TO_KEY)
    if (!path?.startsWith('/join/') || path.startsWith('//')) return
    window.sessionStorage.removeItem(RETURN_TO_KEY)
    window.history.replaceState({}, '', path)
  }
  const refreshLocalSession = () => {
    refreshFlight ??= client.auth.refreshSession().finally(() => { refreshFlight = undefined })
    return refreshFlight
  }
  const startGoogleSignIn = async () => {
    captureReturnTo()
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
    let { data, error } = await client.auth.getSession()
    if (error) throw new ApiError(401, 'SUPABASE_SESSION_INVALID', 'Phiên Supabase không hợp lệ hoặc đã hết hạn.')
    if (!data.session) {
      const refreshed = await refreshLocalSession()
      data = refreshed.data
      error = refreshed.error
    }
    if (error || !data.session) throw new ApiError(401, 'AUTH_REQUIRED', 'Bạn chưa đăng nhập.')
    installTokenProvider()
    try {
      const session = await authApi.getSession()
      restoreReturnTo()
      return session
    }
    catch (caught) {
      if (!(caught instanceof ApiError) || caught.status !== 401) throw caught
      const refreshed = await refreshLocalSession()
      if (refreshed.error || !refreshed.data.session) throw caught
      installTokenProvider()
      const session = await authApi.getSession()
      restoreReturnTo()
      return session
    }
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
      const { error } = await refreshLocalSession()
      if (error) {
        configureBearerAccessTokenProvider(undefined)
        throw new ApiError(401, 'SUPABASE_SESSION_EXPIRED', 'Phiên Supabase đã hết hạn. Hãy đăng nhập lại.')
      }
      return verifiedSession()
    },
    onAuthStateChange(listener) {
      const { data } = client.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') configureBearerAccessTokenProvider(undefined)
        queueMicrotask(listener)
      })
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
