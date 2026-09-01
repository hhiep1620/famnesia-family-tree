import { encodeBase64Url } from '../crypto/contract'
import { signArtifact, verifyArtifact, type SignedArtifactV1 } from '../crypto/keyContract'
import type { FamilyData, Person } from '../types/family'

export type PortabilityFormat = 'gedcom' | 'json' | 'xlsx'
export type PortabilityField = 'shared' | 'contact' | 'private_note'

export interface PortabilityExportPayload extends Record<string, unknown> {
  authorizationId: string
  workspaceId: string
  profileId: string
  format: PortabilityFormat
  personIds: string[]
  fields: PortabilityField[]
  livingPolicy: 'omit'
  policyRevision: number
  graphRevision: number
  bindingRevision: number
  keyEpoch: number
  nonce: string
  issuedAt: number
  expiresAt: number
}

export interface PortabilityScopeReport {
  format: PortabilityFormat
  includedPersonIds: string[]
  omittedPersonIds: string[]
  omittedFields: Array<{ personId: string; field: PortabilityField; reason: 'scope' | 'missing_key' | 'living_policy' }>
  mediaOmitted: number
}

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const hashPattern = /^sha256:[A-Za-z0-9_-]{43}$/u
const keys = ['authorizationId','workspaceId','profileId','format','personIds','fields','livingPolicy','policyRevision','graphRevision','bindingRevision','keyEpoch','nonce','issuedAt','expiresAt']

function validId(value: unknown): value is string { return typeof value === 'string' && idPattern.test(value) }
function positive(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0 }
function sortedUnique(values: string[]): boolean { return JSON.stringify(values) === JSON.stringify([...new Set(values)].sort()) }
function validPayload(value: unknown): value is PortabilityExportPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const p = value as PortabilityExportPayload
  return Object.keys(p).sort().join('|') === [...keys].sort().join('|') &&
    [p.authorizationId,p.workspaceId,p.profileId,p.nonce].every(validId) && ['gedcom','json','xlsx'].includes(p.format) &&
    Array.isArray(p.personIds) && p.personIds.every(validId) && sortedUnique(p.personIds) &&
    Array.isArray(p.fields) && p.fields.length >= 1 && p.fields.every((field) => ['shared','contact','private_note'].includes(field)) && sortedUnique(p.fields) &&
    p.livingPolicy === 'omit' && [p.policyRevision,p.graphRevision,p.bindingRevision,p.keyEpoch,p.issuedAt,p.expiresAt].every(positive) &&
    p.expiresAt > p.issuedAt && p.expiresAt <= p.issuedAt + 600
}

export function parsePortabilityExportArtifact(value: unknown): SignedArtifactV1<PortabilityExportPayload> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_PORTABILITY_EXPORT_ARTIFACT')
  const artifact = value as Partial<SignedArtifactV1<PortabilityExportPayload>>
  if (Object.keys(artifact).sort().join('|') !== 'payload|purpose|signature|signerKeyFingerprint|signerPrincipalId|version' ||
      artifact.version !== 1 || artifact.purpose !== 'portability_export' || !validId(artifact.signerPrincipalId) ||
      typeof artifact.signerKeyFingerprint !== 'string' || !hashPattern.test(artifact.signerKeyFingerprint) ||
      typeof artifact.signature !== 'string' || !validPayload(artifact.payload)) throw new Error('INVALID_PORTABILITY_EXPORT_ARTIFACT')
  return artifact as SignedArtifactV1<PortabilityExportPayload>
}

export async function signPortabilityExport(
  payload: PortabilityExportPayload, signerPrincipalId: string, privateKey: CryptoKey, publicKey: CryptoKey,
): Promise<SignedArtifactV1<PortabilityExportPayload>> {
  if (!validPayload(payload)) throw new Error('INVALID_PORTABILITY_EXPORT_ARTIFACT')
  return signArtifact(payload, 'portability_export', signerPrincipalId, privateKey, publicKey)
}

export async function verifyPortabilityExport(
  artifact: SignedArtifactV1<PortabilityExportPayload>, publicKey: CryptoKey,
  expected: { principalId: string; fingerprint: string; workspaceId: string; profileId: string; format: PortabilityFormat; nowEpochSeconds: number },
): Promise<boolean> {
  const p = artifact?.payload
  if (!validPayload(p) || p.workspaceId !== expected.workspaceId || p.profileId !== expected.profileId || p.format !== expected.format ||
      p.issuedAt > expected.nowEpochSeconds || p.expiresAt <= expected.nowEpochSeconds) return false
  return verifyArtifact(artifact, publicKey, { purpose: 'portability_export', principalId: expected.principalId, fingerprint: expected.fingerprint })
}

function cleanPerson(person: Person, fields: ReadonlySet<PortabilityField>, personInScope: boolean): Person {
  const result = { ...person }
  if (!personInScope || !fields.has('contact')) { result.phone1 = ''; result.phone2 = ''; result.address = '' }
  if (!personInScope || !fields.has('private_note')) result.note = ''
  return result
}

export function applyPortabilityPolicy(data: FamilyData, options: {
  format: PortabilityFormat
  personIds: ReadonlySet<string>
  fields: ReadonlySet<PortabilityField>
  livingPolicy?: 'omit'
  decryptableContactPersonIds?: ReadonlySet<string>
}): { data: FamilyData; report: PortabilityScopeReport } {
  const allowedPeople = new Set(data.persons.filter((person) => options.personIds.has(person.id)).map((person) => person.id))
  const decryptable = options.decryptableContactPersonIds ?? allowedPeople
  const omittedPersonIds = data.persons.filter((person) => !allowedPeople.has(person.id)).map((person) => person.id)
  const omittedFields: PortabilityScopeReport['omittedFields'] = []
  const persons = data.persons.filter((person) => allowedPeople.has(person.id)).map((person) => {
    const scoped = cleanPerson(person, options.fields, true)
    if (!person.isDeceased && options.fields.has('contact')) {
      scoped.phone1 = ''; scoped.phone2 = ''; scoped.address = ''
      omittedFields.push({ personId: person.id, field: 'contact', reason: 'living_policy' })
    } else if (options.fields.has('contact') && !decryptable.has(person.id)) {
      scoped.phone1 = ''; scoped.phone2 = ''; scoped.address = ''
      omittedFields.push({ personId: person.id, field: 'contact', reason: 'missing_key' })
    } else if (!options.fields.has('contact')) omittedFields.push({ personId: person.id, field: 'contact', reason: 'scope' })
    if (!person.isDeceased) {
      if (options.fields.has('private_note')) scoped.note = ''
      omittedFields.push({ personId: person.id, field: 'private_note', reason: 'living_policy' })
    } else if (!options.fields.has('private_note')) omittedFields.push({ personId: person.id, field: 'private_note', reason: 'scope' })
    return scoped
  })
  const personIds = new Set(persons.map((person) => person.id))
  const profiles = data.profiles.map((profile) => ({ ...profile, subjectPersonId: personIds.has(profile.subjectPersonId ?? '') ? profile.subjectPersonId : null }))
  return {
    data: { ...data, profiles, persons, relationships: data.relationships.filter((r) => personIds.has(r.person1Id) && personIds.has(r.person2Id)), media: [] },
    report: { format: options.format, includedPersonIds: [...personIds].sort(), omittedPersonIds, omittedFields, mediaOmitted: data.media.length },
  }
}

export async function nonceHash(nonce: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce))
  return `sha256:${encodeBase64Url(new Uint8Array(digest))}`
}
