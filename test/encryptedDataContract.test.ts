import { describe, expect, it } from 'vitest'
import type { EncryptedEnvelopeV1 } from '../src/crypto/contract'
import {
  assertContactEditAuthorization,
  parseEncryptedCommitRequest,
  parseEncryptedEntityRecord,
  parseEncryptedKeyEnvelopeRecord,
  parseEncryptedPrivateFieldRecord,
} from '../src/crypto/encryptedDataContract'

const workspaceId = '91000000-0000-4000-8000-000000000001'
const writerId = 'cp_abcdefghijklmnopqrstuvwxyz'
const checksum = `sha256:${'A'.repeat(43)}`

function envelope(entityId: string, fieldClass: string, purpose: 'family-content' | 'contact'): EncryptedEnvelopeV1 {
  return {
    version: 1,
    suite: 'FAMNESIA-P256-AESGCM-HKDF-SHA256-V1',
    nonce: 'ICEiIyQlJicoKSor',
    ciphertext: 'AAECAwQFBgcICQoLDA0ODxAREhM',
    aad: { workspaceId, entityId, fieldClass, schemaVersion: 1, dataVersion: 8,
      keyId: purpose === 'contact' ? 'ck-person-1-phone' : 'wk-family-1', keyEpoch: 2, writerId, purpose },
  }
}

function wrappedEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    suite: 'FAMNESIA-P256-AESGCM-HKDF-SHA256-V1',
    context: {
      envelopeId: 'env-1', workspaceId, entityId: 'workspace-root', recipientPrincipalId: writerId,
      recipientKeyFingerprint: checksum, keyId: 'wk-family-1', keyPurpose: 'workspace', keyEpoch: 2,
      directoryRevision: 3, issuerPrincipalId: writerId, issuerSigningFingerprint: checksum,
      expiresAt: 1_900_000_000, ...overrides,
    },
    ephemeralPublicKey: { kty: 'EC', crv: 'P-256', x: 'A'.repeat(43), y: 'B'.repeat(43) },
    salt: 'A'.repeat(43), nonce: 'ICEiIyQlJicoKSor', wrappedKey: 'A'.repeat(64), issuerSignature: 'A'.repeat(86),
  }
}

describe('CR-04 encrypted relational contract', () => {
  it('accepts a correctly bound shared row and rejects workspace/entity substitution', () => {
    const row = { workspaceId, entityId: 'person-1', fieldClass: 'person_core', rowVersion: 8,
      keyId: 'wk-family-1', keyEpoch: 2, writerPrincipalId: writerId,
      envelope: envelope('person-1', 'person_core', 'family-content') }
    expect(parseEncryptedEntityRecord(row)).toMatchObject({ entityId: 'person-1', fieldClass: 'person_core' })
    expect(() => parseEncryptedEntityRecord({ ...row, workspaceId: '91000000-0000-4000-8000-000000000099' }))
      .toThrow('AAD_RECORD_BINDING_MISMATCH')
    expect(() => parseEncryptedEntityRecord({ ...row, entityId: 'person-2' })).toThrow('AAD_RECORD_BINDING_MISMATCH')
  })

  it('keeps contact fields separate and forbids bundle replacement', () => {
    const row = { workspaceId, personId: 'person-1', fieldClass: 'phone', rowVersion: 8,
      keyId: 'ck-person-1-phone', keyEpoch: 2, writerPrincipalId: writerId,
      envelope: envelope('person-1', 'phone', 'contact') }
    expect(parseEncryptedPrivateFieldRecord(row)).toMatchObject({ fieldClass: 'phone' })
    expect(() => parseEncryptedPrivateFieldRecord({ ...row, fieldClass: 'bundle' })).toThrow('INVALID_PRIVATE_FIELD_CLASS')
    expect(() => parseEncryptedPrivateFieldRecord({ ...row, fieldClass: 'address' })).toThrow('AAD_RECORD_BINDING_MISMATCH')
  })

  it('binds wrapped keys to workspace, recipient, purpose and key version', () => {
    const value = { workspaceId, envelopeId: 'env-1', entityId: 'workspace-root', keyId: 'wk-family-1',
      keyPurpose: 'workspace', keyEpoch: 2, directoryRevision: 3, recipientPrincipalId: writerId,
      recipientUnwrapFingerprint: checksum, issuerPrincipalId: writerId, issuerSigningFingerprint: checksum,
      wrappedEnvelope: wrappedEnvelope() }
    expect(parseEncryptedKeyEnvelopeRecord(value).keyPurpose).toBe('workspace')
    expect(() => parseEncryptedKeyEnvelopeRecord({ ...value, recipientPrincipalId: 'cp_zyxwvutsrqponmlkjihgfedcba' }))
      .toThrow('KEY_ENVELOPE_RECORD_BINDING_MISMATCH')
    expect(() => parseEncryptedKeyEnvelopeRecord({ ...value, keyPurpose: 'recovery' })).toThrow('INVALID_KEY_PURPOSE')
  })

  it('rejects downgrade, stale epoch, extra fields and cross-workspace commit operations', () => {
    const operation = { type: 'entity_upsert', entityId: 'person-1', fieldClass: 'person_core', expectedRowVersion: 0,
      keyId: 'wk-family-1', keyEpoch: 2, envelope: envelope('person-1', 'person_core', 'family-content') }
    const request = { workspaceId, commitId: 'commit-1', requestChecksum: checksum,
      expectedDataVersion: 7, expectedKeyEpoch: 2, operations: [operation] }
    expect(parseEncryptedCommitRequest(request).operations).toHaveLength(1)
    expect(() => parseEncryptedCommitRequest({ ...request, operations: [{ ...operation, keyEpoch: 1 }] })).toThrow('AAD_RECORD_BINDING_MISMATCH')
    expect(() => parseEncryptedCommitRequest({ ...request, operations: [{ ...operation, bundle: true }] })).toThrow('INVALID_ENTITY_OPERATION_SHAPE')
    expect(() => parseEncryptedCommitRequest({ ...request, operations: [{ type: 'key_envelope_insert', wrappedEnvelope: wrappedEnvelope({ workspaceId: 'other-workspace' }) }] }))
      .toThrow('KEY_ENVELOPE_COMMIT_BINDING_MISMATCH')
  })

  it('requires exact active contact-edit scope', () => {
    const authorization = { authorizationId: 'auth-1', workspaceId, actorPrincipalId: writerId,
      personId: 'person-1', fieldClass: 'phone' as const, purpose: 'contact_edit' as const,
      policyRevision: 2, graphRevision: 3, bindingRevision: 4, keyEpoch: 2,
      expiresAt: '2030-01-01T00:00:00.000Z', revokedAt: null }
    const expected = { authorizationId: 'auth-1', workspaceId, actorPrincipalId: writerId,
      personId: 'person-1', fieldClass: 'phone' as const, policyRevision: 2,
      graphRevision: 3, bindingRevision: 4, keyEpoch: 2, now: new Date('2029-01-01') }
    expect(() => assertContactEditAuthorization(authorization, expected)).not.toThrow()
    expect(() => assertContactEditAuthorization(authorization, { ...expected, fieldClass: 'address' })).toThrow('CONTACT_AUTHORIZATION_SCOPE_MISMATCH')
    expect(() => assertContactEditAuthorization(authorization, { ...expected, now: new Date('2031-01-01') })).toThrow('CONTACT_AUTHORIZATION_INACTIVE')
  })
})

