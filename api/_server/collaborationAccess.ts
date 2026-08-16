import type { WorkspaceAccess } from './types.js'

export function deriveCollaborationAccess(
  access: WorkspaceAccess,
  memberRole: 'contributor' | 'viewer' | undefined,
  draftFolderCanEdit: boolean,
  migrationError = false,
): WorkspaceAccess {
  if (access.ownedByMe) {
    return { ...access, role: 'owner', canEdit: true, canUpload: true, canManageMembers: true, canCommitDirectly: true, canSubmitDraft: false, canReviewDrafts: true, canReplaceData: true, canCreateBackups: true }
  }
  if (memberRole === 'contributor' && draftFolderCanEdit) {
    return { ...access, role: 'contributor', canEdit: true, canUpload: true, canManageMembers: false, canCommitDirectly: false, canSubmitDraft: true, canReviewDrafts: false, canReplaceData: false, canCreateBackups: false, migrationRequired: migrationError }
  }
  if (memberRole === 'contributor' || access.role === 'contributor' || access.canCommitDirectly) {
    return { ...access, role: 'contributor', canEdit: false, canUpload: false, canManageMembers: false, canCommitDirectly: false, canSubmitDraft: false, canReviewDrafts: false, canReplaceData: false, canCreateBackups: false, migrationRequired: true }
  }
  return { ...access, role: 'viewer', canEdit: false, canUpload: false, canManageMembers: false, canCommitDirectly: false, canSubmitDraft: false, canReviewDrafts: false, canReplaceData: false, canCreateBackups: false }
}
