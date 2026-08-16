import { describe, expect, it } from 'vitest'
import { checkCutoverServiceHealth, safeCutoverEnvironment, validateCutoverArtifacts } from '../scripts/lib/cutoverSafety.js'

const checksum = 'a'.repeat(64)
const valid = (now = new Date('2026-08-14T10:00:00Z')) => ({
  migration: { status: 'completed', sourceChecksum: checksum, warnings: [], reconciliation: { clean: true } },
  backup: { status: 'dry-run', sourceChecksum: checksum },
  rls: { status: 'passed', checkedAt: '2026-08-14T09:00:00Z', supabaseHost: 'project.supabase.co', workspaceId: 'workspace', checks: { memberRead: true, outsiderDenied: true, mediaDenied: true } },
  expectedSupabaseHost: 'project.supabase.co', now,
})

describe('CR10 cutover safety', () => {
  it('accepts fresh, matching and warning-free cutover evidence', () => {
    expect(validateCutoverArtifacts(valid())).toMatchObject({ clean: true, errors: [] })
  })

  it('rejects stale RLS evidence, checksum drift and unexplained warnings', () => {
    const evidence = valid(new Date('2026-08-16T10:00:00Z'))
    evidence.backup.sourceChecksum = 'b'.repeat(64)
    evidence.migration.warnings = ['missing image']
    const result = validateCutoverArtifacts(evidence)
    expect(result.clean).toBe(false)
    expect(result.errors.join(' ')).toMatch(/warnings.*checksums differ.*24 hours/i)
  })

  it('requires a synchronized Supabase selector set, maintenance freeze and approval ID', () => {
    const environment = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public', SUPABASE_SECRET_KEY: 'secret', DATA_BACKEND: 'supabase', AUTH_BACKEND: 'supabase', MEDIA_BACKEND: 'supabase', FAMNESIA_MAINTENANCE_MODE: 'read-only', SUPABASE_CUTOVER_APPROVAL_ID: 'CR10-authorized-20260814' }
    expect(safeCutoverEnvironment(environment)).toMatchObject({ host: 'project.supabase.co' })
    expect(() => safeCutoverEnvironment({ ...environment, DATA_BACKEND: 'drive' })).toThrow(/all three/)
    expect(() => safeCutoverEnvironment({ ...environment, FAMNESIA_MAINTENANCE_MODE: 'off' })).toThrow(/read-only/)
    expect(() => safeCutoverEnvironment({ ...environment, SUPABASE_CUTOVER_APPROVAL_ID: '' })).toThrow(/approval/i)
    expect(() => safeCutoverEnvironment({ ...environment, SUPABASE_SECRET_KEY: '' })).toThrow(/secret key/i)
  })

  it('uses only the server secret for PostgREST health without exposing it to Auth', async () => {
    const environment = safeCutoverEnvironment({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public', SUPABASE_SECRET_KEY: 'secret', DATA_BACKEND: 'supabase', AUTH_BACKEND: 'supabase', MEDIA_BACKEND: 'supabase', FAMNESIA_MAINTENANCE_MODE: 'read-only', SUPABASE_CUTOVER_APPROVAL_ID: 'CR10-authorized-20260814' })
    const calls: Array<{ input: string; init?: RequestInit }> = []
    const health = await checkCutoverServiceHealth(environment, async (input, init) => {
      calls.push({ input: String(input), init })
      return { ok: true }
    })

    expect(health).toEqual({ auth: true, rest: true })
    expect(calls).toEqual([
      { input: 'https://project.supabase.co/auth/v1/health', init: { headers: { apikey: 'public' } } },
      { input: 'https://project.supabase.co/rest/v1/', init: { method: 'HEAD', headers: { apikey: 'secret' } } },
    ])
  })
})
