import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { parseSupabasePublicConfiguration } from '../../config/supabaseEnvironment'
import type { Database } from '../../types/database.generated'

let browserClient: SupabaseClient<Database> | undefined

export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient
  const config = parseSupabasePublicConfiguration(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
  browserClient = createClient<Database>(config.url, config.publishableKey, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
    global: { headers: { 'X-Client-Info': 'famnesia-web' } },
  })
  return browserClient
}
