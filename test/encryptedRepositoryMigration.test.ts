import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../supabase/migrations/20260831000300_encrypted_repository_contract.sql', import.meta.url), 'utf8')

describe('CR-05 encrypted repository database contract', () => {
  it('adds encrypted workspace settings and separates principal authorization from writer nonce identity', () => {
    expect(sql).toMatch(/add value if not exists 'workspace_settings'/u)
    expect(sql).toMatch(/writer_id text generated always as \(envelope -> 'aad' ->> 'writerId'\) stored/u)
    expect(sql.match(/writer_id text generated always/g)).toHaveLength(2)
    expect(sql).toMatch(/encrypted_entities_envelope_matches[\s\S]*key_epoch, writer_id, 'family-content'/u)
    expect(sql).toMatch(/encrypted_private_fields_envelope_matches[\s\S]*key_epoch, writer_id, 'contact'/u)
  })

  it('is schema-only and cannot migrate or discover workspace data', () => {
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate)\b/u)
    expect(sql).not.toMatch(/auth\.users|workspace_crypto_states\s+set|commit_encrypted_workspace\s*\(/u)
  })
})
