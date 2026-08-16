export interface SupabasePublicConfiguration {
  url: string
  publishableKey: string
}

export interface SupabaseServerConfiguration extends SupabasePublicConfiguration {
  secretKey?: string
}

export class SupabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SupabaseConfigurationError'
  }
}

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim()
  if (!normalized) throw new SupabaseConfigurationError(`Missing required Supabase environment variable: ${name}`)
  return normalized
}

function validProjectUrl(raw: string): string {
  let url: URL
  try { url = new URL(raw) }
  catch { throw new SupabaseConfigurationError('SUPABASE_URL must be a valid absolute URL.') }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new SupabaseConfigurationError('SUPABASE_URL must use HTTPS except for localhost development.')
  }
  return url.toString().replace(/\/$/, '')
}

function jwtRole(key: string): string | undefined {
  const payload = key.split('.')[1]
  if (!payload) return undefined
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
    const value = JSON.parse(decoded) as { role?: unknown }
    return typeof value.role === 'string' ? value.role : undefined
  } catch { return undefined }
}

function validPublishableKey(raw: string): string {
  if (/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(raw)) return raw
  if (raw.startsWith('eyJ') && jwtRole(raw) === 'anon') return raw
  throw new SupabaseConfigurationError('SUPABASE_PUBLISHABLE_KEY must be an sb_publishable key (or a local legacy anon key).')
}

function validSecretKey(raw: string): string {
  if (/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(raw)) return raw
  if (raw.startsWith('eyJ') && jwtRole(raw) === 'service_role') return raw
  throw new SupabaseConfigurationError('SUPABASE_SECRET_KEY must be an sb_secret key (or a local legacy service_role key).')
}

export function parseSupabasePublicConfiguration(url: string | undefined, publishableKey: string | undefined): SupabasePublicConfiguration {
  return {
    url: validProjectUrl(required(url, 'SUPABASE_URL')),
    publishableKey: validPublishableKey(required(publishableKey, 'SUPABASE_PUBLISHABLE_KEY')),
  }
}

export function parseSupabaseServerConfiguration(
  environment: Partial<Record<'SUPABASE_URL' | 'SUPABASE_PUBLISHABLE_KEY' | 'SUPABASE_SECRET_KEY', string | undefined>>,
  requireSecret = false,
): SupabaseServerConfiguration {
  const publicConfiguration = parseSupabasePublicConfiguration(environment.SUPABASE_URL, environment.SUPABASE_PUBLISHABLE_KEY)
  const rawSecret = environment.SUPABASE_SECRET_KEY?.trim()
  if (requireSecret && !rawSecret) throw new SupabaseConfigurationError('Missing required Supabase environment variable: SUPABASE_SECRET_KEY')
  return { ...publicConfiguration, ...(rawSecret ? { secretKey: validSecretKey(rawSecret) } : {}) }
}

export function supabaseConfigurationStatus(
  environment: Partial<Record<'SUPABASE_URL' | 'SUPABASE_PUBLISHABLE_KEY' | 'SUPABASE_SECRET_KEY', string | undefined>>,
) {
  let projectHost: string | undefined
  try { projectHost = environment.SUPABASE_URL ? new URL(environment.SUPABASE_URL).host : undefined } catch { /* reported by configured=false */ }
  try {
    parseSupabaseServerConfiguration(environment)
    return { configured: true, projectHost, hasPublishableKey: true, hasSecretKey: Boolean(environment.SUPABASE_SECRET_KEY?.trim()) }
  } catch {
    return { configured: false, projectHost, hasPublishableKey: Boolean(environment.SUPABASE_PUBLISHABLE_KEY?.trim()), hasSecretKey: Boolean(environment.SUPABASE_SECRET_KEY?.trim()) }
  }
}
