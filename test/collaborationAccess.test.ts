import { describe, expect, it } from 'vitest'
import { deriveCollaborationAccess } from '../server/_server/collaborationAccess'
import type { WorkspaceAccess } from '../server/_server/types'

function base(overrides: Partial<WorkspaceAccess> = {}): WorkspaceAccess {
  return {
    id: 'workspace-1', name: 'Famnesia', role: 'viewer', canRead: true, canEdit: false, canUpload: false,
    canManageMembers: false, canCommitDirectly: false, canReplaceData: false,
    canCreateBackups: false, ownedByMe: false,
    ...overrides,
  }
}

describe('collaboration role derivation', () => {
  it('allows editors to edit and commit canonical data directly', () => {
    expect(deriveCollaborationAccess(base(), 'editor', true)).toMatchObject({
      role: 'editor', canEdit: true, canUpload: true, canCommitDirectly: true,
    })
  })

  it('keeps viewers read-only even if stale capabilities claim write access', () => {
    expect(deriveCollaborationAccess(base({ canEdit: true, canCommitDirectly: true }), 'viewer', true)).toMatchObject({
      role: 'viewer', canEdit: false, canUpload: false, canCommitDirectly: false,
    })
  })

  it('gives owner management and direct commit capabilities', () => {
    expect(deriveCollaborationAccess(base({ ownedByMe: true }), undefined, false)).toMatchObject({
      role: 'owner', canEdit: true, canUpload: true, canManageMembers: true, canCommitDirectly: true,
    })
  })
})
