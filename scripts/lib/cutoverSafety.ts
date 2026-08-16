export interface CutoverMigrationReport {
  status?: unknown
  sourceChecksum?: unknown
  warnings?: unknown
  reconciliation?: { clean?: unknown }
}

export interface CutoverRlsReport {
  status?: unknown
  checkedAt?: unknown
  supabaseHost?: unknown
  workspaceId?: unknown
  checks?: Record<string, unknown>
}

export interface CutoverArtifacts {
  migration: CutoverMigrationReport
  backup: CutoverMigrationReport
  rls: CutoverRlsReport
  expectedSupabaseHost: string
  now?: Date
}

export interface CutoverEnvironment {
  url: string
  host: string
  publishableKey: string
  secretKey: string
  selectors: { data?: string; auth?: string; media?: string }
}

type HealthFetch = (input: string | URL, init?: RequestInit) => Promise<{ ok: boolean }>

export function validateCutoverArtifacts(input: CutoverArtifacts) {
  const errors: string[] = []
  const warnings = Array.isArray(input.migration.warnings) ? input.migration.warnings : []
  if (input.migration.status !== 'completed') errors.push('Final migration report must have status=completed.')
  if (input.migration.reconciliation?.clean !== true) errors.push('Final migration reconciliation must be clean.')
  if (warnings.length) errors.push('Final migration report contains warnings that require explanation.')
  if (!/^[a-f0-9]{64}$/.test(String(input.migration.sourceChecksum ?? ''))) errors.push('Final migration source checksum is invalid.')
  if (!['dry-run', 'completed'].includes(String(input.backup.status ?? ''))) errors.push('Final backup report must be a clean dry-run/completed report.')
  if (input.backup.sourceChecksum !== input.migration.sourceChecksum) errors.push('Final backup and migration source checksums differ.')
  if (input.rls.status !== 'passed') errors.push('Remote RLS report must have status=passed.')
  if (input.rls.supabaseHost !== input.expectedSupabaseHost) errors.push('Remote RLS report belongs to a different Supabase host.')
  const checkValues = Object.values(input.rls.checks ?? {})
  if (!checkValues.length || checkValues.some((value) => value !== true)) errors.push('Every remote RLS check must pass.')
  const checkedAt = typeof input.rls.checkedAt === 'string' ? Date.parse(input.rls.checkedAt) : Number.NaN
  const age = (input.now ?? new Date()).getTime() - checkedAt
  if (!Number.isFinite(checkedAt) || age < 0 || age > 24 * 60 * 60 * 1000) errors.push('Remote RLS evidence must be no more than 24 hours old.')
  return { clean: errors.length === 0, errors, sourceChecksum: input.migration.sourceChecksum, workspaceId: input.rls.workspaceId }
}

export function safeCutoverEnvironment(environment: NodeJS.ProcessEnv): CutoverEnvironment {
  const url = environment.SUPABASE_URL?.trim() || environment.VITE_SUPABASE_URL?.trim()
  const publishableKey = environment.SUPABASE_PUBLISHABLE_KEY?.trim() || environment.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  const secretKey = environment.SUPABASE_SECRET_KEY?.trim()
  if (!url || !publishableKey || !secretKey) throw new Error('Supabase URL, publishable key and server-only secret key are required.')
  const host = new URL(url).host
  const selectors = { data: environment.DATA_BACKEND?.trim(), auth: environment.AUTH_BACKEND?.trim(), media: environment.MEDIA_BACKEND?.trim() }
  if (selectors.data !== 'supabase' || selectors.auth !== 'supabase' || selectors.media !== 'supabase') throw new Error('Preflight requires all three staged selectors to be supabase.')
  if (!/^CR10-[A-Za-z0-9._-]{8,80}$/.test(environment.SUPABASE_CUTOVER_APPROVAL_ID?.trim() ?? '')) throw new Error('SUPABASE_CUTOVER_APPROVAL_ID is missing or invalid.')
  if ((environment.FAMNESIA_MAINTENANCE_MODE?.trim() || 'off') !== 'read-only') throw new Error('Preflight requires FAMNESIA_MAINTENANCE_MODE=read-only.')
  return { url, host, publishableKey, secretKey, selectors }
}

export async function checkCutoverServiceHealth(environment: CutoverEnvironment, fetcher: HealthFetch = fetch) {
  const [auth, rest] = await Promise.all([
    fetcher(`${environment.url}/auth/v1/health`, { headers: { apikey: environment.publishableKey } }),
    fetcher(`${environment.url}/rest/v1/`, { method: 'HEAD', headers: { apikey: environment.secretKey } }),
  ])
  return { auth: auth.ok, rest: rest.ok }
}
