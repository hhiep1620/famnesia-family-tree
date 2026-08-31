import type { Json, Tables } from '../types/database.generated'

export type MemberPersonBindingState = 'pending' | 'confirmed' | 'rejected' | 'revoked' | 'superseded'

export interface MemberPersonBinding {
  bindingId: string
  workspaceId: string
  profileId: string
  personId: string
  principalId: string
  state: MemberPersonBindingState
  bindingVersion?: number
  unwrapFingerprint?: string
  signingFingerprint?: string
  previousBindingId?: string
}

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const fingerprintPattern = /^sha256:[A-Za-z0-9_-]{43}$/u

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_MEMBER_BINDING')
  return value as Record<string, unknown>
}

function validId(value: unknown): value is string { return typeof value === 'string' && idPattern.test(value) }
function validVersion(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0 }

export function parseMemberBindingResult(value: unknown, workspaceId: string): MemberPersonBinding {
  const input = record(value)
  const keys = Object.keys(input).sort().join('|')
  const proposalKeys = 'bindingId|bindingRevision|personId|principalId|profileId|state'
  const decisionKeys = 'bindingId|bindingRevision|personId|previousBindingId|principalId|profileId|signingFingerprint|state|unwrapFingerprint'
  if (keys !== proposalKeys && keys !== decisionKeys) throw new Error('INVALID_MEMBER_BINDING_SHAPE')
  if (typeof input.bindingId !== 'string' || !uuidPattern.test(input.bindingId) || !validId(input.profileId) ||
      !validId(input.personId) || !validId(input.principalId) || !validVersion(input.bindingRevision) ||
      !['pending','confirmed','rejected','revoked','superseded'].includes(String(input.state))) {
    throw new Error('INVALID_MEMBER_BINDING')
  }
  const result: MemberPersonBinding = {
    bindingId: input.bindingId,
    workspaceId,
    profileId: input.profileId,
    personId: input.personId,
    principalId: input.principalId,
    state: input.state as MemberPersonBindingState,
    bindingVersion: input.state === 'confirmed' || input.state === 'revoked' || input.state === 'superseded'
      ? input.bindingRevision : undefined,
  }
  if (keys === decisionKeys) {
    if (input.unwrapFingerprint !== null && (typeof input.unwrapFingerprint !== 'string' || !fingerprintPattern.test(input.unwrapFingerprint))) {
      throw new Error('INVALID_MEMBER_BINDING_FINGERPRINT')
    }
    if (input.signingFingerprint !== null && (typeof input.signingFingerprint !== 'string' || !fingerprintPattern.test(input.signingFingerprint))) {
      throw new Error('INVALID_MEMBER_BINDING_FINGERPRINT')
    }
    if (input.previousBindingId !== null && (typeof input.previousBindingId !== 'string' || !uuidPattern.test(input.previousBindingId))) {
      throw new Error('INVALID_MEMBER_BINDING_PREVIOUS_ID')
    }
    result.unwrapFingerprint = input.unwrapFingerprint ?? undefined
    result.signingFingerprint = input.signingFingerprint ?? undefined
    result.previousBindingId = input.previousBindingId ?? undefined
  }
  return result
}

export function memberBindingFromRow(row: Tables<'member_person_bindings'>): MemberPersonBinding {
  return {
    bindingId: row.binding_id,
    workspaceId: row.workspace_id,
    profileId: row.profile_id,
    personId: row.person_id,
    principalId: row.principal_id,
    state: row.state,
    bindingVersion: row.binding_version ?? undefined,
    unwrapFingerprint: row.pinned_unwrap_fingerprint ?? undefined,
    signingFingerprint: row.pinned_signing_fingerprint ?? undefined,
  }
}

export function bindingRpcJson(value: Json): unknown { return value }
