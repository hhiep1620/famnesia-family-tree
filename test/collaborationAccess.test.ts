import { describe, expect, it } from 'vitest'
import { deriveCollaborationAccess } from '../api/_server/collaborationAccess'
import type { WorkspaceAccess } from '../api/_server/types'

function base(overrides: Partial<WorkspaceAccess> = {}): WorkspaceAccess {
  return {
    id: 'workspace-1', name: 'Famnesia', role: 'viewer', canRead: true, canEdit: false, canUpload: false,
    canManageMembers: false, canCommitDirectly: false, canSubmitDraft: false, canReviewDrafts: false, ownedByMe: false,
    ...overrides,
  }
}

describe('collaboration role derivation', () => {
  it('allows contributors to edit Drafts but never commit official data directly', () => {
    expect(deriveCollaborationAccess(base(), 'contributor', true)).toMatchObject({
      role: 'contributor', canEdit: true, canUpload: true, canCommitDirectly: false, canSubmitDraft: true, canReviewDrafts: false,
    })
  })

  it('blocks legacy writers until migration gives direct draft-folder writer capability', () => {
    expect(deriveCollaborationAccess(base({ role: 'contributor', canEdit: true, canCommitDirectly: true }), 'contributor', false)).toMatchObject({
      role: 'contributor', canEdit: false, canCommitDirectly: false, canSubmitDraft: false, migrationRequired: true,
    })
  })

  it('gives review and direct commit capabilities only to the owner', () => {
    expect(deriveCollaborationAccess(base({ ownedByMe: true }), undefined, false)).toMatchObject({
      role: 'owner', canEdit: true, canCommitDirectly: true, canSubmitDraft: false, canReviewDrafts: true,
    })
  })
})
