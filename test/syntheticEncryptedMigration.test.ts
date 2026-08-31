import { describe, expect, it } from 'vitest'
import type { FamilyData } from '../src/types/family'
import { WorkspaceKeySession } from '../src/crypto/workspaceKeySession'
import {
  InMemorySyntheticMigrationStore,
  SyntheticEncryptedMigrationHarness,
  type SyntheticCiphertextSink,
} from '../src/migration/syntheticEncryptedMigration'

const workspaceId = '42000000-0000-4000-8000-000000000001'
const descriptor = { workspaceId, principalId: 'cp_aaaaaaaaaaaaaaaaaaaaaaaa', keyId: 'wk-family-1', keyEpoch: 1, directoryRevision: 1 }
const data: FamilyData = {
  schemaVersion: 3,
  profiles: [{ id: 'F1', name: 'Synthetic Family', requiresSecret: false, isActive: true }],
  persons: [{ id: 'P1', profileId: 'F1', name: 'Synthetic Person', phone1: '0900000000', address: 'Synthetic Address' }],
  relationships: [], media: [], settings: { timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN' },
}
const source = { marker: 'famnesia-synthetic-v1' as const, fixtureId: 'synthetic-fixture-one', workspaceId, data, workflowArtifactCount: 2 }

describe('CR-05 synthetic encrypted migration harness', () => {
  it('quarantines contact, reconciles each class and stores keyed manifests only', async () => {
    const active = await WorkspaceKeySession.fromRawKey(descriptor, new Uint8Array(32).fill(3), 'migration-tab')
    const storage = new InMemorySyntheticMigrationStore()
    const result = await new SyntheticEncryptedMigrationHarness(active, storage, storage, 2).run('run-one', source)
    expect(result.status).toBe('complete')
    expect(result.report?.familyShared).toEqual({ source: 3, encrypted: 3, quarantined: 0 })
    expect(result.report?.contact).toEqual({ source: 2, encrypted: 0, quarantined: 2 })
    expect(result.report?.workflow).toEqual({ source: 2, encrypted: 0, quarantined: 2 })
    expect(result.sourceManifestHmac).toMatch(/^hmac-sha256:/u)
    expect(JSON.stringify(result)).not.toContain('Synthetic Person')
    expect(JSON.stringify(await storage.list())).not.toContain('0900000000')
  })

  it('counts legacy email before strict schema validation strips unknown contact fields', async () => {
    const active = await WorkspaceKeySession.fromRawKey(descriptor, new Uint8Array(32).fill(3), 'migration-email-tab')
    const storage = new InMemorySyntheticMigrationStore()
    const withLegacyEmail = structuredClone(source)
    ;(withLegacyEmail.data.persons[0] as typeof withLegacyEmail.data.persons[0] & { email: string }).email = 'synthetic@example.test'
    const result = await new SyntheticEncryptedMigrationHarness(active, storage, storage).run('run-email', withLegacyEmail)
    expect(result.report?.contact).toEqual({ source: 3, encrypted: 0, quarantined: 3 })
    expect(JSON.stringify(await storage.list())).not.toContain('synthetic@example.test')

    const changedEmail = structuredClone(withLegacyEmail)
    ;(changedEmail.data.persons[0] as typeof changedEmail.data.persons[0] & { email: string }).email = 'changed@example.test'
    await expect(new SyntheticEncryptedMigrationHarness(active, storage, storage).run('run-email', changedEmail))
      .rejects.toThrow('MIGRATION_RESUME_IDENTITY_MISMATCH')
  })

  it('resumes an unknown partial write idempotently and refuses a second key set', async () => {
    const active = await WorkspaceKeySession.fromRawKey(descriptor, new Uint8Array(32).fill(3), 'migration-tab')
    const storage = new InMemorySyntheticMigrationStore()
    let first = true
    const interruptedSink: SyntheticCiphertextSink = {
      async put(records) { await storage.put(records); if (first) { first = false; throw new Error('INTERRUPTED') } },
      list: () => storage.list(),
    }
    const harness = new SyntheticEncryptedMigrationHarness(active, storage, interruptedSink, 2)
    await expect(harness.run('run-resume', source)).rejects.toThrow('INTERRUPTED')
    await expect(harness.run('run-resume', source)).resolves.toMatchObject({ status: 'complete' })
    await expect(harness.run('run-resume', source)).resolves.toMatchObject({ status: 'complete' })

    const wrongKey = await WorkspaceKeySession.fromRawKey(descriptor, new Uint8Array(32).fill(8), 'other-tab')
    await expect(new SyntheticEncryptedMigrationHarness(wrongKey, storage, storage).run('run-resume', source))
      .rejects.toThrow('MIGRATION_RESUME_IDENTITY_MISMATCH')
  })

  it('requires an explicit synthetic marker and rollback retains ciphertext', async () => {
    const active = await WorkspaceKeySession.fromRawKey(descriptor, new Uint8Array(32).fill(3), 'migration-tab')
    const storage = new InMemorySyntheticMigrationStore()
    const harness = new SyntheticEncryptedMigrationHarness(active, storage, {
      async put() { throw new Error('pause') }, list: () => storage.list(),
    })
    await expect(harness.run('run-stop', source)).rejects.toThrow('pause')
    const before = await storage.list()
    await expect(harness.stop('run-stop')).resolves.toMatchObject({ status: 'stopped' })
    expect(await storage.list()).toEqual(before)
    await expect(harness.run('run-real', { ...source, marker: 'wrong' as never })).rejects.toThrow('SYNTHETIC_SOURCE_REQUIRED')
  })
})
