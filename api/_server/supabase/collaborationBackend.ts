import { createHash, randomBytes } from 'node:crypto'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { compactFamilyOperations, operationReviewClosure } from '../../../src/draft/familyOperations.js'
import type { Database, Json, Tables } from '../../../src/types/database.generated.js'
import type { WorkspaceInfo, WorkspaceInvitationResult, WorkspaceMember, WorkspaceRole } from '../../../src/types/family.js'
import type { CollaborationStatus, DraftReviewRequest, DraftReviewResult, ReviewDraft, ReviewDraftStatus, SubmitDraftResult } from '../../../src/types/collaboration.js'
import type { FamilyCommitRequest, FamilyOperation } from '../../../src/types/familyOperations.js'
import { draftReviewRequestProblem } from '../collaborationIntegrity.js'
import { AppError } from '../http.js'
import type { SafeUser } from '../types.js'
import type { SupabaseWriteRepository } from './writeBackend.js'

type DraftRow = Tables<'draft_submissions'>
type DraftOperationRow = Tables<'draft_operations'>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function errorCode(error: PostgrestError, fallback: string): never {
  const message = error.message || fallback
  if (message.includes('INVITATION_EMAIL_MISMATCH')) throw new AppError(403, 'INVITATION_EMAIL_MISMATCH', 'Link mời này dành cho một email khác. Hãy đăng nhập đúng tài khoản được mời.')
  if (message.includes('INVITATION_EXPIRED')) throw new AppError(410, 'INVITATION_EXPIRED', 'Link mời đã hết hạn. Hãy nhờ owner tạo link mới.')
  if (message.includes('INVITATION_NOT_PENDING')) throw new AppError(409, 'INVITATION_NOT_PENDING', 'Link mời đã được dùng hoặc bị thu hồi.')
  if (message.includes('INVITATION_NOT_FOUND')) throw new AppError(404, 'INVITATION_NOT_FOUND', 'Không tìm thấy link mời Famnesia này.')
  if (message.includes('MEMBER_ALREADY_EXISTS')) throw new AppError(409, 'MEMBER_ALREADY_EXISTS', 'Email này đã là thành viên workspace.')
  if (message.includes('DRAFT_REVISION_CHANGED') || error.code === '40001') throw new AppError(409, 'DRAFT_REVISION_CHANGED', 'Draft đã thay đổi sau khi bạn mở. Hãy tải revision mới nhất.')
  if (message.includes('DRAFT_ALREADY_REVIEWED')) throw new AppError(409, 'DRAFT_ALREADY_REVIEWED', 'Draft này đã được xử lý xong.')
  if (message.includes('DRAFT_REVIEW_FORBIDDEN') || message.includes('DRAFT_SUBMIT_FORBIDDEN') || error.code === '42501') throw new AppError(403, 'COLLABORATION_FORBIDDEN', 'Bạn không có quyền thực hiện thao tác cộng tác này.')
  if (message.includes('DRAFT_') || message.includes('INVITATION_') || error.code === '22023') throw new AppError(422, 'COLLABORATION_INVALID', 'Yêu cầu cộng tác không hợp lệ.', { reason: message })
  console.error({ name: 'SupabaseCollaborationError', code: error.code, message })
  throw new AppError(502, 'SUPABASE_COLLABORATION_FAILED', fallback)
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]))
  return value
}

function checksum(baseVersion: number, operations: FamilyOperation[]): string {
  return createHash('sha256').update(JSON.stringify(stable({ baseVersion, operations: compactFamilyOperations(operations) }))).digest('hex')
}

function operationFromRow(row: DraftOperationRow): FamilyOperation {
  return {
    id: row.operation_id,
    type: row.operation_type as FamilyOperation['type'],
    createdAt: row.created_at,
    ...(row.entity_id ? { entityId: row.entity_id } : {}),
    ...(row.profile_legacy_id ? { profileId: row.profile_legacy_id } : {}),
    ...(row.value !== null ? { value: row.value } : {}),
    ...(row.changes && typeof row.changes === 'object' && !Array.isArray(row.changes) ? { changes: row.changes as Record<string, unknown> } : {}),
    ...(row.base_values && typeof row.base_values === 'object' && !Array.isArray(row.base_values) ? { baseValues: row.base_values as Record<string, unknown> } : {}),
  }
}

function mediaUploadIds(operations: FamilyOperation[]): string[] {
  return [...new Set(operations.flatMap((operation) => {
    if (operation.type !== 'media.attach' || !operation.value || typeof operation.value !== 'object') return []
    const value = operation.value as { fileId?: unknown }
    return typeof value.fileId === 'string' && UUID.test(value.fileId) ? [value.fileId] : []
  }))]
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
    return this.writes.getWorkspace(result.data)
  }

  async acceptInvitation(token: string): Promise<WorkspaceInfo> {
    if (!/^[A-Za-z0-9_-]{32,200}$/.test(token)) throw new AppError(400, 'INVITATION_TOKEN_INVALID', 'Link mời không hợp lệ.')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const result = await this.client.rpc('accept_workspace_invitation', { p_token_hash: tokenHash })
    if (result.error) errorCode(result.error, 'Không thể nhận lời mời workspace.')
    return this.writes.getWorkspace(result.data)
  }

  async invite(workspaceId: string, email: string, role: Extract<WorkspaceRole, 'editor' | 'contributor' | 'viewer'>): Promise<WorkspaceInvitationResult> {
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

  async updateMember(workspaceId: string, memberId: string, role: Extract<WorkspaceRole, 'editor' | 'contributor' | 'viewer'>): Promise<void> {
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

  async submit(workspaceId: string, request: FamilyCommitRequest): Promise<SubmitDraftResult> {
    const operations = compactFamilyOperations(request.operations)
    const rawVersion = request.baseRevision?.version
    if (!rawVersion || !/^\d+$/.test(rawVersion) || !operations.length) throw new AppError(422, 'DRAFT_SUBMIT_INVALID', 'Draft cần base revision và ít nhất một thay đổi.')
    const baseVersion = Number(rawVersion)
    const result = await this.client.rpc('submit_family_draft', {
      p_workspace_id: workspaceId,
      p_base_data_version: baseVersion,
      p_operations: operations as unknown as Json,
      p_checksum: checksum(baseVersion, operations),
      p_client_created_at: request.clientCreatedAt,
    })
    if (result.error) errorCode(result.error, 'Không thể gửi Draft cho owner.')
    const draft = await this.ownDraft(workspaceId)
    if (!draft) throw new AppError(502, 'DRAFT_RESPONSE_INVALID', 'Supabase did not return the submitted Draft.')
    return { draft, mirrorGeneration: await this.dataVersion(workspaceId) }
  }

  async list(workspaceId: string): Promise<ReviewDraft[]> {
    await this.writes.getWorkspace(workspaceId)
    await this.client.rpc('cleanup_terminal_family_drafts', { p_workspace_id: workspaceId })
    const submissions = await this.client.from('draft_submissions').select('*').eq('workspace_id', workspaceId).order('updated_at', { ascending: false })
    if (submissions.error) errorCode(submissions.error, 'Không thể đọc danh sách Draft.')
    return Promise.all(submissions.data.map((draft) => this.draftView(draft)))
  }

  async status(workspaceId: string): Promise<CollaborationStatus> {
    const workspace = await this.writes.getWorkspace(workspaceId)
    await this.client.rpc('cleanup_terminal_family_drafts', { p_workspace_id: workspaceId })
    const generation = await this.dataVersion(workspaceId)
    if (workspace.role === 'contributor') {
      return { enabled: true, workspaceRole: workspace.role, pendingDraftCount: 0, ownDraft: await this.ownDraft(workspaceId), mirrorGeneration: generation }
    }
    if (workspace.canReviewDrafts) {
      const result = await this.client.from('draft_submissions').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).in('status', ['pending', 'partially_reviewed', 'needs_changes'])
      if (result.error) errorCode(result.error, 'Không thể đọc trạng thái cộng tác.')
      return { enabled: true, workspaceRole: workspace.role, pendingDraftCount: result.count ?? 0, mirrorGeneration: generation }
    }
    return { enabled: true, workspaceRole: workspace.role, pendingDraftCount: 0, mirrorGeneration: generation }
  }

  async review(workspaceId: string, request: DraftReviewRequest): Promise<DraftReviewResult> {
    const workspace = await this.writes.getWorkspace(workspaceId)
    if (!workspace.canReviewDrafts) throw new AppError(403, 'DRAFT_REVIEW_FORBIDDEN', 'Only workspace owners and editors may review contributor drafts.')
    const problem = draftReviewRequestProblem(request)
    if (problem === 'reject_note_required') throw new AppError(422, 'DRAFT_REJECT_NOTE_REQUIRED', 'Hãy nhập lý do khi từ chối thay đổi.')
    if (problem) throw new AppError(422, 'DRAFT_REVIEW_INVALID', 'Yêu cầu duyệt Draft không hợp lệ.')
    const draft = (await this.list(workspaceId)).find((item) => item.id === request.draftId)
    if (!draft) throw new AppError(404, 'DRAFT_NOT_FOUND', 'Không tìm thấy Draft.')
    if (draft.revision !== request.draftRevision) throw new AppError(409, 'DRAFT_REVISION_CHANGED', 'Draft đã thay đổi sau khi bạn mở.')
    if (!['pending', 'partially_reviewed', 'needs_changes'].includes(draft.status)) throw new AppError(409, 'DRAFT_ALREADY_REVIEWED', 'Draft này đã được xử lý xong.')
    const allIds = draft.operations.map((operation) => operation.id)
    const requestedIds = request.operationIds === undefined ? allIds : [...new Set(request.operationIds)]
    if (requestedIds.some((id) => !allIds.includes(id))) throw new AppError(422, 'DRAFT_OPERATION_INVALID', 'Một thay đổi được chọn không còn nằm trong Draft.')
    const selectedIds = operationReviewClosure(draft.operations, requestedIds, request.decision)
    const selected = draft.operations.filter((operation) => selectedIds.includes(operation.id))
    let snapshot: DraftReviewResult['snapshot']
    let resultVersion: number | null = null
    if (request.decision === 'approve') {
      try {
        const result = await this.writes.commitFamily(workspaceId, {
          commitId: `draft_${draft.id.replaceAll('-', '')}_r${draft.revision}_${createHash('sha256').update(selectedIds.join(':')).digest('hex').slice(0, 12)}`,
          baseRevision: draft.baseRevision,
          operations: selected,
          clientCreatedAt: new Date().toISOString(),
        })
        snapshot = result.snapshot
        resultVersion = Number(result.snapshot.revision.version)
      } catch (caught) {
        if (caught instanceof AppError && caught.code === 'FAMILY_COMMIT_CONFLICT') {
          const note = 'Dữ liệu chính thức đã thay đổi và Draft cần được contributor cập nhật lại.'
          const marked = await this.client.rpc('mark_family_draft_needs_changes', { p_workspace_id: workspaceId, p_draft_id: draft.id, p_expected_revision: draft.revision, p_note: note })
          if (marked.error) errorCode(marked.error, 'Không thể đánh dấu Draft xung đột.')
        }
        throw caught
      }
    }
    const finalized = await this.client.rpc('finalize_family_draft_review', {
      p_workspace_id: workspaceId,
      p_draft_id: draft.id,
      p_expected_revision: draft.revision,
      p_decision: request.decision,
      p_operation_ids: selectedIds,
      p_note: request.note?.trim() || '',
      p_result_data_version: resultVersion ?? -1,
    })
    if (finalized.error) errorCode(finalized.error, 'Không thể hoàn tất quyết định duyệt Draft.')
    if (request.decision === 'reject') await this.discardUploads(workspaceId, mediaUploadIds(selected))
    const next = (await this.list(workspaceId)).find((item) => item.id === draft.id)
    if (!next) throw new AppError(502, 'DRAFT_RESPONSE_INVALID', 'Supabase did not return the reviewed Draft.')
    return {
      draft: next,
      appliedOperationIds: selectedIds,
      automaticallyIncludedOperationIds: selectedIds.filter((id) => !requestedIds.includes(id)),
      mirrorGeneration: await this.dataVersion(workspaceId),
      snapshot,
    }
  }

  private async ownDraft(workspaceId: string): Promise<ReviewDraft | undefined> {
    const result = await this.client.from('draft_submissions').select('*').eq('workspace_id', workspaceId).eq('contributor_user_id', this.user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle()
    if (result.error) errorCode(result.error, 'Không thể đọc Draft của bạn.')
    return result.data ? this.draftView(result.data) : undefined
  }

  private async draftView(row: DraftRow): Promise<ReviewDraft> {
    const [operations, profile, history] = await Promise.all([
      this.client.from('draft_operations').select('*').eq('draft_submission_id', row.id).eq('status', 'pending').order('sequence_number'),
      this.client.from('user_profiles').select('email, display_name').eq('id', row.contributor_user_id).maybeSingle(),
      this.client.from('draft_review_events').select('id, reviewer_user_id, decision, operation_ids, note, created_at').eq('draft_submission_id', row.id).order('created_at'),
    ])
    if (operations.error) errorCode(operations.error, 'Không thể đọc thay đổi trong Draft.')
    if (profile.error) errorCode(profile.error, 'Không thể đọc tác giả Draft.')
    if (history.error) errorCode(history.error, 'Không thể đọc lịch sử duyệt Draft.')
    const reviewerIds = [...new Set(history.data.map((event) => event.reviewer_user_id))]
    const reviewers = reviewerIds.length ? await this.client.from('user_profiles').select('id, email, display_name').in('id', reviewerIds) : { data: [], error: null }
    if (reviewers.error) errorCode(reviewers.error, 'Không thể đọc reviewer Draft.')
    const reviewerMap = new Map(reviewers.data.map((item) => [item.id, item]))
    const mappedOperations = operations.data.map(operationFromRow)
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      author: { id: row.contributor_user_id, email: profile.data?.email ?? '', name: profile.data?.display_name || profile.data?.email || 'Contributor' },
      revision: row.revision,
      status: row.status as ReviewDraftStatus,
      operationCount: mappedOperations.length,
      submittedAt: row.submitted_at ?? row.created_at,
      updatedAt: row.updated_at,
      terminalAt: row.terminal_at ?? undefined,
      note: row.review_note ?? undefined,
      payloadHash: row.checksum,
      fileId: row.id,
      baseRevision: { version: String(row.base_data_version) },
      reviewHistory: history.data.map((event) => {
        const reviewer = reviewerMap.get(event.reviewer_user_id)
        return {
          id: event.id,
          reviewerEmail: reviewer?.email ?? '',
          reviewerName: reviewer?.display_name || reviewer?.email || 'Reviewer',
          decision: event.decision as 'approve' | 'reject',
          operationIds: event.operation_ids,
          note: event.note ?? undefined,
          createdAt: event.created_at,
        }
      }),
      operations: mappedOperations,
    }
  }

  private async dataVersion(workspaceId: string): Promise<number> {
    return Number((await this.writes.getWorkspaceRow(workspaceId)).row.data_version)
  }

  private async discardUploads(workspaceId: string, uploadIds: string[]): Promise<void> {
    for (const uploadId of uploadIds) {
      const result = await this.client.rpc('discard_reviewed_media_upload', { p_workspace_id: workspaceId, p_upload_id: uploadId })
      if (result.error) continue
      const payload = result.data as { paths?: unknown }
      const paths = Array.isArray(payload.paths) ? payload.paths.filter((path): path is string => typeof path === 'string' && Boolean(path)) : []
      if (paths.length) await this.client.storage.from('family-media').remove(paths)
    }
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
