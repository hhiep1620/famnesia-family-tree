import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError } from '../server/_server/http.js'
import { requireSupabaseAuth, type SupabaseAuthVerifier } from '../server/_server/auth.js'
import { createSupabaseAuthRepository, resetAuthRepositorySelectionForTests } from '../src/services/authRepository'
import { apiRequest, configureBearerAccessTokenProvider } from '../src/services/apiClient'
import type { Database } from '../src/types/database.generated'

const verifiedUser = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email: 'a@example.test', name: 'User A' }

function token(exp = Math.floor(Date.now() / 1000) + 3600): string {
  return `header.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`
}

function verifier(overrides?: Partial<SupabaseAuthVerifier>): SupabaseAuthVerifier {
  return {
    verify: vi.fn(async () => verifiedUser),
    provision: vi.fn(async () => undefined),
    ...overrides,
  }
}

function browserClient(accessToken = token(), initialSession = true) {
  const unsubscribe = vi.fn()
  let listener: ((event: string) => void) | undefined
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: initialSession ? { access_token: accessToken } : null }, error: null })),
    signInWithOAuth: vi.fn(async () => ({ data: { provider: 'google', url: 'https://accounts.google.test' }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    refreshSession: vi.fn(async () => ({ data: { session: { access_token: accessToken } }, error: null })),
    onAuthStateChange: vi.fn((next: (event: string) => void) => { listener = next; return { data: { subscription: { unsubscribe } } } }),
  }
  return { client: { auth } as unknown as SupabaseClient<Database>, auth, unsubscribe, emit: (event: string) => listener?.(event) }
}

function okSessionResponse() {
  return new Response(JSON.stringify({ authenticated: true, user: verifiedUser, expiresAt: new Date(Date.now() + 3600_000).toISOString() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  configureBearerAccessTokenProvider(undefined)
  resetAuthRepositorySelectionForTests()
})

describe('Supabase server authentication', () => {
  it('verifies the Bearer token and provisions the verified immutable identity', async () => {
    const authVerifier = verifier()
    const accessToken = token()
    const context = await requireSupabaseAuth(new Request('http://localhost/api/private', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', email: 'b@example.test' }),
    }), authVerifier)

    expect(context.backend).toBe('supabase')
    expect(context.user).toEqual(verifiedUser)
    expect(context.providerSubject).toBe(verifiedUser.id)
    expect(authVerifier.verify).toHaveBeenCalledWith(accessToken)
    expect(authVerifier.provision).toHaveBeenCalledWith(accessToken, verifiedUser)
  })

  it('rejects a request without a Bearer token before identity lookup', async () => {
    const authVerifier = verifier()
    await expect(requireSupabaseAuth(new Request('http://localhost/api/private'), authVerifier)).rejects.toMatchObject({ status: 401, code: 'AUTH_REQUIRED' })
    expect(authVerifier.verify).not.toHaveBeenCalled()
  })

  it('returns 401 for invalid or expired tokens and never substitutes request identity', async () => {
    const authVerifier = verifier({ verify: vi.fn(async () => { throw new AppError(401, 'SUPABASE_TOKEN_INVALID', 'expired') }) })
    await expect(requireSupabaseAuth(new Request('http://localhost/api/private', { headers: { Authorization: `Bearer ${token(1)}` } }), authVerifier))
      .rejects.toMatchObject({ status: 401, code: 'SUPABASE_TOKEN_INVALID' })
    expect(authVerifier.provision).not.toHaveBeenCalled()
  })
})

describe('Supabase browser auth adapter', () => {
  it('requests Google identity scopes without any Drive scope', async () => {
    const { client, auth } = browserClient()
    const repository = createSupabaseAuthRepository(client, () => 'http://localhost:3000')
    await repository.signIn()
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'http://localhost:3000', scopes: 'openid email profile' },
    })
    expect(JSON.stringify(auth.signInWithOAuth.mock.calls)).not.toContain('drive')
  })

  it('restores a session and installs its Bearer token for API calls', async () => {
    const accessToken = token()
    const { client } = browserClient(accessToken)
    const fetchMock = vi.fn(async () => okSessionResponse())
    vi.stubGlobal('fetch', fetchMock)
    const repository = createSupabaseAuthRepository(client, () => 'http://localhost:3000')

    const session = await repository.getSession()
    expect(session.user.id).toBe(verifiedUser.id)
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers
    expect(headers.get('Authorization')).toBe(`Bearer ${accessToken}`)
  })

  it('refreshes the Supabase session before revalidating it with the API', async () => {
    const { client, auth } = browserClient()
    vi.stubGlobal('fetch', vi.fn(async () => okSessionResponse()))
    const repository = createSupabaseAuthRepository(client, () => 'http://localhost:3000')
    await repository.refreshSession()
    expect(auth.refreshSession).toHaveBeenCalledOnce()
  })

  it('recovers a cross-tab persisted session when the initial lookup races storage restoration', async () => {
    const { client, auth } = browserClient(token(), false)
    vi.stubGlobal('fetch', vi.fn(async () => okSessionResponse()))
    const repository = createSupabaseAuthRepository(client, () => 'http://localhost:3000')
    await expect(repository.getSession()).resolves.toMatchObject({ authenticated: true })
    expect(auth.refreshSession).toHaveBeenCalledOnce()
  })

  it('deduplicates concurrent token refresh and propagates cross-tab sign-out events', async () => {
    const { client, auth, emit } = browserClient()
    vi.stubGlobal('fetch', vi.fn(async () => okSessionResponse()))
    const repository = createSupabaseAuthRepository(client, () => 'http://localhost:3000')
    const listener = vi.fn()
    repository.onAuthStateChange(listener)
    await Promise.all([repository.refreshSession(), repository.refreshSession()])
    expect(auth.refreshSession).toHaveBeenCalledOnce()
    emit('SIGNED_OUT')
    await new Promise((resolve) => queueMicrotask(resolve))
    expect(listener).toHaveBeenCalledOnce()
  })

  it('signs out, clears Bearer state and unsubscribes auth listeners', async () => {
    const { client, auth, unsubscribe } = browserClient()
    const fetchMock = vi.fn(async () => okSessionResponse())
    vi.stubGlobal('fetch', fetchMock)
    const repository = createSupabaseAuthRepository(client, () => 'http://localhost:3000')
    await repository.getSession()
    const dispose = repository.onAuthStateChange(() => undefined)
    await repository.signOut()
    await apiRequest('/api/unprotected')
    dispose()

    expect(auth.signOut).toHaveBeenCalledOnce()
    const lastHeaders = fetchMock.mock.calls.at(-1)?.[1]?.headers as Headers
    expect(lastHeaders.has('Authorization')).toBe(false)
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
