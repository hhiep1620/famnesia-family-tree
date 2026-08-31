import { canonicalize, encodeBase64Url } from '../crypto/contract'
import { EncryptedFamilyCodec } from '../crypto/encryptedFamilyCodec'
import type { EncryptedCommitOperation, EncryptedEntityRecord } from '../crypto/encryptedDataContract'
import { WorkspaceKeySession } from '../crypto/workspaceKeySession'
import type { FamilyData } from '../types/family'
import type {
  CiphertextCommitRequest,
  EncryptedFamilyStoreContract,
  EncryptedWorkspaceState,
} from './encryptedFamilyStore'
export { parseFamilyRepositoryMode, type FamilyRepositoryMode } from './familyRepositoryMode'

export interface EncryptedFamilySnapshot {
  data: FamilyData
  revision: { version: string }
}

export class EncryptedCommitOutcomeUnknownError extends Error {
  constructor() { super('ENCRYPTED_COMMIT_OUTCOME_UNKNOWN'); this.name = 'EncryptedCommitOutcomeUnknownError' }
}

async function checksum(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalize(value)))
  return `sha256:${encodeBase64Url(new Uint8Array(digest))}`
}

function entityKey(record: Pick<EncryptedEntityRecord, 'entityId' | 'fieldClass'>): string {
  return `${record.fieldClass}:${record.entityId}`
}

export class EncryptedFamilyRepository {
  private readonly codec: EncryptedFamilyCodec
  private readonly store: EncryptedFamilyStoreContract
  private readonly session: WorkspaceKeySession
  private readonly isOnline: () => boolean
  private state?: EncryptedWorkspaceState
  private records: EncryptedEntityRecord[] = []

  constructor(
    store: EncryptedFamilyStoreContract,
    session: WorkspaceKeySession,
    isOnline: () => boolean = () => navigator.onLine,
  ) {
    this.store = store
    this.session = session
    this.isOnline = isOnline
    this.codec = new EncryptedFamilyCodec(session)
  }

  async load(): Promise<EncryptedFamilySnapshot> {
    const state = await this.store.loadState(this.session.workspaceId)
    if (state.cryptoVersion !== 1 || state.encryptedSchemaVersion !== 1 || state.keyEpoch !== this.session.keyEpoch ||
        state.directoryRevision !== this.session.directoryRevision || state.migrationState === 'blocked') {
      throw new Error('ENCRYPTED_WORKSPACE_STATE_MISMATCH')
    }
    const records = await this.store.loadEntities(this.session.workspaceId)
    const data = await this.codec.decrypt(records, state.dataVersion)
    this.state = state
    this.records = records
    return { data, revision: { version: String(state.dataVersion) } }
  }

  async save(data: FamilyData, expectedVersion: number, commitId = crypto.randomUUID()): Promise<EncryptedFamilySnapshot> {
    if (!this.isOnline()) throw new Error('ENCRYPTED_OFFLINE_WRITE_DISABLED')
    if (!this.state || this.state.dataVersion !== expectedVersion) throw new Error('ENCRYPTED_REVISION_CONFLICT')
    const resultVersion = expectedVersion + 1
    const nextRecords = await this.codec.encrypt(data, resultVersion)
    const priorByKey = new Map(this.records.map((record) => [entityKey(record), record]))
    const nextKeys = new Set(nextRecords.map(entityKey))
    const operations: EncryptedCommitOperation[] = nextRecords.map((record) => ({
      type: 'entity_upsert', entityId: record.entityId, fieldClass: record.fieldClass,
      expectedRowVersion: priorByKey.get(entityKey(record))?.rowVersion ?? 0,
      keyId: record.keyId, keyEpoch: record.keyEpoch, envelope: record.envelope,
    }))
    for (const prior of this.records) {
      if (!nextKeys.has(entityKey(prior))) operations.push({
        type: 'entity_delete', entityId: prior.entityId, fieldClass: prior.fieldClass, expectedRowVersion: prior.rowVersion,
      })
    }
    if (operations.length > 500) throw new Error('ENCRYPTED_COMMIT_TOO_LARGE')
    const requestWithoutChecksum = {
      workspaceId: this.session.workspaceId, commitId, expectedDataVersion: expectedVersion,
      expectedKeyEpoch: this.session.keyEpoch, operations,
    }
    const request: CiphertextCommitRequest = {
      ...requestWithoutChecksum,
      requestChecksum: await checksum(requestWithoutChecksum),
    }
    let committed
    try { committed = await this.store.commit(request) }
    catch {
      const recovered = await this.store.committed(this.session.workspaceId, commitId).catch(() => undefined)
      if (!recovered) throw new EncryptedCommitOutcomeUnknownError()
      committed = recovered
    }
    if (committed.commitId !== commitId) throw new Error('ENCRYPTED_COMMIT_ID_MISMATCH')
    if (committed.dataVersion !== resultVersion) throw new Error('ENCRYPTED_COMMIT_VERSION_MISMATCH')
    this.state = { ...this.state, dataVersion: resultVersion }
    this.records = nextRecords
    return { data, revision: { version: String(resultVersion) } }
  }
}
