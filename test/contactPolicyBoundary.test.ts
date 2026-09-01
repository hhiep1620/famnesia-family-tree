import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('CR-07 trusted contact policy boundary', () => {
  it('authenticates the signer, verifies the ECDSA artifact and uses only the admin verifier for registration', () => {
    const source = readFileSync(new URL('../server/workspaces/[workspaceId]/contact-policy.ts', import.meta.url), 'utf8')
    expect(source).toMatch(/requireAuth\(request\)/u)
    expect(source).toMatch(/principal\.auth_user_id !== auth\.user\.id/u)
    expect(source).toMatch(/verifyContactPolicy\(artifact, publicKey/u)
    expect(source).toMatch(/admin\.rpc\('register_verified_contact_policy'/u)
    expect(source).not.toMatch(/phone|email|address|personName|relationships/u)
  })

  it('does not expose the trusted registration RPC to authenticated SQL callers', () => {
    const sql = readFileSync(new URL('../supabase/migrations/20260831000500_contact_privacy.sql', import.meta.url), 'utf8')
    expect(sql).toMatch(/TRUSTED_VERIFIER_REQUIRED/u)
    expect(sql).toMatch(/register_verified_contact_policy[\s\S]*from public,anon,authenticated/u)
    expect(sql).toMatch(/grant execute on function public\.register_verified_contact_policy[\s\S]*to service_role/u)
  })

  it('verifies edit scope on a separate authenticated policy-principal endpoint', () => {
    const source = readFileSync(new URL('../server/workspaces/[workspaceId]/contact-authorization.ts', import.meta.url), 'utf8')
    expect(source).toMatch(/verifyContactEditAuthorization/u)
    expect(source).toMatch(/signer\.auth_user_id !== auth\.user\.id/u)
    expect(source).toMatch(/policy\.policy_principal_id/u)
    expect(source).toMatch(/register_verified_contact_edit_authorization/u)
    expect(source).not.toMatch(/phone1|phone2|address|privateNote|relationships/u)
  })
})
