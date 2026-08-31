import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '../types/database.generated'
import { parseEncryptedPrivateKeyRecord, type EncryptedPrivateKeyRecordV1 } from './recoveryBootstrap'

export interface StoredPrivateKeyRecord {
  record: EncryptedPrivateKeyRecordV1
  state: 'pending_drive' | 'active'
}

export interface RecoveryPrivateKeyRepository {
  load(): Promise<StoredPrivateKeyRecord | undefined>
  savePending(record: EncryptedPrivateKeyRecordV1): Promise<void>
  activate(principalId: string): Promise<void>
  discardPending(principalId: string): Promise<void>
}

export class SupabaseRecoveryPrivateKeyRepository implements RecoveryPrivateKeyRepository {
  private readonly client: SupabaseClient<Database>

  constructor(client: SupabaseClient<Database>) {
    this.client = client
  }

  async load(): Promise<StoredPrivateKeyRecord | undefined> {
    const { data, error } = await this.client
      .from('encrypted_private_key_bundles')
      .select('bundle,state')
      .maybeSingle()
    if (error) throw error
    if (!data) return undefined
    return { record: parseEncryptedPrivateKeyRecord(data.bundle), state: data.state }
  }

  async savePending(record: EncryptedPrivateKeyRecordV1): Promise<void> {
    const validated = parseEncryptedPrivateKeyRecord(record)
    const { error } = await this.client.from('encrypted_private_key_bundles').insert({
      principal_id: validated.principalId,
      bundle: validated as unknown as Json,
      state: 'pending_drive',
      recovery_epoch: validated.recoveryEpoch,
      unwrap_fingerprint: validated.unwrapFingerprint,
      signing_fingerprint: validated.signingFingerprint,
    })
    if (error) throw error
  }

  async activate(principalId: string): Promise<void> {
    const { error } = await this.client.rpc('activate_private_key_bundle', { expected_principal_id: principalId })
    if (error) throw error
  }

  async discardPending(principalId: string): Promise<void> {
    const { error } = await this.client
      .from('encrypted_private_key_bundles')
      .delete()
      .eq('principal_id', principalId)
      .eq('state', 'pending_drive')
    if (error) throw error
  }
}
