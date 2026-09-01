import { createHash, randomBytes } from 'node:crypto'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '../../../src/types/database.generated.js'
import type { WorkspaceInfo, WorkspaceInvitationResult, WorkspaceMember, WorkspaceRole } from '../../../src/types/family.js'
import { AppError } from '../http.js'
import type { SafeUser } from '../types.js'
import type { SupabaseWriteRepository } from './writeBackend.js'

function errorCode(error: PostgrestError, fallback: string): never {
  const message = error.message || fallback
  if (message.includes('INVITATION_EMAIL_MISMATCH')) throw new AppError(403, 'INVITATION_EMAIL_MISMATCH', 'Link mời này dành cho một email khác. Hãy đăng nhập đúng tài khoản được mời.')
  if (message.includes('INVITATION_EXPIRED')) throw new AppError(410, 'INVITATION_EXPIRED', 'Link mời đã hết hạn. Hãy nhờ owner tạo link mới.')
  if (message.includes('INVITATION_NOT_PENDING')) throw new AppError(409, 'INVITATION_NOT_PENDING', 'Link mời đã được dùng hoặc bị thu hồi.')
  if (message.includes('INVITATION_NOT_FOUND')) throw new AppError(404, 'INVITATION_NOT_FOUND', 'Không tìm thấy link mời Famnesia này.')
  if (message.includes('MEMBER_ALREADY_EXISTS')) throw new AppError(409, 'MEMBER_ALREADY_EXISTS', 'Email này đã là thành viên workspace.')
  if (error.code === '40001') throw new AppError(409, 'COLLABORATION_CONFLICT', 'Trạng thái cộng tác đã thay đổi. Hãy tải lại trước khi thử lại.')
  if (error.code === '42501') throw new AppError(403, 'COLLABORATION_FORBIDDEN', 'Bạn không có quyền thực hiện thao tác cộng tác này.')
  if (message.includes('INVITATION_') || error.code === '22023') throw new AppError(422, 'COLLABORATION_INVALID', 'Yêu cầu cộng tác không hợp lệ.', { reason: message })
  console.error({ name: 'SupabaseCollaborationError', code: error.code, message })
  throw new AppError(502, 'SUPABASE_COLLABORATION_FAILED', fallback)
}

export class SupabaseCollaborationRepository {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly user: SafeUser,
    private readonly writes: SupabaseWriteRepository,
  ) {}

  async createWorkspace(name: string): Promise<WorkspaceInfo> {
    const result = await this.client.rpc('create_family_workspace', { p_name: name.trim() })
    if (result.error) errorCode(result.error, 'Không thể tạo workspace Famnesia.')
    let workspace = await this.writes.getWorkspace(result.data)
    if (!workspace.joinCode) {
      const rotated = await this.client.rpc('rotate_workspace_join_code', { p_workspace_id: result.data })
      if (rotated.error) errorCode(rotated.error, 'Không thể tạo mã tham gia cho workspace.')
      workspace = await this.writes.getWorkspace(result.data)
    }
    return workspace
  }

  async acceptInvitation(token: string): Promise<WorkspaceInfo> {
    if (!/^[A-Za-z0-9_-]{32,200}$/.test(token)) throw new AppError(400, 'INVITATION_TOKEN_INVALID', 'Link mời không hợp lệ.')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const result = await this.client.rpc('accept_workspace_invitation', { p_token_hash: tokenHash })
    if (result.error) errorCode(result.error, 'Không thể nhận lời mời workspace.')
    return this.writes.getWorkspace(result.data)
  }

  async invite(workspaceId: string, email: string, role: Extract<WorkspaceRole, 'editor' | 'viewer'>): Promise<WorkspaceInvitationResult> {
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const result = await this.client.rpc('create_workspace_invitation', {
      p_workspace_id: workspaceId,
      p_email: email.trim().toLowerCase(),
      p_role: role,
      p_token_hash: createHash('sha256').update(token).digest('hex'),
      p_expires_at: expiresAt,
    })
    if (result.error) errorCode(result.error, 'Không thể tạo lời mời workspace.')
    const payload = result.data as { id?: unknown; email?: unknown; role?: unknown; expiresAt?: unknown }
    if (typeof payload.id !== 'string' || typeof payload.email !== 'string') throw new AppError(502, 'INVITATION_RESPONSE_INVALID', 'Supabase returned an invalid invitation.')
    return { id: payload.id, email: payload.email, role, expiresAt, inviteUrl: `/?invite=${encodeURIComponent(token)}` }
  }

  async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const members = await this.writes.listMembers(workspaceId)
    const invitations = await this.client.from('workspace_invitations')
      .select('id, email, role, expires_at').eq('workspace_id', workspaceId).eq('status', 'pending').order('created_at')
    if (invitations.error) errorCode(invitations.error, 'Không thể đọc lời mời đang chờ.')
    return [...members, ...invitations.data.map((invite) => ({
      id: `invite:${invite.id}`, email: invite.email, name: 'Đang chờ nhận lời mời', role: invite.role as WorkspaceRole,
      inherited: false, pendingInvitation: true, invitationExpiresAt: invite.expires_at ?? undefined,
    }))]
  }

  async updateMember(workspaceId: string, memberId: string, role: Extract<WorkspaceRole, 'editor' | 'viewer'>): Promise<void> {
    await this.writes.getWorkspace(workspaceId).then((workspace) => {
      if (!workspace.canManageMembers) throw new AppError(403, 'MEMBER_MANAGEMENT_FORBIDDEN', 'Only the workspace owner may manage members.')
    })
    if (memberId.startsWith('invite:')) {
      const result = await this.client.from('workspace_invitations').update({ role }).eq('workspace_id', workspaceId).eq('id', memberId.slice(7)).eq('status', 'pending').select('id').maybeSingle()
      if (result.error) errorCode(result.error, 'Không thể cập nhật lời mời.')
      if (!result.data) throw new AppError(404, 'INVITATION_NOT_FOUND', 'Không tìm thấy lời mời đang chờ.')
      return
    }
    const result = await this.client.from('workspace_members').update({ role }).eq('workspace_id', workspaceId).eq('user_id', memberId).select('id').maybeSingle()
    if (result.error) errorCode(result.error, 'Không thể đổi quyền thành viên.')
    if (!result.data) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Không tìm thấy thành viên workspace.')
    await this.activity(workspaceId, 'member.role_changed', memberId, `Changed a member role to ${role}`, { role })
  }

  async removeMember(workspaceId: string, memberId: string): Promise<void> {
    await this.writes.getWorkspace(workspaceId).then((workspace) => {
      if (!workspace.canManageMembers) throw new AppError(403, 'MEMBER_MANAGEMENT_FORBIDDEN', 'Only the workspace owner may manage members.')
    })
    if (memberId.startsWith('invite:')) {
      const result = await this.client.rpc('revoke_workspace_invitation', { p_workspace_id: workspaceId, p_invitation_id: memberId.slice(7) })
      if (result.error) errorCode(result.error, 'Không thể thu hồi lời mời.')
      return
    }
    const result = await this.client.from('workspace_members').delete().eq('workspace_id', workspaceId).eq('user_id', memberId).select('id').maybeSingle()
    if (result.error) errorCode(result.error, 'Không thể gỡ thành viên.')
    if (!result.data) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Không tìm thấy thành viên workspace.')
    await this.activity(workspaceId, 'member.removed', memberId, 'Removed a workspace member')
  }

  private async activity(workspaceId: string, action: string, entityId: string, summary: string, metadata: Record<string, unknown> = {}): Promise<void> {
    const result = await this.client.from('activity_events').insert({
      workspace_id: workspaceId, actor_user_id: this.user.id, actor_email: this.user.email,
      actor_name: this.user.name, action, entity_type: 'member', entity_id: entityId,
      summary, metadata: metadata as Json,
    })
    if (result.error) console.warn({ name: 'SupabaseCollaborationActivityDeferred', action, code: result.error.code })
  }
}
