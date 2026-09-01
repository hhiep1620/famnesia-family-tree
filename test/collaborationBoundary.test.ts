import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('CR-08 trusted collaboration boundary', () => {
  it('registers editor delegation only after owner identity and ECDSA verification', () => {
    const source = readFileSync(new URL('../api/workspaces/[workspaceId]/editor-delegation.ts', import.meta.url), 'utf8')
    expect(source).toMatch(/requireAuth\(request\)/u)
    expect(source).toMatch(/workspace\.owner_user_id !== auth\.user\.id/u)
    expect(source).toMatch(/verifyEditorDelegation\(artifact, ownerPublicKey/u)
    expect(source).toMatch(/admin\.rpc\('register_verified_editor_delegation'/u)
  })

  it('recomputes the encrypted request checksum before registering the signed checkpoint', () => {
    const source = readFileSync(new URL('../api/workspaces/[workspaceId]/checkpoint-intent.ts', import.meta.url), 'utf8')
    expect(source).toMatch(/parseEncryptedCommitRequest\(body\.request\)/u)
    expect(source).toMatch(/requestChecksum\(unsignedRequest\) !== suppliedChecksum/u)
    expect(source).toMatch(/verifyCheckpointIntent\(artifact, actorPublicKey/u)
    expect(source).toMatch(/admin\.rpc\('register_verified_checkpoint_intent'/u)
  })

  it('keeps trusted registration RPCs service-role only', () => {
    const sql = readFileSync(new URL('../supabase/migrations/20260901000200_fenced_encrypted_collaboration.sql', import.meta.url), 'utf8')
    expect(sql).toMatch(/TRUSTED_VERIFIER_REQUIRED/u)
    expect(sql).toMatch(/register_verified_editor_delegation[\s\S]*from public,anon,authenticated/u)
    expect(sql).toMatch(/register_verified_checkpoint_intent[\s\S]*from public,anon,authenticated/u)
  })
})
