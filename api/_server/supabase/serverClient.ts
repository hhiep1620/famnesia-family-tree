import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { parseSupabaseServerConfiguration } from '../../../src/config/supabaseEnvironment.js'

export function createSupabaseUserClient(accessToken: string, environment = process.env): SupabaseClient {
  const token = accessToken.trim()
  if (!token) throw new Error('A Supabase Bearer access token is required for a user-context client.')
  const config = parseSupabaseServerConfiguration(environment)
  return createClient(config.url, config.publishableKey, {
    accessToken: async () => token,
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { 'X-Client-Info': 'famnesia-vercel-user' } },
  })
}
