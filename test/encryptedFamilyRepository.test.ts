import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { FamilyData } from '../src/types/family'
import { EncryptedFamilyCodec, assertContactPolicyReady } from '../src/crypto/encryptedFamilyCodec'
import { WorkspaceKeySession } from '../src/crypto/workspaceKeySession'
import { requireValidFamilyData } from '../src/schema/familyDataSchema'
import {
  EncryptedCommitOutcomeUnknownError,
  EncryptedFamilyRepository,
  parseFamilyRepositoryMode,
} from '../src/services/encryptedFamilyRepository'
import { assertLegacyFamilyPathEnabled } from '../src/services/familyRepositoryMode'
import type {
  CiphertextCommitRequest,
  CiphertextCommitResult,
  EncryptedFamilyStoreContract,
  EncryptedWorkspaceState,
} from '../src/services/encryptedFamilyStore'
import type { EncryptedEntityRecord } from '../src/crypto/encryptedDataContract'

const workspaceId = '42000000-0000-4000-8000-000000000001'
const descriptor = {
  workspaceId,
  principalId: 'cp_aaaaaaaaaaaaaaaaaaaaaaaa',
  keyId: 'wk-family-1',
  keyEpoch: 1,
  directoryRevision: 1,
}

function family(phone = ''): FamilyData {
  return {
    schemaVersion: 3,
    updatedAt: '2026-08-31T00:00:00.000Z',
    profiles: [{ id: 'F1', name: 'Gia đình Nguyễn', requiresSecret: false, isActive: true, subjectPersonId: 'P1' }],
    persons: [{ id: 'P1', profileId: 'F1', name: 'Nguyễn An', gender: 'unknown', isDeceased: false,
      phone1: phone, phone2: '', address: '', note: '', ancestralRole: 'none' }],
    relationships: [],
    media: [{ id: 'M1', profileId: 'F1', personId: 'P1', fileId: 'opaque-photo-1', type: 'photo', isPrimary: true, caption: 'Ảnh gia đình' }],
    settings: { timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN', duplicateSuppressions: [] },
  }
}

async function session(rawByte = 7, tabId = 'tab-a') {
  return WorkspaceKeySession.fromRawKey(descriptor, new Uint8Array(32).fill(rawByte), tabId)
}

class FakeStore implements EncryptedFamilyStoreContract {
  state: EncryptedWorkspaceState = { workspaceId, cryptoVersion: 1, encryptedSchemaVersion: 1, keyEpoch: 1,
    dataVersion: 1, directoryRevision: 1, membershipEpoch: 1, checkpointRevision: 1,
    checkpointHash: 'sha256:initial', migrationState: 'parallel' }
  records: EncryptedEntityRecord[] = []
  requests: CiphertextCommitRequest[] = []
  commitError?: Error
  recovery?: CiphertextCommitResult
  async loadState() { return this.state }
  async loadEntities() { return this.records }
  async commit(request: CiphertextCommitRequest) {
    this.requests.push(request)
    if (this.commitError) throw this.commitError
    this.state = { ...this.state, dataVersion: request.expectedDataVersion + 1 }
    return { commitId: request.commitId, dataVersion: this.state.dataVersion,
      checkpointRevision: this.state.checkpointRevision + 1, checkpointHash: `sha256:${'Z'.repeat(43)}`, idempotent: false }
  }
  async committed() { return this.recovery }
}

const checkpoints = { async register() {} }

describe('CR-05 encrypted family codec and repository', () => {
  it('round-trips all shared classes and keeps settings/media inside ciphertext', async () => {
    const active = await session()
    const codec = new EncryptedFamilyCodec(active)
    const records = await codec.encrypt(family(), 1)
    expect(records.map((record) => record.fieldClass).sort()).toEqual([
      'family_profile', 'media_manifest', 'person_core', 'workspace_settings',
    ])
    expect(JSON.stringify(records)).not.toContain('Gia đình Nguyễn')
    expect(JSON.stringify(records)).not.toContain('Asia/Ho_Chi_Minh')
    expect(records.every((record) => record.writerPrincipalId === descriptor.principalId)).toBe(true)
    expect(records.every((record) => record.writerId.includes('.tab.tab-a'))).toBe(true)
    await expect(codec.decrypt(records, 1)).resolves.toEqual(requireValidFamilyData(family()))
  })

  it('rejects contact/private values before encryption or network access', async () => {
    const active = await session()
    const codec = new EncryptedFamilyCodec(active)
    expect(() => assertContactPolicyReady(family('0900000000'))).toThrow('CONTACT_POLICY_NOT_READY')
    await expect(codec.encrypt(family('0900000000'), 1)).rejects.toThrow('CONTACT_POLICY_NOT_READY')
    for (const contact of [
      { address: 'Địa chỉ riêng' },
      { note: 'Ghi chú riêng' },
      { email: 'private@example.test' },
    ]) {
      const candidate = family()
      Object.assign(candidate.persons[0], contact)
      await expect(codec.encrypt(candidate, 1)).rejects.toThrow('CONTACT_POLICY_NOT_READY')
    }
  })

  it('rejects ciphertext tamper and cross-version future rows', async () => {
    const active = await session()
    const codec = new EncryptedFamilyCodec(active)
    const records = await codec.encrypt(family(), 2)
    const tampered = structuredClone(records)
    tampered[0].envelope.ciphertext = `${tampered[0].envelope.ciphertext.slice(0, -1)}A`
    await expect(codec.decrypt(tampered, 2)).rejects.toThrow()
    await expect(codec.decrypt(records, 1)).rejects.toThrow('ENCRYPTED_RECORD_STATE_MISMATCH')
  })

  it('accepts unchanged older rows but rejects missing records through the encrypted manifest', async () => {
    const active = await session()
    const codec = new EncryptedFamilyCodec(active)
    const versionOne = await codec.encrypt(family(), 1)
    const versionTwo = await codec.encrypt(family(), 2)
    const mixed = versionTwo.map((record) => record.fieldClass === 'media_manifest'
      ? versionOne.find((older) => older.fieldClass === record.fieldClass) ?? record
      : record)
    await expect(codec.decrypt(mixed, 2)).resolves.toMatchObject({ schemaVersion: 3 })
    await expect(codec.decrypt(versionTwo.slice(0, -1), 2)).rejects.toThrow('ENCRYPTED_RECORD_MANIFEST_MISMATCH')
  })

  it('rejects ciphertext records from another workspace before decryption', async () => {
    const active = await session()
    const records = await new EncryptedFamilyCodec(active).encrypt(family(), 1)
    const other = await WorkspaceKeySession.fromRawKey(
      { ...descriptor, workspaceId: '42000000-0000-4000-8000-000000000099' },
      new Uint8Array(32).fill(7),
      'other-workspace-tab',
    )
    await expect(new EncryptedFamilyCodec(other).decrypt(records, 1)).rejects.toThrow('ENCRYPTED_RECORD_STATE_MISMATCH')
  })

  it('loads, validates and commits ciphertext-only operations with revision fencing', async () => {
    const active = await session()
    const store = new FakeStore()
    store.records = await new EncryptedFamilyCodec(active).encrypt(family(), 1)
    const repository = new EncryptedFamilyRepository(store, active, () => true, checkpoints)
    const loaded = await repository.load()
    expect(loaded.data.profiles[0].name).toBe('Gia đình Nguyễn')
    const next = structuredClone(loaded.data); next.profiles[0].description = 'Nhánh trưởng'
    const saved = await repository.save(next, 1, 'commit-cr05-1')
    expect(saved.revision.version).toBe('2')
    expect(store.requests).toHaveLength(1)
    const wire = JSON.stringify(store.requests[0])
    expect(wire).not.toContain('Gia đình Nguyễn')
    expect(wire).not.toContain('Nhánh trưởng')
    expect(store.requests[0].operations.every((operation) => operation.type.startsWith('entity_'))).toBe(true)
    expect(store.requests[0].operations).toHaveLength(1)
    await expect(repository.save(next, 1)).rejects.toThrow('ENCRYPTED_REVISION_CONFLICT')
  })

  it('bootstraps an empty workspace with ciphertext and its owner key envelope in one fenced commit', async () => {
    const active = await session()
    const store = new FakeStore()
    store.state = { ...store.state, dataVersion: 0, checkpointRevision: 0, checkpointHash: undefined }
    let registered = 0
    const repository = new EncryptedFamilyRepository(store, active, () => true, { async register() { registered += 1 } })
    const wrappedKey = {
      version: 1, suite: 'FAMNESIA-P256-AESGCM-HKDF-SHA256-V1',
      context: { envelopeId: 'env-bootstrap', workspaceId, entityId: 'workspace-root', recipientPrincipalId: descriptor.principalId,
        recipientKeyFingerprint: `sha256:${'a'.repeat(43)}`, keyId: descriptor.keyId, keyPurpose: 'workspace', keyEpoch: 1,
        directoryRevision: 1, issuerPrincipalId: descriptor.principalId, issuerSigningFingerprint: `sha256:${'b'.repeat(43)}`, expiresAt: 1_900_000_000 },
      ephemeralPublicKey: {}, salt: 'A'.repeat(43), nonce: 'A'.repeat(16), wrappedKey: 'A'.repeat(64), issuerSignature: 'A'.repeat(86),
    } as const
    const empty = family(); empty.profiles = []; empty.persons = []; empty.media = []
    const snapshot = await repository.initialize(empty, wrappedKey, 'bootstrap-commit')
    expect(snapshot.revision.version).toBe('1')
    expect(registered).toBe(1)
    expect(store.requests).toHaveLength(1)
    expect(store.requests[0].expectedDataVersion).toBe(0)
    expect(store.requests[0].operations.some((operation) => operation.type === 'key_envelope_insert')).toBe(true)
    expect(JSON.stringify(store.requests[0])).not.toContain('Gia đình Nguyễn')
  })

  it('fails offline and recovers only a confirmed identical unknown commit', async () => {
    const active = await session()
    const store = new FakeStore(); store.records = await new EncryptedFamilyCodec(active).encrypt(family(), 1)
    const offline = new EncryptedFamilyRepository(store, active, () => false, checkpoints)
    await offline.load()
    await expect(offline.save(family(), 1)).rejects.toThrow('ENCRYPTED_OFFLINE_WRITE_DISABLED')

    const uncertainStore = new FakeStore(); uncertainStore.records = store.records; uncertainStore.commitError = new Error('network')
    const uncertain = new EncryptedFamilyRepository(uncertainStore, active, () => true, checkpoints)
    await uncertain.load()
    const changed = family(); changed.profiles[0].description = 'Thay đổi chưa rõ kết quả'
    await expect(uncertain.save(changed, 1, 'unknown-1')).rejects.toBeInstanceOf(EncryptedCommitOutcomeUnknownError)
    uncertainStore.recovery = { commitId: 'different-commit', dataVersion: 2, checkpointRevision: 2,
      checkpointHash: `sha256:${'Z'.repeat(43)}`, idempotent: true }
    await expect(uncertain.save(changed, 1, 'unknown-2')).rejects.toThrow('ENCRYPTED_COMMIT_ID_MISMATCH')
    uncertainStore.recovery = { commitId: 'unknown-2', dataVersion: 2, checkpointRevision: 2,
      checkpointHash: `sha256:${'Z'.repeat(43)}`, idempotent: true }
    const recovered = new EncryptedFamilyRepository(uncertainStore, active, () => true, checkpoints)
    await recovered.load()
    await expect(recovered.save(changed, 1, 'unknown-2')).resolves.toMatchObject({ revision: { version: '2' } })
  })

  it('has an explicit fail-closed repository mode and a ciphertext-only store module', () => {
    expect(parseFamilyRepositoryMode(undefined)).toBe('legacy')
    expect(parseFamilyRepositoryMode('encrypted-synthetic')).toBe('encrypted-synthetic')
    expect(parseFamilyRepositoryMode('disabled')).toBe('disabled')
    expect(() => parseFamilyRepositoryMode('automatic-fallback')).toThrow('INVALID_FAMILY_REPOSITORY_MODE')
    expect(() => assertLegacyFamilyPathEnabled('encrypted-synthetic')).toThrow('LEGACY_PLAINTEXT_PATH_DISABLED')
    expect(() => assertLegacyFamilyPathEnabled('disabled')).toThrow('FAMILY_REPOSITORY_DISABLED')
    const source = readFileSync(new URL('../src/services/encryptedFamilyStore.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/FamilyData|\/api\/workspaces|jsonBody/u)
    const serverBackend = readFileSync(new URL('../server/_server/supabase/writeBackend.ts', import.meta.url), 'utf8')
    const exposedBackend = serverBackend.slice(serverBackend.indexOf('export function createSupabaseWriteRequestBackend'))
    expect(exposedBackend).toContain('ENCRYPTED_FAMILY_RUNTIME_REQUIRED')
    expect(exposedBackend).not.toMatch(/repository\.(?:loadFamily|commitFamily|replaceFamily|loadBackup)|media\.(?:upload|read|delete)/u)
    const draftStorage = readFileSync(new URL('../src/draft/draftStorage.ts', import.meta.url), 'utf8')
    expect(draftStorage).toContain('PLAINTEXT_DRAFT_STORAGE_DISABLED')
    expect(draftStorage).not.toContain('.put(draft')
  })
})
