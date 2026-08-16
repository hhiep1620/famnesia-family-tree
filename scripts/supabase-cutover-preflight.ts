#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { checkCutoverServiceHealth, safeCutoverEnvironment, validateCutoverArtifacts, type CutoverMigrationReport, type CutoverRlsReport } from './lib/cutoverSafety.js'

function argument(name: string): string {
  const index = process.argv.indexOf(`--${name}`)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  if (!value || value.startsWith('--')) throw new Error(`Missing --${name}`)
  return value
}
async function json<T>(filename: string): Promise<T> {
  return JSON.parse(await readFile(path.resolve(filename), 'utf8')) as T
}
const environment = safeCutoverEnvironment(process.env)
const migration = await json<CutoverMigrationReport>(argument('migration-report'))
const backup = await json<CutoverMigrationReport>(argument('backup-report'))
const rls = await json<CutoverRlsReport>(argument('rls-report'))
const output = path.resolve(argument('report'))

const evidence = validateCutoverArtifacts({ migration, backup, rls, expectedSupabaseHost: environment.host })
const health = await checkCutoverServiceHealth(environment)
const clean = evidence.clean && health.auth && health.rest
const report = {
  status: clean ? 'ready' : 'blocked', checkedAt: new Date().toISOString(), targetHost: environment.host,
  selectors: environment.selectors, maintenanceMode: 'read-only', approvalId: process.env.SUPABASE_CUTOVER_APPROVAL_ID,
  sourceChecksum: evidence.sourceChecksum, workspaceId: evidence.workspaceId, health, errors: evidence.errors,
  cleanupDeferred: ['Google Picker/OAuth/session code', 'Drive persistence/media/collaboration adapters', 'Upstash', 'Google/Drive Vercel env', 'Drive backup'],
}
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
if (!clean) throw new Error(`CR10 preflight blocked. Report: ${output}`)
console.log(`CR10 preflight ready. Report: ${output}`)
