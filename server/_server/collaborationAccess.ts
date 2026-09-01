import type { WorkspaceAccess } from './types.js'

export function deriveCollaborationAccess(
  access: WorkspaceAccess,
  memberRole: 'editor' | 'viewer' | undefined,
  _canEditSharedResource: boolean,
  migrationError = false,
): WorkspaceAccess {
  if (access.ownedByMe) {
    return { ...access, role: 'owner', canEdit: true, canUpload: true, canManageMembers: true, canCommitDirectly: true, canReplaceData: true, canCreateBackups: true }
  }
  if (memberRole === 'editor') {
    return { ...access, role: 'editor', canEdit: !migrationError, canUpload: !migrationError, canManageMembers: false, canCommitDirectly: !migrationError, canReplaceData: false, canCreateBackups: false, migrationRequired: migrationError }
  }
  return { ...access, role: 'viewer', canEdit: false, canUpload: false, canManageMembers: false, canCommitDirectly: false, canReplaceData: false, canCreateBackups: false }
}
