import type { SupabaseClient } from '@supabase/supabase-js'
import { bindingRpcJson, memberBindingFromRow, parseMemberBindingResult, type MemberPersonBinding } from '../identity/memberPersonBinding'
import type { Database } from '../types/database.generated'

function databaseError(error: { message: string; code?: string } | null): never {
  throw new Error(error?.code ? `${error.code}:${error.message}` : error?.message ?? 'MEMBER_BINDING_DATABASE_ERROR')
}

export class MemberBindingRepository {
  private readonly client: SupabaseClient<Database>
  constructor(client: SupabaseClient<Database>) { this.client = client }

  async list(workspaceId: string): Promise<MemberPersonBinding[]> {
    const { data, error } = await this.client.from('member_person_bindings').select('*').eq('workspace_id', workspaceId)
    if (error || !data) databaseError(error)
    return data.map(memberBindingFromRow)
  }

  async propose(workspaceId: string, profileId: string, personId: string, transitionId = crypto.randomUUID()): Promise<MemberPersonBinding> {
    const { data, error } = await this.client.rpc('propose_member_person_binding', {
      p_workspace_id: workspaceId, p_transition_id: transitionId, p_profile_id: profileId, p_person_id: personId,
    })
    if (error || !data) databaseError(error)
    return parseMemberBindingResult(bindingRpcJson(data), workspaceId)
  }

  async decide(
    workspaceId: string,
    bindingId: string,
    decision: 'confirm' | 'reject' | 'revoke',
    expectedBindingRevision: number,
    transitionId = crypto.randomUUID(),
  ): Promise<MemberPersonBinding> {
    const { data, error } = await this.client.rpc('decide_member_person_binding', {
      p_workspace_id: workspaceId, p_transition_id: transitionId, p_binding_id: bindingId,
      p_decision: decision, p_expected_binding_revision: expectedBindingRevision,
    })
    if (error || !data) databaseError(error)
    return parseMemberBindingResult(bindingRpcJson(data), workspaceId)
  }
}
