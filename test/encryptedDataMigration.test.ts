import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../supabase/migrations/20260831000200_encrypted_data_contract.sql', import.meta.url), 'utf8')
const targetTables = [
  'crypto_principals', 'workspace_crypto_states', 'workspace_principal_directory', 'encrypted_entities',
  'encrypted_private_fields', 'encrypted_key_envelopes', 'signed_policy_authorizations',
  'authorization_nonce_ledger', 'crypto_invitations', 'opaque_backup_capabilities',
  'opaque_backup_audit', 'encrypted_commits',
]

describe('CR-04 database contract migration', () => {
  it('forces RLS for every encrypted-path table and grants authenticated users no direct writes', () => {
    for (const table of targetTables) {
      expect(sql).toContain(`'${table}'`)
    }
    expect(sql).toContain("execute format('alter table public.%I force row level security', table_name)")
    expect(sql).toContain("execute format('revoke all on public.%I from public, anon, authenticated', table_name)")
    expect(sql).not.toMatch(/grant\s+(?:insert|update|delete|all)[^;]*to authenticated/iu)
  })

  it('limits normal wrapped-key reads to the current recipient', () => {
    expect(sql).toMatch(/create policy encrypted_key_envelopes_select_recipient[\s\S]*recipient_principal_id = public\.current_crypto_principal\(workspace_id\)/u)
    expect(sql).not.toMatch(/create policy encrypted_key_envelopes[^;]+public\.can_read_workspace/iu)
  })

  it('uses empty search paths, narrow execute grants and a service-only mint function', () => {
    for (const functionName of ['register_crypto_principal', 'initialize_workspace_crypto', 'commit_encrypted_workspace',
      'mint_opaque_backup_capability', 'export_opaque_workspace_backup']) {
      expect(sql).toMatch(new RegExp(`create function public\\.${functionName}[\\s\\S]*?set search_path = ''[\\s\\S]*?\\$\\$;`, 'u'))
    }
    expect(sql).toContain('grant execute on function public.mint_opaque_backup_capability(uuid, uuid, text, timestamptz, timestamptz) to service_role;')
    expect(sql).not.toContain('grant execute on function public.mint_opaque_backup_capability(uuid, uuid, text, timestamptz, timestamptz) to authenticated;')
  })

  it('checks exact AAD, stale versions, authorization scope, replay and atomic commit fencing', () => {
    for (const marker of ['AAD', 'STALE_DATA_VERSION', 'STALE_KEY_EPOCH', 'CONTACT_AUTHORIZATION_DENIED',
      'AUTHORIZATION_REPLAY', 'ROW_VERSION_CONFLICT', 'COMMIT_ID_REUSED']) {
      expect(sql).toContain(marker)
    }
    expect(sql).toContain("purpose = 'contact_edit'")
    expect(sql).toContain("and person_id = operation ->> 'personId' and field_class = (operation ->> 'fieldClass')")
    expect(sql).toContain('insert into public.authorization_nonce_ledger')
  })

  it('keeps opaque backup original and complete without unwrap or re-wrap', () => {
    expect(sql).toContain("'keyEnvelopes', (select coalesce(jsonb_agg(to_jsonb(k)")
    expect(sql).toContain("set state = 'consumed', consumed_at = now()")
    expect(sql).not.toMatch(/pgp_sym_decrypt|pgp_pub_decrypt|decrypt_iv|decrypt\s*\(/iu)
  })
})
