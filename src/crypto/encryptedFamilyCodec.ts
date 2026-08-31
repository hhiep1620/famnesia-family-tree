import {
  decryptEnvelope,
  decodeUtf8,
  encodeUtf8,
  encryptEnvelopeWithWriterKey,
} from './contract'
import {
  parseEncryptedEntityRecord,
  type EncryptedEntityRecord,
  type SharedFieldClass,
} from './encryptedDataContract'
import { WorkspaceKeySession } from './workspaceKeySession'
import { requireValidFamilyData } from '../schema/familyDataSchema'
import type { FamilyData, Person } from '../types/family'

interface EncryptedPayloadV1 {
  version: 1
  recordType: SharedFieldClass
  value: unknown
}

interface WorkspaceSettingsPayload {
  schemaVersion?: unknown
  updatedAt?: unknown
  settings?: unknown
  manifest?: unknown
}

export interface ContactQuarantineSummary {
  people: number
  fields: number
  byField: { phone: number; email: number; address: number; private_note: number }
}

function hasText(value: unknown): boolean { return typeof value === 'string' && value.trim().length > 0 }

export function contactQuarantineSummary(data: FamilyData): ContactQuarantineSummary {
  const affected = new Set<string>()
  const byField = { phone: 0, email: 0, address: 0, private_note: 0 }
  for (const person of data.persons) {
    if (hasText(person.phone1)) { byField.phone += 1; affected.add(person.id) }
    if (hasText(person.phone2)) { byField.phone += 1; affected.add(person.id) }
    if (hasText((person as Person & { email?: unknown }).email)) { byField.email += 1; affected.add(person.id) }
    if (hasText(person.address)) { byField.address += 1; affected.add(person.id) }
    if (hasText(person.note)) { byField.private_note += 1; affected.add(person.id) }
  }
  return { people: affected.size, fields: Object.values(byField).reduce((sum, count) => sum + count, 0), byField }
}

export function assertContactPolicyReady(data: FamilyData): void {
  if (contactQuarantineSummary(data).fields > 0) throw new Error('CONTACT_POLICY_NOT_READY')
}

export function withoutContactValues(data: FamilyData): FamilyData {
  const copy = structuredClone(data)
  copy.persons = copy.persons.map((person) => {
    const sanitized = { ...person, phone1: '', phone2: '', address: '', note: '' } as Person & { email?: unknown }
    delete sanitized.email
    return sanitized
  })
  return copy
}

function corePerson(person: Person): Person {
  return { ...person, phone1: '', phone2: '', address: '', note: '' }
}

function payload(recordType: SharedFieldClass, value: unknown): EncryptedPayloadV1 {
  return { version: 1, recordType, value }
}

function parsePayload(value: unknown, expected: SharedFieldClass): EncryptedPayloadV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_ENCRYPTED_FAMILY_PAYLOAD')
  const candidate = value as Record<string, unknown>
  if (Object.keys(candidate).sort().join('|') !== 'recordType|value|version' || candidate.version !== 1 || candidate.recordType !== expected) {
    throw new Error('INVALID_ENCRYPTED_FAMILY_PAYLOAD')
  }
  return candidate as unknown as EncryptedPayloadV1
}

export class EncryptedFamilyCodec {
  private readonly session: WorkspaceKeySession
  constructor(session: WorkspaceKeySession) { this.session = session }

  async encrypt(data: FamilyData, dataVersion: number): Promise<EncryptedEntityRecord[]> {
    assertContactPolicyReady(data)
    const validated = requireValidFamilyData(data)
    if (!Number.isSafeInteger(dataVersion) || dataVersion < 1) throw new Error('INVALID_DATA_VERSION')
    const classified: Array<{ fieldClass: SharedFieldClass; domainId: string; value: unknown }> = [
      ...validated.profiles.map((value) => ({ fieldClass: 'family_profile' as const, domainId: value.id, value })),
      ...validated.persons.map((value) => ({ fieldClass: 'person_core' as const, domainId: value.id, value: corePerson(value) })),
      ...validated.relationships.map((value) => ({ fieldClass: 'relationship' as const, domainId: value.id, value })),
      ...validated.media.map((value) => ({ fieldClass: 'media_manifest' as const, domainId: value.id, value })),
    ]
    const resolved = await Promise.all(classified.map(async (item) => ({
      ...item, entityId: await this.session.opaqueEntityId(item.fieldClass, item.domainId),
    })))
    const rootEntityId = await this.session.opaqueEntityId('workspace_settings', 'root')
    const manifest = [
      `workspace_settings:${rootEntityId}`,
      ...resolved.map((item) => `${item.fieldClass}:${item.entityId}`),
    ].sort()
    resolved.unshift({
      fieldClass: 'workspace_settings', domainId: 'root', entityId: rootEntityId,
      value: { schemaVersion: validated.schemaVersion, updatedAt: validated.updatedAt, settings: validated.settings, manifest },
    })
    const writerKey = await this.session.writerKey('family-content', ['encrypt'])
    const records: EncryptedEntityRecord[] = []
    for (const item of resolved) {
      const entityId = item.entityId
      const aad = {
        workspaceId: this.session.workspaceId,
        entityId,
        fieldClass: item.fieldClass,
        schemaVersion: 1,
        dataVersion,
        keyId: this.session.keyId,
        keyEpoch: this.session.keyEpoch,
        writerId: this.session.writerId,
        purpose: 'family-content' as const,
      }
      records.push({
        workspaceId: this.session.workspaceId,
        entityId,
        fieldClass: item.fieldClass,
        rowVersion: dataVersion,
        keyId: this.session.keyId,
        keyEpoch: this.session.keyEpoch,
        writerPrincipalId: this.session.principalId,
        writerId: this.session.writerId,
        envelope: await encryptEnvelopeWithWriterKey(encodeUtf8(JSON.stringify(payload(item.fieldClass, item.value))), writerKey, aad, this.session.nextNonce()),
      })
    }
    return records
  }

  async decrypt(records: unknown[], expectedDataVersion: number): Promise<FamilyData> {
    if (!Array.isArray(records) || records.length < 1) throw new Error('ENCRYPTED_FAMILY_EMPTY')
    const seen = new Set<string>()
    const profiles: unknown[] = []
    const persons: unknown[] = []
    const relationships: unknown[] = []
    const media: unknown[] = []
    let root: WorkspaceSettingsPayload | undefined
    for (const candidate of records) {
      const record = parseEncryptedEntityRecord(candidate)
      const identity = `${record.fieldClass}:${record.entityId}`
      if (seen.has(identity)) throw new Error('DUPLICATE_ENCRYPTED_RECORD')
      seen.add(identity)
      if (record.workspaceId !== this.session.workspaceId || record.keyId !== this.session.keyId ||
          record.keyEpoch !== this.session.keyEpoch || record.rowVersion > expectedDataVersion) {
        throw new Error('ENCRYPTED_RECORD_STATE_MISMATCH')
      }
      const key = await this.session.writerKey('family-content', ['decrypt'], record.envelope.aad.writerId)
      const decoded = JSON.parse(decodeUtf8(await decryptEnvelope(record.envelope, key, record.envelope.aad, record.rowVersion))) as unknown
      const item = parsePayload(decoded, record.fieldClass).value
      switch (record.fieldClass) {
        case 'workspace_settings':
          if (root) throw new Error('DUPLICATE_WORKSPACE_SETTINGS')
          if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('INVALID_WORKSPACE_SETTINGS')
          root = item as WorkspaceSettingsPayload
          break
        case 'family_profile': profiles.push(item); await this.assertOpaqueId(record, item); break
        case 'person_core': persons.push(item); await this.assertOpaqueId(record, item); break
        case 'relationship': relationships.push(item); await this.assertOpaqueId(record, item); break
        case 'media_manifest': media.push(item); await this.assertOpaqueId(record, item); break
      }
    }
    if (!root) throw new Error('WORKSPACE_SETTINGS_MISSING')
    if (Object.keys(root).sort().join('|') !== 'manifest|schemaVersion|settings|updatedAt' ||
        !Array.isArray(root.manifest) || root.manifest.some((value) => typeof value !== 'string')) {
      throw new Error('INVALID_WORKSPACE_SETTINGS')
    }
    const expectedRootId = await this.session.opaqueEntityId('workspace_settings', 'root')
    if (new Set(root.manifest).size !== root.manifest.length ||
        !seen.has(`workspace_settings:${expectedRootId}`) ||
        JSON.stringify([...root.manifest].sort()) !== JSON.stringify([...seen].sort())) {
      throw new Error('ENCRYPTED_RECORD_MANIFEST_MISMATCH')
    }
    const reconstructed = requireValidFamilyData({
      schemaVersion: root.schemaVersion,
      updatedAt: root.updatedAt,
      profiles,
      persons,
      relationships,
      media,
      settings: root.settings,
    })
    assertContactPolicyReady(reconstructed)
    return reconstructed
  }

  private async assertOpaqueId(record: EncryptedEntityRecord, value: unknown): Promise<void> {
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof (value as { id?: unknown }).id !== 'string') {
      throw new Error('INVALID_ENCRYPTED_ENTITY_ID')
    }
    if (record.entityId !== await this.session.opaqueEntityId(record.fieldClass, (value as { id: string }).id)) {
      throw new Error('ENCRYPTED_ENTITY_ID_MISMATCH')
    }
  }
}
