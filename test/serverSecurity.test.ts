import { beforeAll, describe, expect, it } from 'vitest'
import { createOAuthState, oauthReturnCookie, readCookie, readOAuthReturnPath, SESSION_COOKIE, sessionCookie, validateOAuthState } from '../server/_server/cookies.js'
import { assertSameOrigin } from '../server/_server/http.js'
import { collaborationApprovalEnabled, googlePickerEnv } from '../server/_server/env.js'
import { sessions } from '../server/_server/sessionRepository.js'
import { decryptToken, encryptToken } from '../server/_server/tokenEncryption.js'
import type { AuthSession } from '../server/_server/types.js'

beforeAll(() => {
  process.env.SESSION_SECRET = 'test-session-secret-with-at-least-32-characters'
  process.env.TOKEN_ENCRYPTION_KEY = 'test-encryption-key-with-at-least-32-characters'
  process.env.SESSION_STORE_DRIVER = 'memory'
  process.env.SESSION_MAX_AGE_SECONDS = '604800'
})

describe('server security boundary', () => {
  it('encrypts refresh tokens with authenticated encryption', () => {
    const encrypted = encryptToken('refresh-token-value')
    expect(encrypted).not.toContain('refresh-token-value')
    expect(decryptToken(encrypted)).toBe('refresh-token-value')
    const parts = encrypted.split('.')
    parts[2] = `${parts[2]?.startsWith('A') ? 'B' : 'A'}${parts[2]?.slice(1)}`
    expect(() => decryptToken(parts.join('.'))).toThrow()
  })

  it('creates an HttpOnly SameSite session cookie', () => {
    const value = sessionCookie('opaque-session-id')
    expect(value).toContain(`${SESSION_COOKIE}=opaque-session-id`)
    expect(value).toContain('HttpOnly')
    expect(value).toContain('SameSite=Lax')
    expect(readCookie(new Request('http://localhost', { headers: { cookie: value } }), SESSION_COOKIE)).toBe('opaque-session-id')
  })

  it('rejects a forged OAuth state', () => {
    const state = createOAuthState()
    const request = new Request('http://localhost/api/auth/callback', { headers: { cookie: state.cookie } })
    expect(validateOAuthState(request, state.state)).toBe(true)
    expect(validateOAuthState(request, `${state.state}forged`)).toBe(false)
  })

  it('preserves only same-origin OAuth return paths', () => {
    const request = new Request('http://localhost/api/auth/callback', { headers: { cookie: oauthReturnCookie('/join/aB3cD4e5?from=home') } })
    expect(readOAuthReturnPath(request)).toBe('/join/aB3cD4e5?from=home')
    const attack = new Request('http://localhost/api/auth/callback', { headers: { cookie: oauthReturnCookie('//evil.example/steal') } })
    expect(readOAuthReturnPath(attack)).toBe('/')
  })

  it('keeps sessions in the repository until their TTL expires', async () => {
    const session: AuthSession = {
      id: 'session-test', googleSub: 'google-user', email: 'member@example.com',
      encryptedRefreshToken: encryptToken('refresh'), createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }
    await sessions().saveSession(session)
    expect((await sessions().getSession(session.id))?.email).toBe(session.email)
    await sessions().deleteSession(session.id)
    expect(await sessions().getSession(session.id)).toBeNull()
  })

  it('rejects cross-origin state-changing requests', () => {
    expect(() => assertSameOrigin(new Request('https://family.example/api/data', { method: 'POST', headers: { origin: 'https://evil.example' } }))).toThrow()
    expect(() => assertSameOrigin(new Request('https://family.example/api/data', { method: 'POST', headers: { origin: 'https://family.example' } }))).not.toThrow()
  })

  it('requires a real-looking Google Picker browser key and keeps approval disabled by default', () => {
    process.env.GOOGLE_CLIENT_ID = '123456789012-example.apps.googleusercontent.com'
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/auth/callback'
    process.env.GOOGLE_PICKER_API_KEY = 'not-a-google-api-key'
    delete process.env.COLLAB_APPROVAL_V2_ENABLED
    expect(() => googlePickerEnv()).toThrow(/beginning with AIza/)
    process.env.GOOGLE_PICKER_API_KEY = `AIza${'A'.repeat(32)}`
    expect(googlePickerEnv()).toMatchObject({ apiKey: process.env.GOOGLE_PICKER_API_KEY, appId: '123456789012' })
    expect(collaborationApprovalEnabled()).toBe(false)
    process.env.COLLAB_APPROVAL_V2_ENABLED = 'true'
    expect(collaborationApprovalEnabled()).toBe(true)
    delete process.env.COLLAB_APPROVAL_V2_ENABLED
  })
})
