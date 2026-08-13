import { describe, expect, it } from 'vitest'
import { sharedWorkspaceForEmptyOwner } from '../services/workspaceSelection'
import type { FamilyData, WorkspaceInfo } from '../types/family'

const workspace = (id: string, ownedByMe: boolean): WorkspaceInfo => ({
  id,
  name: id,
  role: ownedByMe ? 'owner' : 'editor',
  canRead: true,
  canEdit: true,
  canUpload: true,
  canManageMembers: ownedByMe,
  ownedByMe,
})

const data = (hasProfile = false): FamilyData => ({
  schemaVersion: 3,
  profiles: hasProfile ? [{ id: 'F0001', name: 'Gia đình', requiresSecret: false, isActive: true }] : [],
  persons: [],
  relationships: [],
  media: [],
  settings: { timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN' },
})

describe('shared workspace selection', () => {
  it('moves a new user from an empty personal workspace to their single shared family', () => {
    const owner = workspace('personal', true)
    const shared = workspace('shared-family', false)
    expect(sharedWorkspaceForEmptyOwner(owner, [owner, shared], data(), false)).toEqual(shared)
  })

  it('does not override personal data, a stored Draft, or an ambiguous shared choice', () => {
    const owner = workspace('personal', true)
    const first = workspace('shared-one', false)
    const second = workspace('shared-two', false)
    expect(sharedWorkspaceForEmptyOwner(owner, [owner, first], data(true), false)).toBeUndefined()
    expect(sharedWorkspaceForEmptyOwner(owner, [owner, first], data(), true)).toBeUndefined()
    expect(sharedWorkspaceForEmptyOwner(owner, [owner, first, second], data(), false)).toBeUndefined()
  })
})
