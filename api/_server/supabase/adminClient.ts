import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { parseSupabaseServerConfiguration } from '../../../src/config/supabaseEnvironment.js'

export function createSupabaseAdminClient(environment = process.env): SupabaseClient {
  const config = parseSupabaseServerConfiguration(environment, true)
  return createClient(config.url, config.secretKey!, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { 'X-Client-Info': 'famnesia-admin-migration' } },
  })
}
