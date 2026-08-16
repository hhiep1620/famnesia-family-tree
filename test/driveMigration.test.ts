import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { inspectDriveBundle, reconciliationReport, semanticFamilyHash, storageFamilyData } from '../scripts/lib/driveMigration.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

function current(media = false) {
  return {
    schemaVersion: 3,
    updatedAt: '2026-08-14T00:00:00.000Z',
    profiles: [{ id: 'F1', name: 'Family', lineageSurname: '', description: '', photoFileId: null, subjectPersonId: 'P1', requiresSecret: false, isActive: true }],
    persons: [{ id: 'P1', profileId: 'F1', name: 'Person', nickname: null, gender: 'male', birthDate: null, isDeceased: false, deathDate: null, deathLunar: null, phone1: '', phone2: '', address: '', note: '', ancestralRole: 'none', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z' }],
    relationships: [],
    media: media ? [{ id: 'M1', profileId: 'F1', personId: 'P1', driveFileId: 'drive_1', type: 'photo', isPrimary: true, caption: '', takenDate: null, createdAt: '2026-08-03T00:00:00.000Z' }] : [],
    settings: { timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN', duplicateSuppressions: [] },
  }
}

async function bundle(family: unknown, manifest?: unknown, photo?: Buffer) {
  const root = await mkdtemp(path.join(tmpdir(), 'famnesia-drive-bundle-'))
  roots.push(root)
  await mkdir(path.join(root, 'photos'))
  await writeFile(path.join(root, 'family.json'), JSON.stringify(family))
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest ?? { version: 1, familyFile: 'family.json', sourceRevision: 'v1', media: [] }))
  if (photo) await writeFile(path.join(root, 'photos', 'person.png'), photo)
  return root
}

describe('Drive bundle migration inspection', () => {
  it('validates a current export and produces deterministic counts/hash', async () => {
    const root = await bundle(current())
    const first = await inspectDriveBundle(root)
    const second = await inspectDriveBundle(root)
    expect(first.counts).toEqual({ profiles: 1, persons: 1, relationships: 0, media: 0 })
    expect(first.normalizedHash).toBe(second.normalizedHash)
    expect(first.sourceSchemaVersion).toBe(3)
  })

  it('upgrades legacy v1 photoFileId while preserving legacy IDs', async () => {
    const legacy = current() as ReturnType<typeof current> & { schemaVersion: number }
    legacy.schemaVersion = 1
    ;(legacy.persons[0] as Record<string, unknown>).photoFileId = 'drive_legacy'
    delete (legacy as Record<string, unknown>).settings
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', 'base64')
    const root = await bundle(legacy, { version: 1, media: [{ mediaId: 'M0001', path: 'photos/person.png', mimeType: 'image/png' }] }, png)
    const result = await inspectDriveBundle(root)
    expect(result.sourceSchemaVersion).toBe(1)
    expect(result.familyData.media[0]).toMatchObject({ id: 'M0001', personId: 'P1', driveFileId: 'drive_legacy' })
  })

  it('rejects missing, corrupt and path-traversal images', async () => {
    const manifest = { version: 1, media: [{ mediaId: 'M1', path: 'photos/missing.png' }] }
    await expect(inspectDriveBundle(await bundle(current(true), manifest))).rejects.toThrow(/không tồn tại|ENOENT/)
    const corruptRoot = await bundle(current(true), { version: 1, media: [{ mediaId: 'M1', path: 'photos/person.png' }] }, Buffer.from('not an image'))
    await expect(inspectDriveBundle(corruptRoot)).rejects.toThrow(/hỏng/)
    const outside = await bundle(current(true), { version: 1, media: [{ mediaId: 'M1', path: '../outside.png' }] })
    await expect(inspectDriveBundle(outside)).rejects.toThrow()
  })

  it('rejects duplicate manifest IDs and cross-profile references', async () => {
    const duplicate = { version: 1, media: [{ mediaId: 'M1', path: 'a' }, { mediaId: 'M1', path: 'b' }] }
    await expect(inspectDriveBundle(await bundle(current(true), duplicate))).rejects.toThrow(/trùng/)
    const invalid = current()
    invalid.persons[0].profileId = 'missing'
    await expect(inspectDriveBundle(await bundle(invalid))).rejects.toThrow(/profile/)
  })

  it('maps media to deterministic run-scoped Storage paths', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', 'base64')
    const root = await bundle(current(true), { version: 1, media: [{ mediaId: 'M1', path: 'photos/person.png', mimeType: 'image/png' }] }, png)
    const inspection = await inspectDriveBundle(root)
    const target = storageFamilyData(inspection, 'workspace', 'run')
    expect(target.media[0].storagePath).toMatch(/^workspace\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/original\.png$/)
    expect(semanticFamilyHash(target)).toBe(inspection.normalizedHash)
  })

  it('reports semantic/timestamp parity and detects a changed target', async () => {
    const inspection = await inspectDriveBundle(await bundle(current()))
    expect(reconciliationReport(inspection, current())).toMatchObject({ clean: true, countMatch: true, timestampsMatch: true })
    const changed = current()
    changed.persons[0].name = 'Changed'
    expect(reconciliationReport(inspection, changed)).toMatchObject({ clean: false, semanticMatch: false })
  })
})
