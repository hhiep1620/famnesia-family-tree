import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL?.trim()
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
if (!url || !secretKey || !publishableKey) throw new Error('SUPABASE_URL, SUPABASE_SECRET_KEY and SUPABASE_PUBLISHABLE_KEY are required.')
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw new Error('Migration smoke is restricted to local Supabase.')

const root = await mkdtemp(path.join(tmpdir(), 'famnesia-cr09-smoke-'))
try {
  await mkdir(path.join(root, 'photos'))
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  const family = {
    schemaVersion: 3, updatedAt: '2026-08-14T00:00:00.000Z',
    profiles: [{ id: 'F1', name: 'Media migration', lineageSurname: '', description: '', photoFileId: null, subjectPersonId: 'P1', requiresSecret: false, isActive: true }],
    persons: [{ id: 'P1', profileId: 'F1', name: 'Media Person', nickname: null, gender: 'unknown', birthDate: null, isDeceased: false, deathDate: null, deathLunar: null, phone1: '', phone2: '', address: '', note: '', ancestralRole: 'none' }],
    relationships: [],
    media: [{ id: 'M1', profileId: 'F1', personId: 'P1', driveFileId: 'legacy_media_1', type: 'photo', isPrimary: true, caption: 'Migration smoke', takenDate: null }],
    settings: { timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN', duplicateSuppressions: [] },
  }
  await writeFile(path.join(root, 'family.json'), JSON.stringify(family))
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ version: 1, sourceRevision: 'media-smoke-v1', media: [{ mediaId: 'M1', path: 'photos/person.png', mimeType: 'image/png' }] }))
  await writeFile(path.join(root, 'photos/person.png'), png)
  const runId = randomUUID()
  const workspaceId = randomUUID()
  const reportPath = path.join(root, 'report.json')
  const cli = path.resolve('node_modules/.bin/tsx')
  const command = [path.resolve('scripts/migrate-drive-bundle.ts'), '--bundle', root, '--owner-email', 'local-owner@example.test', '--workspace-name', 'CR09 media smoke', '--legacy-drive-folder-id', `media-smoke-${runId}`, '--run-id', runId, '--workspace-id', workspaceId, '--report', reportPath]
  execFileSync(cli, command, { env: process.env, stdio: 'inherit' })
  const report = JSON.parse(await readFile(reportPath, 'utf8')) as { status: string; reconciliation: { clean: boolean; imageChecksums: Array<{ sha256: string }> } }
  if (report.status !== 'completed' || !report.reconciliation.clean) throw new Error('Migration report is not clean.')

  const owner = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const signIn = await owner.auth.signInWithPassword({ email: 'local-owner@example.test', password: process.env.SUPABASE_SEED_PASSWORD ?? 'FamnesiaLocal123!' })
  if (signIn.error) throw signIn.error
  const mediaRow = await owner.from('media').select('storage_path').eq('workspace_id', workspaceId).eq('legacy_id', 'M1').single()
  if (mediaRow.error || !mediaRow.data.storage_path) throw mediaRow.error ?? new Error('Migrated media row has no private Storage path.')
  const objectPath = mediaRow.data.storage_path
  const downloaded = await owner.storage.from('family-media').download(objectPath)
  if (downloaded.error) throw downloaded.error
  const downloadedBytes = Buffer.from(await downloaded.data.arrayBuffer())
  const checksum = createHash('sha256').update(downloadedBytes).digest('hex')
  if (!downloadedBytes.equals(png) || checksum !== report.reconciliation.imageChecksums[0]?.sha256) throw new Error('Owner media download checksum mismatch.')

  execFileSync(cli, [...command.slice(0, -2), '--report', path.join(root, 'rerun.json')], { env: process.env, stdio: 'inherit' })
  const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const rows = await admin.from('workspaces').select('id', { count: 'exact', head: true }).eq('legacy_drive_folder_id', `media-smoke-${runId}`)
  if (rows.error || rows.count !== 1) throw rows.error ?? new Error('Idempotent rerun duplicated the workspace.')
  console.log('CR09 migration smoke passed: private image upload/download checksum, clean publish and idempotent rerun.')
} finally {
  await rm(root, { recursive: true, force: true })
}
