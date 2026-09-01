import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { parseSupabaseServerConfiguration } from '../../../src/config/supabaseEnvironment.js'
import type { Database } from '../../../src/types/database.generated.js'

function clientOptions() {
  return {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { 'X-Client-Info': 'famnesia-vercel-user' } },
  } as const
}

export function createSupabaseAuthClient(environment = process.env): SupabaseClient<Database> {
  const config = parseSupabaseServerConfiguration(environment)
  return createClient<Database>(config.url, config.publishableKey, clientOptions())
}

export function createSupabaseUserClient(accessToken: string, environment = process.env): SupabaseClient<Database> {
  const token = accessToken.trim()
  if (!token) throw new Error('A Supabase Bearer access token is required for a user-context client.')
  const config = parseSupabaseServerConfiguration(environment)
  return createClient<Database>(config.url, config.publishableKey, {
    accessToken: async () => token,
    ...clientOptions(),
  })
}
