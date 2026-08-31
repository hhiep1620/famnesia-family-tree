import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../supabase/migrations/20260831000100_crypto_private_key_vault.sql', import.meta.url), 'utf8')

describe('CR-03 encrypted private key RLS migration', () => {
  it('stores only an encrypted bundle and forces owner-only RLS', () => {
    expect(sql).toContain('force row level security')
    expect(sql).toContain('auth.uid() = auth_user_id')
    expect(sql).toContain("state = 'pending_drive'")
    expect(sql).toContain('PRIVATE_KEY_BUNDLE_IMMUTABLE')
    expect(sql).not.toMatch(/recovery_secret\s+(text|bytea)/i)
    expect(sql).not.toMatch(/private_key\s+(text|bytea|jsonb)/i)
  })
})
