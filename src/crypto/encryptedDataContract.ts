import { canonicalize, parseEncryptedEnvelope, type EncryptedEnvelopeV1 } from './contract.js'
import { parseWrappedKeyEnvelope, type WrappedKeyEnvelopeV1 } from './keyContract.js'

export const ENCRYPTED_SCHEMA_VERSION = 1 as const
export const SHARED_FIELD_CLASSES = ['family_profile', 'person_core', 'relationship', 'media_manifest', 'workspace_settings'] as const
export const PRIVATE_FIELD_CLASSES = ['phone', 'email', 'address', 'private_note'] as const

export type SharedFieldClass = (typeof SHARED_FIELD_CLASSES)[number]
export type PrivateFieldClass = (typeof PRIVATE_FIELD_CLASSES)[number]

export interface EncryptedEntityRecord {
  workspaceId: string
  entityId: string
  fieldClass: SharedFieldClass
  rowVersion: number
  keyId: string
  keyEpoch: number
  writerPrincipalId: string
  writerId: string
  envelope: EncryptedEnvelopeV1
}

export interface EncryptedPrivateFieldRecord {
  workspaceId: string
  personId: string
  fieldClass: PrivateFieldClass
  rowVersion: number
  keyId: string
  keyEpoch: number
  writerPrincipalId: string
  writerId: string
  envelope: EncryptedEnvelopeV1
}

export interface EncryptedKeyEnvelopeRecord {
  workspaceId: string
  envelopeId: string
  entityId: string
  keyId: string
  keyPurpose: 'workspace' | 'contact' | 'media'
  keyEpoch: number
  directoryRevision: number
  recipientPrincipalId: string
  recipientUnwrapFingerprint: string
  issuerPrincipalId: string
  issuerSigningFingerprint: string
  wrappedEnvelope: WrappedKeyEnvelopeV1
}

export interface ContactEditAuthorization {
  authorizationId: string
  workspaceId: string
  actorPrincipalId: string
  personId: string
  fieldClass: PrivateFieldClass
  purpose: 'contact_edit'
  policyRevision: number
  graphRevision: number
  bindingRevision: number
  keyEpoch: number
  expiresAt: string
  revokedAt: string | null
}

export type EncryptedCommitOperation =
  | { type: 'entity_upsert'; entityId: string; fieldClass: SharedFieldClass; expectedRowVersion: number; keyId: string; keyEpoch: number; envelope: EncryptedEnvelopeV1 }
  | { type: 'entity_delete'; entityId: string; fieldClass: SharedFieldClass; expectedRowVersion: number }
  | { type: 'private_upsert'; personId: string; fieldClass: PrivateFieldClass; expectedRowVersion: number; keyId: string; keyEpoch: number; authorizationId: string; envelope: EncryptedEnvelopeV1 }
  | { type: 'private_delete'; personId: string; fieldClass: PrivateFieldClass; expectedRowVersion: number; authorizationId: string }
  | { type: 'key_envelope_insert'; wrappedEnvelope: WrappedKeyEnvelopeV1 }

export interface EncryptedCommitDependency {
  kind: 'entity' | 'private'
  entityId: string
  fieldClass: SharedFieldClass | PrivateFieldClass
  expectedRowVersion: number
}

export interface EncryptedCommitRequest {
  workspaceId: string
  commitId: string
  requestChecksum: string
  expectedDataVersion: number
  expectedKeyEpoch: number
  expectedMembershipEpoch: number
  dependencies: EncryptedCommitDependency[]
  operations: EncryptedCommitOperation[]
  checkpointId: string
}

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const checksumPattern = /^sha256:[A-Za-z0-9_-]{43}$/u

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`INVALID_${label}`)
  return value as Record<string, unknown>
}

function exact(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  if (Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) throw new Error(`INVALID_${label}_SHAPE`)
}

function id(value: unknown, label: string): string {
  if (typeof value !== 'string' || !idPattern.test(value)) throw new Error(`INVALID_${label}`)
  return value
}

function positive(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error(`INVALID_${label}`)
  return Number(value)
}

function nonnegative(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`INVALID_${label}`)
  return Number(value)
}

function member<T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new Error(`INVALID_${label}`)
  return value as T[number]
}

function assertEnvelopeBinding(
  envelope: EncryptedEnvelopeV1,
  expected: {
    workspaceId: string
    entityId: string
    fieldClass: string
    rowVersion: number
    keyId: string
    keyEpoch: number
    writerId: string
    purpose: 'family-content' | 'contact'
  },
): void {
  const expectedAad = {
    workspaceId: expected.workspaceId,
    entityId: expected.entityId,
    fieldClass: expected.fieldClass,
    schemaVersion: ENCRYPTED_SCHEMA_VERSION,
    dataVersion: expected.rowVersion,
    keyId: expected.keyId,
    keyEpoch: expected.keyEpoch,
    writerId: expected.writerId,
    purpose: expected.purpose,
  }
  if (canonicalize(envelope.aad) !== canonicalize(expectedAad)) throw new Error('AAD_RECORD_BINDING_MISMATCH')
}

export function parseEncryptedEntityRecord(value: unknown): EncryptedEntityRecord {
  const input = record(value, 'ENCRYPTED_ENTITY')
  exact(input, ['workspaceId', 'entityId', 'fieldClass', 'rowVersion', 'keyId', 'keyEpoch', 'writerPrincipalId', 'writerId', 'envelope'], 'ENCRYPTED_ENTITY')
  const result: EncryptedEntityRecord = {
    workspaceId: id(input.workspaceId, 'WORKSPACE_ID'),
    entityId: id(input.entityId, 'ENTITY_ID'),
    fieldClass: member(input.fieldClass, SHARED_FIELD_CLASSES, 'SHARED_FIELD_CLASS'),
    rowVersion: positive(input.rowVersion, 'ROW_VERSION'),
    keyId: id(input.keyId, 'KEY_ID'),
    keyEpoch: positive(input.keyEpoch, 'KEY_EPOCH'),
    writerPrincipalId: id(input.writerPrincipalId, 'WRITER_PRINCIPAL_ID'),
    writerId: id(input.writerId, 'WRITER_ID'),
    envelope: parseEncryptedEnvelope(input.envelope),
  }
  assertEnvelopeBinding(result.envelope, { ...result, purpose: 'family-content' })
  return result
}

export function parseEncryptedPrivateFieldRecord(value: unknown): EncryptedPrivateFieldRecord {
  const input = record(value, 'ENCRYPTED_PRIVATE_FIELD')
  exact(input, ['workspaceId', 'personId', 'fieldClass', 'rowVersion', 'keyId', 'keyEpoch', 'writerPrincipalId', 'writerId', 'envelope'], 'ENCRYPTED_PRIVATE_FIELD')
  const result: EncryptedPrivateFieldRecord = {
    workspaceId: id(input.workspaceId, 'WORKSPACE_ID'),
    personId: id(input.personId, 'PERSON_ID'),
    fieldClass: member(input.fieldClass, PRIVATE_FIELD_CLASSES, 'PRIVATE_FIELD_CLASS'),
    rowVersion: positive(input.rowVersion, 'ROW_VERSION'),
    keyId: id(input.keyId, 'KEY_ID'),
    keyEpoch: positive(input.keyEpoch, 'KEY_EPOCH'),
    writerPrincipalId: id(input.writerPrincipalId, 'WRITER_PRINCIPAL_ID'),
    writerId: id(input.writerId, 'WRITER_ID'),
    envelope: parseEncryptedEnvelope(input.envelope),
  }
  assertEnvelopeBinding(result.envelope, {
    workspaceId: result.workspaceId,
    entityId: result.personId,
    fieldClass: result.fieldClass,
    rowVersion: result.rowVersion,
    keyId: result.keyId,
    keyEpoch: result.keyEpoch,
    writerId: result.writerId,
    purpose: 'contact',
  })
  return result
}

export function parseEncryptedKeyEnvelopeRecord(value: unknown): EncryptedKeyEnvelopeRecord {
  const input = record(value, 'ENCRYPTED_KEY_RECORD')
  exact(input, ['workspaceId', 'envelopeId', 'entityId', 'keyId', 'keyPurpose', 'keyEpoch', 'directoryRevision', 'recipientPrincipalId', 'recipientUnwrapFingerprint', 'issuerPrincipalId', 'issuerSigningFingerprint', 'wrappedEnvelope'], 'ENCRYPTED_KEY_RECORD')
  const wrappedEnvelope = parseWrappedKeyEnvelope(input.wrappedEnvelope)
  const result: EncryptedKeyEnvelopeRecord = {
    workspaceId: id(input.workspaceId, 'WORKSPACE_ID'),
    envelopeId: id(input.envelopeId, 'ENVELOPE_ID'),
    entityId: id(input.entityId, 'ENTITY_ID'),
    keyId: id(input.keyId, 'KEY_ID'),
    keyPurpose: member(input.keyPurpose, ['workspace', 'contact', 'media'] as const, 'KEY_PURPOSE'),
    keyEpoch: positive(input.keyEpoch, 'KEY_EPOCH'),
    directoryRevision: positive(input.directoryRevision, 'DIRECTORY_REVISION'),
    recipientPrincipalId: id(input.recipientPrincipalId, 'RECIPIENT_PRINCIPAL_ID'),
    recipientUnwrapFingerprint: id(input.recipientUnwrapFingerprint, 'RECIPIENT_FINGERPRINT'),
    issuerPrincipalId: id(input.issuerPrincipalId, 'ISSUER_PRINCIPAL_ID'),
    issuerSigningFingerprint: id(input.issuerSigningFingerprint, 'ISSUER_FINGERPRINT'),
    wrappedEnvelope,
  }
  const context = wrappedEnvelope.context
  if (canonicalize(context) !== canonicalize({
    ...context,
    envelopeId: result.envelopeId,
    workspaceId: result.workspaceId,
    entityId: result.entityId,
    recipientPrincipalId: result.recipientPrincipalId,
    recipientKeyFingerprint: result.recipientUnwrapFingerprint,
    keyId: result.keyId,
    keyPurpose: result.keyPurpose,
    keyEpoch: result.keyEpoch,
    directoryRevision: result.directoryRevision,
    issuerPrincipalId: result.issuerPrincipalId,
    issuerSigningFingerprint: result.issuerSigningFingerprint,
  })) throw new Error('KEY_ENVELOPE_RECORD_BINDING_MISMATCH')
  return result
}

export function assertContactEditAuthorization(
  value: ContactEditAuthorization,
  expected: {
    authorizationId: string
    workspaceId: string
    actorPrincipalId: string
    personId: string
    fieldClass: PrivateFieldClass
    policyRevision: number
    graphRevision: number
    bindingRevision: number
    keyEpoch: number
    now?: Date
  },
): void {
  const now = expected.now ?? new Date()
  for (const key of ['authorizationId', 'workspaceId', 'actorPrincipalId', 'personId', 'fieldClass', 'policyRevision', 'graphRevision', 'bindingRevision', 'keyEpoch'] as const) {
    if (value[key] !== expected[key]) throw new Error('CONTACT_AUTHORIZATION_SCOPE_MISMATCH')
  }
  if (value.purpose !== 'contact_edit' || value.revokedAt !== null || Date.parse(value.expiresAt) <= now.getTime()) {
    throw new Error('CONTACT_AUTHORIZATION_INACTIVE')
  }
}

export function parseEncryptedCommitRequest(value: unknown): EncryptedCommitRequest {
  const input = record(value, 'ENCRYPTED_COMMIT')
  exact(input, ['workspaceId', 'commitId', 'requestChecksum', 'expectedDataVersion', 'expectedKeyEpoch', 'expectedMembershipEpoch', 'dependencies', 'operations', 'checkpointId'], 'ENCRYPTED_COMMIT')
  const workspaceId = id(input.workspaceId, 'WORKSPACE_ID')
  const expectedDataVersion = positive(input.expectedDataVersion, 'EXPECTED_DATA_VERSION')
  const expectedKeyEpoch = positive(input.expectedKeyEpoch, 'EXPECTED_KEY_EPOCH')
  const expectedMembershipEpoch = positive(input.expectedMembershipEpoch, 'EXPECTED_MEMBERSHIP_EPOCH')
  if (typeof input.requestChecksum !== 'string' || !checksumPattern.test(input.requestChecksum)) throw new Error('INVALID_REQUEST_CHECKSUM')
  if (!Array.isArray(input.dependencies) || input.dependencies.length > 500) throw new Error('INVALID_DEPENDENCY_BATCH')
  const dependencies = input.dependencies.map((candidate): EncryptedCommitDependency => {
    const dependency = record(candidate, 'ENCRYPTED_DEPENDENCY')
    exact(dependency, ['kind', 'entityId', 'fieldClass', 'expectedRowVersion'], 'ENCRYPTED_DEPENDENCY')
    const kind = member(dependency.kind, ['entity', 'private'] as const, 'DEPENDENCY_KIND')
    return {
      kind,
      entityId: id(dependency.entityId, 'DEPENDENCY_ENTITY_ID'),
      fieldClass: kind === 'entity'
        ? member(dependency.fieldClass, SHARED_FIELD_CLASSES, 'SHARED_FIELD_CLASS')
        : member(dependency.fieldClass, PRIVATE_FIELD_CLASSES, 'PRIVATE_FIELD_CLASS'),
      expectedRowVersion: nonnegative(dependency.expectedRowVersion, 'DEPENDENCY_ROW_VERSION'),
    }
  })
  if (!Array.isArray(input.operations) || input.operations.length < 1 || input.operations.length > 500) throw new Error('INVALID_OPERATION_BATCH')
  const operations = input.operations.map((candidate): EncryptedCommitOperation => {
    const operation = record(candidate, 'ENCRYPTED_OPERATION')
    switch (operation.type) {
      case 'entity_upsert': {
        exact(operation, ['type', 'entityId', 'fieldClass', 'expectedRowVersion', 'keyId', 'keyEpoch', 'envelope'], 'ENTITY_OPERATION')
        const expectedRowVersion = nonnegative(operation.expectedRowVersion, 'EXPECTED_ROW_VERSION')
        const parsed = parseEncryptedEntityRecord({ workspaceId, entityId: operation.entityId, fieldClass: operation.fieldClass,
          rowVersion: expectedRowVersion + 1, keyId: operation.keyId, keyEpoch: operation.keyEpoch,
          writerPrincipalId: parseEncryptedEnvelope(operation.envelope).aad.writerId,
          writerId: parseEncryptedEnvelope(operation.envelope).aad.writerId, envelope: operation.envelope })
        if (parsed.keyEpoch !== expectedKeyEpoch) throw new Error('STALE_KEY_EPOCH')
        return { type: 'entity_upsert', entityId: parsed.entityId, fieldClass: parsed.fieldClass,
          expectedRowVersion, keyId: parsed.keyId,
          keyEpoch: parsed.keyEpoch, envelope: parsed.envelope }
      }
      case 'entity_delete':
        exact(operation, ['type', 'entityId', 'fieldClass', 'expectedRowVersion'], 'ENTITY_DELETE')
        return { type: 'entity_delete', entityId: id(operation.entityId, 'ENTITY_ID'),
          fieldClass: member(operation.fieldClass, SHARED_FIELD_CLASSES, 'SHARED_FIELD_CLASS'),
          expectedRowVersion: positive(operation.expectedRowVersion, 'EXPECTED_ROW_VERSION') }
      case 'private_upsert': {
        exact(operation, ['type', 'personId', 'fieldClass', 'expectedRowVersion', 'keyId', 'keyEpoch', 'authorizationId', 'envelope'], 'PRIVATE_OPERATION')
        const expectedRowVersion = nonnegative(operation.expectedRowVersion, 'EXPECTED_ROW_VERSION')
        const parsed = parseEncryptedPrivateFieldRecord({ workspaceId, personId: operation.personId, fieldClass: operation.fieldClass,
          rowVersion: expectedRowVersion + 1, keyId: operation.keyId, keyEpoch: operation.keyEpoch,
          writerPrincipalId: parseEncryptedEnvelope(operation.envelope).aad.writerId,
          writerId: parseEncryptedEnvelope(operation.envelope).aad.writerId, envelope: operation.envelope })
        if (parsed.keyEpoch !== expectedKeyEpoch) throw new Error('STALE_KEY_EPOCH')
        return { type: 'private_upsert', personId: parsed.personId, fieldClass: parsed.fieldClass,
          expectedRowVersion, keyId: parsed.keyId,
          keyEpoch: parsed.keyEpoch, authorizationId: id(operation.authorizationId, 'AUTHORIZATION_ID'), envelope: parsed.envelope }
      }
      case 'private_delete':
        exact(operation, ['type', 'personId', 'fieldClass', 'expectedRowVersion', 'authorizationId'], 'PRIVATE_DELETE')
        return { type: 'private_delete', personId: id(operation.personId, 'PERSON_ID'),
          fieldClass: member(operation.fieldClass, PRIVATE_FIELD_CLASSES, 'PRIVATE_FIELD_CLASS'),
          expectedRowVersion: positive(operation.expectedRowVersion, 'EXPECTED_ROW_VERSION'),
          authorizationId: id(operation.authorizationId, 'AUTHORIZATION_ID') }
      case 'key_envelope_insert': {
        exact(operation, ['type', 'wrappedEnvelope'], 'KEY_ENVELOPE_OPERATION')
        const wrappedEnvelope = parseWrappedKeyEnvelope(operation.wrappedEnvelope)
        if (wrappedEnvelope.context.workspaceId !== workspaceId || wrappedEnvelope.context.keyEpoch !== expectedKeyEpoch) {
          throw new Error('KEY_ENVELOPE_COMMIT_BINDING_MISMATCH')
        }
        return { type: 'key_envelope_insert', wrappedEnvelope }
      }
      default:
        throw new Error('UNSUPPORTED_ENCRYPTED_OPERATION')
    }
  })
  return { workspaceId, commitId: id(input.commitId, 'COMMIT_ID'), requestChecksum: input.requestChecksum,
    expectedDataVersion, expectedKeyEpoch, expectedMembershipEpoch, dependencies, operations,
    checkpointId: id(input.checkpointId, 'CHECKPOINT_ID') }
}
