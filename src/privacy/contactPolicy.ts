import { canonicalize, encodeBase64Url } from '../crypto/contract'
import { signArtifact, verifyArtifact, type SignedArtifactV1 } from '../crypto/keyContract'
import type { MemberPersonBinding } from '../identity/memberPersonBinding'
import type { PrivateFieldClass } from '../crypto/encryptedDataContract'
import type { Relationship } from '../types/family'

export type ContactAudience = 'self_only' | 'direct_family' | 'close_blood' | 'blood_only' | 'workspace_members' | 'custom'
export type ParentEdgeKind = 'biological' | 'adoptive' | 'step'

export interface ContactPolicyRule {
  audience: ContactAudience
  allowPrincipalIds: string[]
  denyPrincipalIds: string[]
}

export interface ContactPolicyEvaluationInput {
  profileId: string
  profilePersonIds: string[]
  subjectPersonId: string
  fieldClass: PrivateFieldClass
  relationships: Relationship[]
  parentEdgeKinds?: Record<string, ParentEdgeKind>
  bindings: MemberPersonBinding[]
  rule: ContactPolicyRule
}

export interface ContactPolicyDecision {
  principalId: string
  personId: string
  allowed: boolean
  reason: 'self' | 'direct' | 'close_blood' | 'blood' | 'workspace' | 'custom_allow' | 'explicit_deny' | 'not_in_audience'
}

export interface ContactPolicyPreview {
  recipients: string[]
  decisions: ContactPolicyDecision[]
  manifest: string
}

export interface ContactPolicyArtifactPayload extends Record<string, unknown> {
  policyId: string
  workspaceId: string
  profileId: string
  personId: string
  fieldClass: PrivateFieldClass
  audience: ContactAudience
  allowPrincipalIds: string[]
  denyPrincipalIds: string[]
  recipientPrincipalIds: string[]
  subjectBindingId: string | null
  policyRevision: number
  graphRevision: number
  bindingRevision: number
  keyEpoch: number
  nonce: string
  expiresAt: number
}

export interface ContactEditArtifactPayload extends Record<string, unknown> {
  authorizationId: string
  workspaceId: string
  actorPrincipalId: string
  personId: string
  fieldClass: PrivateFieldClass
  policyRevision: number
  graphRevision: number
  bindingRevision: number
  keyEpoch: number
  nonce: string
  expiresAt: number
}

const activeSpouse = new Set(['married', 'partner', 'unknown'])
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u

function sortedUnique(values: string[]): string[] { return [...new Set(values)].sort() }
function add(map: Map<string, Set<string>>, left: string, right: string): void {
  const values = map.get(left) ?? new Set<string>(); values.add(right); map.set(left, values)
}

function assertGraph(input: ContactPolicyEvaluationInput): void {
  const people = new Set(input.profilePersonIds)
  if (!people.has(input.subjectPersonId) || people.size !== input.profilePersonIds.length) throw new Error('CONTACT_POLICY_GRAPH_INVALID')
  const parentEdges = input.relationships.filter((relationship) => relationship.type === 'parent')
  for (const relationship of input.relationships) {
    if (!people.has(relationship.person1Id) || !people.has(relationship.person2Id) || relationship.person1Id === relationship.person2Id) {
      throw new Error('CONTACT_POLICY_GRAPH_INVALID')
    }
    const kind = input.parentEdgeKinds?.[relationship.id]
    if (relationship.type === 'parent' && kind && !['biological','adoptive','step'].includes(kind)) throw new Error('CONTACT_POLICY_GRAPH_INVALID')
  }
  const visiting = new Set<string>(); const visited = new Set<string>(); const children = new Map<string, Set<string>>()
  for (const edge of parentEdges) { add(children, edge.person1Id, edge.person2Id) }
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error('CONTACT_POLICY_GRAPH_INVALID')
    if (visited.has(id)) return
    visiting.add(id); for (const child of children.get(id) ?? []) visit(child); visiting.delete(id); visited.add(id)
  }
  for (const id of people) visit(id)
}

function reachable(start: string, graph: Map<string, Set<string>>, maxDistance = Number.POSITIVE_INFINITY): Map<string, number> {
  const distances = new Map([[start, 0]]); const queue = [start]
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]; const distance = distances.get(current) ?? 0
    if (distance >= maxDistance) continue
    for (const next of graph.get(current) ?? []) if (!distances.has(next)) { distances.set(next, distance + 1); queue.push(next) }
  }
  return distances
}

export async function evaluateContactPolicy(input: ContactPolicyEvaluationInput): Promise<ContactPolicyPreview> {
  assertGraph(input)
  const bindings = input.bindings.filter((binding) => binding.profileId === input.profileId && binding.state === 'confirmed')
  const biological = new Map<string, Set<string>>(); const direct = new Set([input.subjectPersonId])
  const parentsByChild = new Map<string, Set<string>>()
  for (const relationship of input.relationships) {
    if (relationship.type === 'spouse') {
      if (activeSpouse.has(relationship.status ?? 'unknown')) {
        if (relationship.person1Id === input.subjectPersonId) direct.add(relationship.person2Id)
        if (relationship.person2Id === input.subjectPersonId) direct.add(relationship.person1Id)
      }
      continue
    }
    const kind = input.parentEdgeKinds?.[relationship.id] ?? 'biological'
    if (kind !== 'step') {
      add(parentsByChild, relationship.person2Id, relationship.person1Id)
      if (relationship.person1Id === input.subjectPersonId) direct.add(relationship.person2Id)
      if (relationship.person2Id === input.subjectPersonId) direct.add(relationship.person1Id)
    }
    if (kind === 'biological') { add(biological, relationship.person1Id, relationship.person2Id); add(biological, relationship.person2Id, relationship.person1Id) }
  }
  for (const parentId of parentsByChild.get(input.subjectPersonId) ?? []) {
    for (const [childId, parentIds] of parentsByChild) if (childId !== input.subjectPersonId && parentIds.has(parentId)) direct.add(childId)
  }
  const closeBlood = reachable(input.subjectPersonId, biological, 4)
  const allBlood = reachable(input.subjectPersonId, biological)
  const allow = new Set(input.rule.allowPrincipalIds); const deny = new Set(input.rule.denyPrincipalIds)
  const decisions: ContactPolicyDecision[] = bindings.map((binding) => {
    let allowed = false
    let reason: ContactPolicyDecision['reason'] = 'not_in_audience'
    if (input.rule.audience === 'workspace_members') { allowed = true; reason = 'workspace' }
    else if (input.rule.audience === 'direct_family' && direct.has(binding.personId)) { allowed = true; reason = binding.personId === input.subjectPersonId ? 'self' : 'direct' }
    else if (input.rule.audience === 'close_blood' && closeBlood.has(binding.personId)) { allowed = true; reason = binding.personId === input.subjectPersonId ? 'self' : 'close_blood' }
    else if (input.rule.audience === 'blood_only' && allBlood.has(binding.personId)) { allowed = true; reason = binding.personId === input.subjectPersonId ? 'self' : 'blood' }
    else if (input.rule.audience === 'self_only' && binding.personId === input.subjectPersonId) { allowed = true; reason = 'self' }
    if (allow.has(binding.principalId)) { allowed = true; reason = 'custom_allow' }
    if (deny.has(binding.principalId)) { allowed = false; reason = 'explicit_deny' }
    return { principalId: binding.principalId, personId: binding.personId, allowed, reason }
  }).sort((left, right) => left.principalId.localeCompare(right.principalId))
  const recipients = decisions.filter((decision) => decision.allowed).map((decision) => decision.principalId)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalize({
    profileId: input.profileId, personId: input.subjectPersonId, fieldClass: input.fieldClass, rule: input.rule, recipients,
  })))
  return { recipients, decisions, manifest: `sha256:${encodeBase64Url(new Uint8Array(digest))}` }
}

function validArtifactPayload(value: unknown): value is ContactPolicyArtifactPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const payload = value as ContactPolicyArtifactPayload
  const keys = ['policyId','workspaceId','profileId','personId','fieldClass','audience','allowPrincipalIds','denyPrincipalIds',
    'recipientPrincipalIds','subjectBindingId','policyRevision','graphRevision','bindingRevision','keyEpoch','nonce','expiresAt']
  return Object.keys(payload).sort().join('|') === keys.sort().join('|') &&
    [payload.policyId,payload.workspaceId,payload.profileId,payload.personId,payload.nonce].every((value) => typeof value === 'string' && idPattern.test(value)) &&
    ['phone','email','address','private_note'].includes(payload.fieldClass) &&
    ['self_only','direct_family','close_blood','blood_only','workspace_members','custom'].includes(payload.audience) &&
    [payload.policyRevision,payload.graphRevision,payload.bindingRevision,payload.keyEpoch,payload.expiresAt].every((value) => Number.isSafeInteger(value) && value > 0) &&
    [payload.allowPrincipalIds,payload.denyPrincipalIds,payload.recipientPrincipalIds].every((values) => Array.isArray(values) &&
      values.every((value) => typeof value === 'string' && idPattern.test(value)) && JSON.stringify(values) === JSON.stringify(sortedUnique(values))) &&
    (payload.subjectBindingId === null || (typeof payload.subjectBindingId === 'string' && idPattern.test(payload.subjectBindingId)))
}

export function parseContactPolicyArtifact(value: unknown): SignedArtifactV1<ContactPolicyArtifactPayload> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_CONTACT_POLICY_ARTIFACT')
  const artifact = value as Partial<SignedArtifactV1<ContactPolicyArtifactPayload>>
  if (Object.keys(artifact).sort().join('|') !== 'payload|purpose|signature|signerKeyFingerprint|signerPrincipalId|version' ||
      artifact.version !== 1 || artifact.purpose !== 'policy' || typeof artifact.signerPrincipalId !== 'string' ||
      typeof artifact.signerKeyFingerprint !== 'string' || typeof artifact.signature !== 'string' || !validArtifactPayload(artifact.payload)) {
    throw new Error('INVALID_CONTACT_POLICY_ARTIFACT')
  }
  return artifact as SignedArtifactV1<ContactPolicyArtifactPayload>
}

export async function signContactPolicy(
  payload: ContactPolicyArtifactPayload,
  signerPrincipalId: string,
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<SignedArtifactV1<ContactPolicyArtifactPayload>> {
  if (!validArtifactPayload(payload)) throw new Error('INVALID_CONTACT_POLICY_ARTIFACT')
  return signArtifact(payload, 'policy', signerPrincipalId, privateKey, publicKey)
}

export async function verifyContactPolicy(
  artifact: SignedArtifactV1<ContactPolicyArtifactPayload>,
  publicKey: CryptoKey,
  expected: { principalId: string; fingerprint: string; policyRevision: number; graphRevision: number; bindingRevision: number; nowEpochSeconds: number },
): Promise<boolean> {
  if (!artifact || !validArtifactPayload(artifact.payload) || artifact.payload.policyRevision !== expected.policyRevision ||
      artifact.payload.graphRevision !== expected.graphRevision || artifact.payload.bindingRevision !== expected.bindingRevision ||
      artifact.payload.expiresAt <= expected.nowEpochSeconds) return false
  return verifyArtifact(artifact, publicKey, { purpose: 'policy', principalId: expected.principalId, fingerprint: expected.fingerprint })
}

function validEditPayload(value: unknown): value is ContactEditArtifactPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const payload = value as ContactEditArtifactPayload
  const keys = ['authorizationId','workspaceId','actorPrincipalId','personId','fieldClass','policyRevision','graphRevision',
    'bindingRevision','keyEpoch','nonce','expiresAt']
  return Object.keys(payload).sort().join('|') === keys.sort().join('|') &&
    [payload.authorizationId,payload.workspaceId,payload.actorPrincipalId,payload.personId,payload.nonce]
      .every((item) => typeof item === 'string' && idPattern.test(item)) &&
    ['phone','email','address','private_note'].includes(payload.fieldClass) &&
    [payload.policyRevision,payload.graphRevision,payload.bindingRevision,payload.keyEpoch,payload.expiresAt]
      .every((item) => Number.isSafeInteger(item) && item > 0)
}

export function parseContactEditArtifact(value: unknown): SignedArtifactV1<ContactEditArtifactPayload> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_CONTACT_EDIT_ARTIFACT')
  const artifact = value as Partial<SignedArtifactV1<ContactEditArtifactPayload>>
  if (Object.keys(artifact).sort().join('|') !== 'payload|purpose|signature|signerKeyFingerprint|signerPrincipalId|version' ||
      artifact.version !== 1 || artifact.purpose !== 'policy' || typeof artifact.signerPrincipalId !== 'string' ||
      typeof artifact.signerKeyFingerprint !== 'string' || typeof artifact.signature !== 'string' || !validEditPayload(artifact.payload)) {
    throw new Error('INVALID_CONTACT_EDIT_ARTIFACT')
  }
  return artifact as SignedArtifactV1<ContactEditArtifactPayload>
}

export async function signContactEditAuthorization(
  payload: ContactEditArtifactPayload,
  signerPrincipalId: string,
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<SignedArtifactV1<ContactEditArtifactPayload>> {
  if (!validEditPayload(payload)) throw new Error('INVALID_CONTACT_EDIT_ARTIFACT')
  return signArtifact(payload, 'policy', signerPrincipalId, privateKey, publicKey)
}

export async function verifyContactEditAuthorization(
  artifact: SignedArtifactV1<ContactEditArtifactPayload>,
  publicKey: CryptoKey,
  expected: { policyPrincipalId: string; fingerprint: string; policyRevision: number; graphRevision: number;
    bindingRevision: number; keyEpoch: number; nowEpochSeconds: number },
): Promise<boolean> {
  if (!artifact || !validEditPayload(artifact.payload) || artifact.payload.policyRevision !== expected.policyRevision ||
      artifact.payload.graphRevision !== expected.graphRevision || artifact.payload.bindingRevision !== expected.bindingRevision ||
      artifact.payload.keyEpoch !== expected.keyEpoch || artifact.payload.expiresAt <= expected.nowEpochSeconds ||
      artifact.payload.expiresAt > expected.nowEpochSeconds + 600) return false
  return verifyArtifact(artifact, publicKey, { purpose: 'policy', principalId: expected.policyPrincipalId, fingerprint: expected.fingerprint })
}
