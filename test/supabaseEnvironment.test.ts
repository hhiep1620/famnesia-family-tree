import { describe, expect, it } from 'vitest'
import { parseSupabasePublicConfiguration, parseSupabaseServerConfiguration, supabaseConfigurationStatus } from '../src/config/supabaseEnvironment.js'
import { createSupabaseAdminClient } from '../server/_server/supabase/adminClient.js'
import { createSupabaseUserClient } from '../server/_server/supabase/serverClient.js'

const publishable = `sb_publishable_${'p'.repeat(24)}`
const secret = `sb_secret_${'s'.repeat(24)}`
const environment = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: publishable, SUPABASE_SECRET_KEY: secret }

describe('Supabase environment boundary', () => {
  it('accepts hosted HTTPS and local HTTP project URLs', () => {
    expect(parseSupabasePublicConfiguration(environment.SUPABASE_URL, publishable)).toEqual({ url: environment.SUPABASE_URL, publishableKey: publishable })
    expect(parseSupabasePublicConfiguration('http://127.0.0.1:54321/', publishable).url).toBe('http://127.0.0.1:54321')
  })

  it('rejects missing, secret, insecure and malformed public configuration', () => {
    expect(() => parseSupabasePublicConfiguration(undefined, undefined)).toThrow(/SUPABASE_URL/)
    expect(() => parseSupabasePublicConfiguration('http://example.com', publishable)).toThrow(/HTTPS/)
    expect(() => parseSupabasePublicConfiguration(environment.SUPABASE_URL, secret)).toThrow(/publishable/)
  })

  it('requires the admin secret only for admin and migration clients', () => {
    expect(parseSupabaseServerConfiguration({ SUPABASE_URL: environment.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: publishable })).not.toHaveProperty('secretKey')
    expect(() => createSupabaseAdminClient({ SUPABASE_URL: environment.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: publishable })).toThrow(/SUPABASE_SECRET_KEY/)
    expect(createSupabaseAdminClient(environment)).toBeDefined()
  })

  it('creates a fresh request-scoped user client and never reports key values', () => {
    const left = createSupabaseUserClient('user-jwt', environment)
    const right = createSupabaseUserClient('user-jwt', environment)
    expect(left).not.toBe(right)
    expect(supabaseConfigurationStatus(environment)).toEqual({ configured: true, projectHost: 'example.supabase.co', hasPublishableKey: true, hasSecretKey: true })
    expect(JSON.stringify(supabaseConfigurationStatus(environment))).not.toContain(publishable)
    expect(JSON.stringify(supabaseConfigurationStatus(environment))).not.toContain(secret)
  })
})
