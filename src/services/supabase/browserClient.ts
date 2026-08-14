import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { parseSupabasePublicConfiguration } from '../../config/supabaseEnvironment'

let browserClient: SupabaseClient | undefined

export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient
  const config = parseSupabasePublicConfiguration(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
  browserClient = createClient(config.url, config.publishableKey, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
    global: { headers: { 'X-Client-Info': 'famnesia-web' } },
  })
  return browserClient
}
