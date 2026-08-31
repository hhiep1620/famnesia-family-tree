import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseMemberBindingResult } from '../src/identity/memberPersonBinding'

const workspaceId = '42000000-0000-4000-8000-000000000001'
const bindingId = '43000000-0000-4000-8000-000000000001'

describe('CR-06 member-person binding contract', () => {
  it('parses pending and confirmed binding artifacts with pinned fingerprints', () => {
    expect(parseMemberBindingResult({ bindingId, bindingRevision: 1, profileId: 'profile-opaque', personId: 'person-opaque',
      principalId: 'cp_aaaaaaaaaaaaaaaaaaaaaaaa', state: 'pending' }, workspaceId)).toMatchObject({ state: 'pending', bindingVersion: undefined })
    expect(parseMemberBindingResult({ bindingId, bindingRevision: 2, profileId: 'profile-opaque', personId: 'person-opaque',
      principalId: 'cp_aaaaaaaaaaaaaaaaaaaaaaaa', state: 'confirmed', previousBindingId: null,
      unwrapFingerprint: `sha256:${'a'.repeat(43)}`, signingFingerprint: `sha256:${'b'.repeat(43)}` }, workspaceId))
      .toMatchObject({ state: 'confirmed', bindingVersion: 2, unwrapFingerprint: `sha256:${'a'.repeat(43)}` })
  })

  it('rejects extra fields, malformed fingerprints and ambiguous identity', () => {
    const base = { bindingId, bindingRevision: 2, profileId: 'profile-opaque', personId: 'person-opaque',
      principalId: 'cp_aaaaaaaaaaaaaaaaaaaaaaaa', state: 'confirmed', previousBindingId: null,
      unwrapFingerprint: `sha256:${'a'.repeat(43)}`, signingFingerprint: `sha256:${'b'.repeat(43)}` }
    expect(() => parseMemberBindingResult({ ...base, personName: 'Protected' }, workspaceId)).toThrow('INVALID_MEMBER_BINDING_SHAPE')
    expect(() => parseMemberBindingResult({ ...base, unwrapFingerprint: 'client-choice' }, workspaceId)).toThrow('INVALID_MEMBER_BINDING_FINGERPRINT')
  })

  it('keeps the migration metadata-only and RPC-only for authenticated callers', () => {
    const sql = readFileSync(new URL('../supabase/migrations/20260831000400_member_person_binding.sql', import.meta.url), 'utf8')
    expect(sql).not.toMatch(/person_name|email|phone|address/u)
    expect(sql).toMatch(/revoke insert, update, delete[\s\S]*from authenticated/u)
    expect(sql).toMatch(/pinned_unwrap_fingerprint=principal\.unwrap_fingerprint/u)
    expect(sql).toMatch(/binding_revision=next_revision/u)
  })
})
