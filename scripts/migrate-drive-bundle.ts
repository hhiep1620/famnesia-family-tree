#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { inspectDriveBundle, reconciliationReport, redactOwner, storageFamilyData } from './lib/driveMigration.js'

type Args = Record<string, string | boolean>
function parseArgs(values: string[]): Args {
  const result: Args = {}
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (!value.startsWith('--')) throw new Error(`Tham số không hợp lệ: ${value}`)
    const key = value.slice(2)
    const next = values[index + 1]
    if (!next || next.startsWith('--')) result[key] = true
    else { result[key] = next; index += 1 }
  }
  return result
}
function required(args: Args, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Thiếu --${key}`)
  return value.trim()
}
function assertEnvironment(url: string, args: Args) {
  const host = new URL(url).host
  const local = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)
  if (local) return
  if (process.env.VERCEL_ENV === 'production' || process.env.MIGRATION_ENVIRONMENT === 'production') throw new Error('CR09 cấm migration Production; dùng CR10 cutover runbook.')
  if (args['allow-remote-preview'] !== true || args['confirm-host'] !== host) throw new Error(`Remote Preview yêu cầu --allow-remote-preview --confirm-host ${host}`)
}
async function writeReports(reportPath: string, report: Record<string, unknown>) {
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
  const rows = [
    '# Famnesia Drive Migration Report', '',
    `- Status: ${report.status}`, `- Run: ${report.runId ?? 'dry-run'}`, `- Workspace: ${report.workspaceId ?? 'not-created'}`,
    `- Owner fingerprint: ${report.ownerFingerprint}`, `- Source checksum: ${report.sourceChecksum}`,
    `- Normalized hash: ${report.normalizedHash}`, `- Counts: ${JSON.stringify(report.counts)}`,
    `- Media: ${report.mediaFiles} files / ${report.mediaBytes} bytes`, `- Warnings: ${JSON.stringify(report.warnings ?? [])}`,
    `- Reconciliation: ${JSON.stringify(report.reconciliation ?? 'not-run')}`, '',
    'No Google token, Supabase key, or plaintext owner email is stored in this report.', '',
  ]
  await writeFile(reportPath.replace(/\.json$/i, '.md'), rows.join('\n'), { mode: 0o600 })
}

const args = parseArgs(process.argv.slice(2))
const bundle = required(args, 'bundle')
const ownerEmail = required(args, 'owner-email').toLowerCase()
const reportPath = path.resolve(typeof args.report === 'string' ? args.report : `migration-report-${Date.now()}.json`)
const inspection = await inspectDriveBundle(bundle)
const runId = typeof args['run-id'] === 'string' ? args['run-id'] : randomUUID()
const workspaceId = typeof args['workspace-id'] === 'string' ? args['workspace-id'] : randomUUID()
const baseReport: Record<string, unknown> = {
  status: args['dry-run'] ? 'dry-run' : 'prepared', runId, workspaceId,
  ownerFingerprint: redactOwner(ownerEmail), sourceChecksum: inspection.sourceChecksum,
  manifestChecksum: inspection.manifestChecksum, normalizedHash: inspection.normalizedHash,
  sourceSchemaVersion: inspection.sourceSchemaVersion, counts: inspection.counts,
  mediaFiles: inspection.media.length, mediaBytes: inspection.bytes, warnings: inspection.warnings,
}
if (args['dry-run']) {
  await writeReports(reportPath, baseReport)
  console.log(`Dry run clean. Report: ${reportPath}`)
  process.exit(0)
}

const url = process.env.SUPABASE_URL?.trim()
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()
if (!url || !secretKey) throw new Error('SUPABASE_URL và SUPABASE_SECRET_KEY là bắt buộc.')
assertEnvironment(url, args)
const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
const owner = await admin.from('user_profiles').select('id').eq('email', ownerEmail).maybeSingle()
if (owner.error) throw owner.error
if (!owner.data) throw new Error('Không tìm thấy owner trong Supabase Auth/user_profiles.')

if (args['rollback-run']) {
  const rollbackRun = required(args, 'rollback-run')
  const run = await admin.from('migration_runs').select('report').eq('id', rollbackRun).single()
  if (run.error) throw run.error
  const uploadedPaths = Array.isArray((run.data.report as Record<string, unknown>)?.uploadedPaths) ? (run.data.report as { uploadedPaths: string[] }).uploadedPaths : []
  if (uploadedPaths.length) {
    const removed = await admin.storage.from('family-media').remove(uploadedPaths)
    if (removed.error) throw removed.error
  }
  const rolledBack = await admin.rpc('rollback_incomplete_drive_migration', { p_run_id: rollbackRun })
  if (rolledBack.error) throw rolledBack.error
  await writeReports(reportPath, { ...baseReport, status: 'rolled-back', runId: rollbackRun, uploadedPaths })
  console.log(`Rolled back incomplete run ${rollbackRun}.`)
  process.exit(0)
}

const started = await admin.rpc('start_drive_bundle_migration', {
  p_workspace_id: workspaceId, p_run_id: runId, p_owner_user_id: owner.data.id,
  p_name: required(args, 'workspace-name'), p_legacy_drive_folder_id: required(args, 'legacy-drive-folder-id'),
  p_source_revision: inspection.manifest.sourceRevision ?? '', p_source_checksum: inspection.sourceChecksum,
  p_manifest_checksum: inspection.manifestChecksum,
})
if (started.error) throw started.error
const startedValue = started.data as { status: string; workspaceId: string; runId: string; resumeCursor: number }
if (startedValue.status === 'already_completed') {
  await writeReports(reportPath, { ...baseReport, status: 'already-completed', workspaceId: startedValue.workspaceId, runId: startedValue.runId })
  console.log(`Already migrated as ${startedValue.workspaceId}.`)
  process.exit(0)
}
const actualWorkspaceId = startedValue.workspaceId
const actualRunId = startedValue.runId
const transformed = storageFamilyData(inspection, actualWorkspaceId, actualRunId)
const mediaMetadata = inspection.media.map((item) => {
  const record = transformed.media.find((media) => media.id === item.mediaId)!
  return { mediaId: item.mediaId, path: record.storagePath!, sha256: item.sha256, bytes: item.bytes, mimeType: item.mimeType }
})
const uploadedPaths: string[] = []
let lastReconciliation: Record<string, unknown> | undefined
try {
  for (let index = 0; index < inspection.media.length; index += 1) {
    const item = inspection.media[index]
    const metadata = mediaMetadata[index]
    const buffer = await readFile(item.absolutePath)
    const existing = await admin.storage.from('family-media').download(metadata.path)
    if (!existing.error) {
      const bytes = Buffer.from(await existing.data.arrayBuffer())
      const checksum = createHash('sha256').update(bytes).digest('hex')
      if (bytes.byteLength !== item.bytes || checksum !== item.sha256) throw new Error(`Object tồn tại nhưng checksum/size khác: ${metadata.path}`)
    } else {
      const upload = await admin.storage.from('family-media').upload(metadata.path, buffer, { contentType: item.mimeType, upsert: false })
      if (upload.error) throw upload.error
    }
    uploadedPaths.push(metadata.path)
    const progress = { ...baseReport, status: 'uploading', uploadedPaths, phase: 'upload' }
    const update = await admin.from('migration_runs').update({ report: progress, resume_cursor: index + 1 }).eq('id', actualRunId).eq('status', 'running')
    if (update.error) throw update.error
  }
  const loadedReport = { ...baseReport, status: 'loaded', workspaceId: actualWorkspaceId, runId: actualRunId, uploadedPaths }
  const loaded = await admin.rpc('load_drive_bundle_migration', { p_run_id: actualRunId, p_family_data: transformed, p_media_metadata: mediaMetadata, p_report: loadedReport })
  if (loaded.error) throw loaded.error
  const comparison = reconciliationReport(inspection, (loaded.data as { snapshot: unknown }).snapshot)
  const imageBytesMatch = inspection.bytes === mediaMetadata.reduce((sum, item) => sum + item.bytes, 0)
  const reconciliation = { ...comparison, imageBytesMatch, imageChecksums: mediaMetadata.map((item) => ({ mediaId: item.mediaId, sha256: item.sha256, bytes: item.bytes })), clean: comparison.clean && imageBytesMatch }
  lastReconciliation = reconciliation
  if (!reconciliation.clean) throw new Error('Đối soát source/target không sạch; workspace vẫn bị ẩn.')
  const finalReport = { ...loadedReport, status: 'completed', reconciliation }
  const published = await admin.rpc('publish_drive_bundle_migration', { p_run_id: actualRunId, p_report: finalReport })
  if (published.error) throw published.error
  await writeReports(reportPath, finalReport)
  console.log(`Migration completed and published. Workspace: ${actualWorkspaceId}. Report: ${reportPath}`)
} catch (error) {
  const failed = { ...baseReport, status: 'failed', workspaceId: actualWorkspaceId, runId: actualRunId, uploadedPaths, reconciliation: lastReconciliation, error: error instanceof Error ? error.message : 'Unknown error' }
  await admin.rpc('fail_drive_bundle_migration', { p_run_id: actualRunId, p_report: failed, p_resume_cursor: uploadedPaths.length })
  await writeReports(reportPath, failed)
  throw error
}
