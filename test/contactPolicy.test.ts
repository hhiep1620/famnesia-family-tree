import { describe, expect, it } from 'vitest'
import { generateProvisioningSigningKeyPair, publicKeyFingerprint } from '../src/crypto/keyContract'
import type { MemberPersonBinding } from '../src/identity/memberPersonBinding'
import {
  evaluateContactPolicy,
  signContactPolicy,
  signContactEditAuthorization,
  verifyContactEditAuthorization,
  verifyContactPolicy,
  type ContactPolicyArtifactPayload,
  type ContactPolicyEvaluationInput,
} from '../src/privacy/contactPolicy'
import type { Relationship } from '../src/types/family'

const people = ['SELF','PARENT','OTHER_PARENT','SPOUSE','SPOUSE_PARENT','CHILD','HALF','GRANDPARENT','AUNT','COUSIN','COUSIN_SPOUSE','ADOPTED','STEP']
const relationships: Relationship[] = [
  { id: 'r-parent', person1Id: 'PARENT', person2Id: 'SELF', type: 'parent' },
  { id: 'r-other-parent', person1Id: 'OTHER_PARENT', person2Id: 'SELF', type: 'parent' },
  { id: 'r-spouse', person1Id: 'SELF', person2Id: 'SPOUSE', type: 'spouse', status: 'married' },
  { id: 'r-spouse-parent', person1Id: 'SPOUSE_PARENT', person2Id: 'SPOUSE', type: 'parent' },
  { id: 'r-child', person1Id: 'SELF', person2Id: 'CHILD', type: 'parent' },
  { id: 'r-half', person1Id: 'PARENT', person2Id: 'HALF', type: 'parent' },
  { id: 'r-grandparent', person1Id: 'GRANDPARENT', person2Id: 'PARENT', type: 'parent' },
  { id: 'r-aunt', person1Id: 'GRANDPARENT', person2Id: 'AUNT', type: 'parent' },
  { id: 'r-cousin', person1Id: 'AUNT', person2Id: 'COUSIN', type: 'parent' },
  { id: 'r-cousin-spouse', person1Id: 'COUSIN', person2Id: 'COUSIN_SPOUSE', type: 'spouse', status: 'married' },
  { id: 'r-adopted', person1Id: 'SELF', person2Id: 'ADOPTED', type: 'parent' },
  { id: 'r-step', person1Id: 'SELF', person2Id: 'STEP', type: 'parent' },
]

function binding(personId: string): MemberPersonBinding {
  return { bindingId: `binding-${personId.toLowerCase().replaceAll('_','-')}`, workspaceId: 'workspace-one', profileId: 'profile-one', personId,
    principalId: `principal-${personId.toLowerCase().replaceAll('_','-')}`, state: 'confirmed', bindingVersion: 3,
    unwrapFingerprint: `sha256:${'a'.repeat(43)}`, signingFingerprint: `sha256:${'b'.repeat(43)}` }
}

function input(audience: ContactPolicyEvaluationInput['rule']['audience']): ContactPolicyEvaluationInput {
  return { profileId: 'profile-one', profilePersonIds: people, subjectPersonId: 'SELF', fieldClass: 'phone', relationships,
    parentEdgeKinds: { 'r-adopted': 'adoptive', 'r-step': 'step' }, bindings: people.map(binding),
    rule: { audience, allowPrincipalIds: [], denyPrincipalIds: [] } }
}

describe('CR-07 relationship-aware contact policy', () => {
  it('implements the normative direct-family truth table without crossing spouse boundaries', async () => {
    const result = await evaluateContactPolicy(input('direct_family'))
    expect(result.recipients).toEqual([
      'principal-adopted','principal-child','principal-half','principal-other-parent','principal-parent','principal-self','principal-spouse',
    ])
    expect(result.recipients).not.toContain('principal-spouse-parent')
    expect(result.recipients).not.toContain('principal-step')
  })

  it('allows close blood cousin but denies cousin spouse and spouse family', async () => {
    const close = await evaluateContactPolicy(input('close_blood'))
    expect(close.recipients).toContain('principal-cousin')
    expect(close.recipients).toContain('principal-half')
    expect(close.recipients).not.toContain('principal-cousin-spouse')
    expect(close.recipients).not.toContain('principal-spouse-parent')
    expect(close.recipients).not.toContain('principal-adopted')
  })

  it('uses strongest permitted path, explicit custom allow and deny precedence', async () => {
    const candidate = input('direct_family')
    candidate.relationships = [...candidate.relationships, { id: 'r-blood-spouse-parent', person1Id: 'PARENT', person2Id: 'SPOUSE_PARENT', type: 'parent' }]
    candidate.rule.allowPrincipalIds = ['principal-cousin-spouse']
    candidate.rule.denyPrincipalIds = ['principal-spouse','principal-cousin-spouse']
    const result = await evaluateContactPolicy(candidate)
    expect(result.recipients).not.toContain('principal-spouse')
    expect(result.recipients).not.toContain('principal-cousin-spouse')
    expect(result.decisions.find((item) => item.principalId === 'principal-cousin-spouse')?.reason).toBe('explicit_deny')

    const blood = await evaluateContactPolicy({ ...candidate, rule: { audience: 'blood_only', allowPrincipalIds: [], denyPrincipalIds: [] } })
    expect(blood.recipients).toContain('principal-spouse-parent')
  })

  it('denies unbound members and fails closed on cyclic or malformed graphs', async () => {
    const candidate = input('workspace_members'); candidate.bindings = candidate.bindings.filter((item) => item.personId !== 'COUSIN')
    expect((await evaluateContactPolicy(candidate)).recipients).not.toContain('principal-cousin')
    const cyclic = input('blood_only')
    cyclic.relationships = [...cyclic.relationships, { id: 'cycle', person1Id: 'SELF', person2Id: 'GRANDPARENT', type: 'parent' }]
    await expect(evaluateContactPolicy(cyclic)).rejects.toThrow('CONTACT_POLICY_GRAPH_INVALID')
  })

  it('signs exact revisioned policy artifacts and rejects wrong principal or stale versions', async () => {
    const pair = await generateProvisioningSigningKeyPair(); const fingerprint = await publicKeyFingerprint(pair.publicKey)
    const payload: ContactPolicyArtifactPayload = {
      policyId: 'policy-one', workspaceId: 'workspace-one', profileId: 'profile-one', personId: 'person-one', fieldClass: 'phone',
      audience: 'direct_family', allowPrincipalIds: [], denyPrincipalIds: [], recipientPrincipalIds: ['principal-one'],
      subjectBindingId: 'binding-one', policyRevision: 2, graphRevision: 1, bindingRevision: 3, keyEpoch: 1,
      nonce: 'nonce-one', expiresAt: 2_000_000_000,
    }
    const artifact = await signContactPolicy(payload, 'principal-one', pair.privateKey, pair.publicKey)
    await expect(verifyContactPolicy(artifact, pair.publicKey, { principalId: 'principal-one', fingerprint,
      policyRevision: 2, graphRevision: 1, bindingRevision: 3, nowEpochSeconds: 1_900_000_000 })).resolves.toBe(true)
    await expect(verifyContactPolicy(artifact, pair.publicKey, { principalId: 'principal-attacker', fingerprint,
      policyRevision: 2, graphRevision: 1, bindingRevision: 3, nowEpochSeconds: 1_900_000_000 })).resolves.toBe(false)
    await expect(verifyContactPolicy(artifact, pair.publicKey, { principalId: 'principal-one', fingerprint,
      policyRevision: 2, graphRevision: 1, bindingRevision: 4, nowEpochSeconds: 1_900_000_000 })).resolves.toBe(false)
  })

  it('binds edit authorization to one actor, field, epoch and ten-minute window', async () => {
    const pair = await generateProvisioningSigningKeyPair(); const fingerprint = await publicKeyFingerprint(pair.publicKey)
    const artifact = await signContactEditAuthorization({ authorizationId: 'auth-one', workspaceId: 'workspace-one',
      actorPrincipalId: 'principal-editor', personId: 'person-one', fieldClass: 'phone', policyRevision: 2,
      graphRevision: 1, bindingRevision: 3, keyEpoch: 2, nonce: 'nonce-edit-one', expiresAt: 1_900_000_300 },
    'principal-owner', pair.privateKey, pair.publicKey)
    await expect(verifyContactEditAuthorization(artifact, pair.publicKey, { policyPrincipalId: 'principal-owner', fingerprint,
      policyRevision: 2, graphRevision: 1, bindingRevision: 3, keyEpoch: 2, nowEpochSeconds: 1_900_000_000 })).resolves.toBe(true)
    const wrongField = structuredClone(artifact); wrongField.payload.fieldClass = 'address'
    await expect(verifyContactEditAuthorization(wrongField, pair.publicKey, { policyPrincipalId: 'principal-owner', fingerprint,
      policyRevision: 2, graphRevision: 1, bindingRevision: 3, keyEpoch: 2, nowEpochSeconds: 1_900_000_000 })).resolves.toBe(false)
  })
})
