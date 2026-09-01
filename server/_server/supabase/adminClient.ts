import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { parseSupabaseServerConfiguration } from '../../../src/config/supabaseEnvironment.js'
import type { Database } from '../../../src/types/database.generated.js'

export function createSupabaseAdminClient(environment = process.env): SupabaseClient<Database> {
  const config = parseSupabaseServerConfiguration(environment, true)
  return createClient<Database>(config.url, config.secretKey!, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { 'X-Client-Info': 'famnesia-admin-migration' } },
  })
}
