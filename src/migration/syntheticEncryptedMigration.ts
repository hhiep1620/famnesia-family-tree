import { canonicalize } from '../crypto/contract'
import { contactQuarantineSummary, EncryptedFamilyCodec, withoutContactValues } from '../crypto/encryptedFamilyCodec'
import type { EncryptedEntityRecord } from '../crypto/encryptedDataContract'
import { WorkspaceKeySession } from '../crypto/workspaceKeySession'
import { requireValidFamilyData } from '../schema/familyDataSchema'
import type { FamilyData } from '../types/family'

export interface SyntheticMigrationSource {
  marker: 'famnesia-synthetic-v1'
  fixtureId: string
  workspaceId: string
  data: FamilyData
  workflowArtifactCount?: number
}

export interface MigrationClassCounts {
  source: number
  encrypted: number
  quarantined: number
}

export interface SyntheticMigrationReport {
  familyShared: MigrationClassCounts
  contact: MigrationClassCounts
  media: MigrationClassCounts
  workflow: MigrationClassCounts
  sourceManifestHmac: string
  encryptedManifestHmac: string
}

export interface SyntheticMigrationCheckpoint {
  version: 1
  runId: string
  fixtureId: string
  workspaceId: string
  keySetId: string
  sourceManifestHmac: string
  nextRecordIndex: number
  totalRecords: number
  status: 'running' | 'complete' | 'stopped'
  report?: SyntheticMigrationReport
  updatedAt: string
}

export interface SyntheticMigrationCheckpointStore {
  load(runId: string): Promise<SyntheticMigrationCheckpoint | undefined>
  save(checkpoint: SyntheticMigrationCheckpoint): Promise<void>
}

export interface SyntheticCiphertextSink {
  put(records: EncryptedEntityRecord[]): Promise<void>
  list(): Promise<EncryptedEntityRecord[]>
}

export class InMemorySyntheticMigrationStore implements SyntheticMigrationCheckpointStore, SyntheticCiphertextSink {
  private readonly checkpoints = new Map<string, SyntheticMigrationCheckpoint>()
  private readonly records = new Map<string, EncryptedEntityRecord>()
  async load(runId: string): Promise<SyntheticMigrationCheckpoint | undefined> {
    const value = this.checkpoints.get(runId)
    return value ? structuredClone(value) : undefined
  }
  async save(checkpoint: SyntheticMigrationCheckpoint): Promise<void> {
    this.checkpoints.set(checkpoint.runId, structuredClone(checkpoint))
  }
  async put(records: EncryptedEntityRecord[]): Promise<void> {
    for (const record of records) this.records.set(`${record.workspaceId}:${record.fieldClass}:${record.entityId}`, structuredClone(record))
  }
  async list(): Promise<EncryptedEntityRecord[]> { return [...this.records.values()].map((record) => structuredClone(record)) }
}

function sharedSourceCount(data: FamilyData): number {
  return 1 + data.profiles.length + data.persons.length + data.relationships.length
}

export class SyntheticEncryptedMigrationHarness {
  private readonly codec: EncryptedFamilyCodec
  private readonly session: WorkspaceKeySession
  private readonly checkpoints: SyntheticMigrationCheckpointStore
  private readonly sink: SyntheticCiphertextSink
  private readonly batchSize: number
  private readonly now: () => string

  constructor(
    session: WorkspaceKeySession,
    checkpoints: SyntheticMigrationCheckpointStore,
    sink: SyntheticCiphertextSink,
    batchSize = 100,
    now: () => string = () => new Date().toISOString(),
  ) {
    this.session = session
    this.checkpoints = checkpoints
    this.sink = sink
    this.batchSize = batchSize
    this.now = now
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 500) throw new Error('INVALID_MIGRATION_BATCH_SIZE')
    this.codec = new EncryptedFamilyCodec(session)
  }

  private assertSynthetic(source: SyntheticMigrationSource): void {
    if (source.marker !== 'famnesia-synthetic-v1' || !/^synthetic-[A-Za-z0-9_-]{4,80}$/u.test(source.fixtureId)) {
      throw new Error('SYNTHETIC_SOURCE_REQUIRED')
    }
    if (source.workspaceId !== this.session.workspaceId) throw new Error('MIGRATION_WORKSPACE_MISMATCH')
  }

  async run(runId: string, source: SyntheticMigrationSource, baseDataVersion = 1): Promise<SyntheticMigrationCheckpoint> {
    this.assertSynthetic(source)
    const quarantine = contactQuarantineSummary(source.data)
    const validated = requireValidFamilyData(source.data)
    const sanitized = withoutContactValues(validated)
    const sourceManifestHmac = await this.session.keyedDigest({
      domain: 'famnesia:synthetic-migration-source:v1', fixtureId: source.fixtureId,
      data: source.data, workflowArtifactCount: source.workflowArtifactCount ?? 0,
    })
    const keySetId = await this.session.keyedDigest({
      domain: 'famnesia:workspace-key-set:v1', workspaceId: this.session.workspaceId,
      keyId: this.session.keyId, keyEpoch: this.session.keyEpoch,
    })
    let checkpoint = await this.checkpoints.load(runId)
    if (checkpoint) {
      if (checkpoint.fixtureId !== source.fixtureId || checkpoint.workspaceId !== source.workspaceId ||
          checkpoint.keySetId !== keySetId || checkpoint.sourceManifestHmac !== sourceManifestHmac) {
        throw new Error('MIGRATION_RESUME_IDENTITY_MISMATCH')
      }
      if (checkpoint.status === 'complete') return checkpoint
      if (checkpoint.status === 'stopped') throw new Error('MIGRATION_STOPPED')
    }
    const records = await this.codec.encrypt(sanitized, baseDataVersion + 1)
    if (!checkpoint) {
      checkpoint = {
        version: 1, runId, fixtureId: source.fixtureId, workspaceId: source.workspaceId,
        keySetId, sourceManifestHmac, nextRecordIndex: 0, totalRecords: records.length,
        status: 'running', updatedAt: this.now(),
      }
      await this.checkpoints.save(checkpoint)
    }
    if (checkpoint.totalRecords !== records.length || checkpoint.nextRecordIndex > records.length) {
      throw new Error('MIGRATION_CHECKPOINT_CORRUPT')
    }
    while (checkpoint.nextRecordIndex < records.length) {
      const end = Math.min(checkpoint.nextRecordIndex + this.batchSize, records.length)
      await this.sink.put(records.slice(checkpoint.nextRecordIndex, end))
      checkpoint = { ...checkpoint, nextRecordIndex: end, updatedAt: this.now() }
      await this.checkpoints.save(checkpoint)
    }
    const stored = (await this.sink.list()).filter((record) => record.workspaceId === source.workspaceId)
    const encryptedManifestHmac = await this.session.keyedDigest(stored
      .map((record) => ({ fieldClass: record.fieldClass, entityId: record.entityId, rowVersion: record.rowVersion, envelope: record.envelope }))
      .sort((left, right) => canonicalize(left).localeCompare(canonicalize(right))))
    const report: SyntheticMigrationReport = {
      familyShared: { source: sharedSourceCount(validated), encrypted: stored.filter((record) => record.fieldClass !== 'media_manifest').length, quarantined: 0 },
      contact: { source: quarantine.fields, encrypted: 0, quarantined: quarantine.fields },
      media: { source: validated.media.length, encrypted: stored.filter((record) => record.fieldClass === 'media_manifest').length, quarantined: 0 },
      workflow: { source: source.workflowArtifactCount ?? 0, encrypted: 0, quarantined: source.workflowArtifactCount ?? 0 },
      sourceManifestHmac,
      encryptedManifestHmac,
    }
    if (report.familyShared.source !== report.familyShared.encrypted || report.media.source !== report.media.encrypted ||
        report.contact.source !== report.contact.quarantined) throw new Error('MIGRATION_RECONCILIATION_FAILED')
    checkpoint = { ...checkpoint, status: 'complete', report, updatedAt: this.now() }
    await this.checkpoints.save(checkpoint)
    return checkpoint
  }

  async stop(runId: string): Promise<SyntheticMigrationCheckpoint> {
    const checkpoint = await this.checkpoints.load(runId)
    if (!checkpoint) throw new Error('MIGRATION_CHECKPOINT_NOT_FOUND')
    if (checkpoint.status === 'complete') throw new Error('MIGRATION_COMPLETE_NOT_STOPPABLE')
    const stopped = { ...checkpoint, status: 'stopped' as const, updatedAt: this.now() }
    await this.checkpoints.save(stopped)
    return stopped
  }
}
