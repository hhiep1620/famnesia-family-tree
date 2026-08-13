import { describe, expect, it } from 'vitest'
import { assetsForOperations, draftAssetIds, draftPayloadHash, draftReviewRequestProblem } from '../api/_server/collaborationIntegrity'
import type { SubmittedFamilyDraft } from '../src/types/collaboration'
import type { FamilyOperation } from '../src/types/familyOperations'

const operation: FamilyOperation = {
  id: 'op_media_1', type: 'media.attach', entityId: 'M0001', profileId: 'F0001', createdAt: '2026-08-14T00:00:00.000Z',
  value: { id: 'M0001', profileId: 'F0001', personId: 'P0001', driveFileId: 'drive-photo-1', type: 'photo', isPrimary: true },
}

function payload(): SubmittedFamilyDraft {
  return {
    schemaVersion: 1, id: 'draft_1', workspaceId: 'workspace_1', author: { id: 'user_1', email: 'editor@example.com', name: 'Editor' },
    baseRevision: { version: '8', modifiedTime: '2026-08-14T00:00:00.000Z' }, revision: 3, operations: [operation],
    assets: [{ fileId: 'drive-photo-1', version: '4', md5Checksum: 'abc123', size: '1200' }],
    clientCreatedAt: '2026-08-14T00:00:00.000Z', submittedAt: '2026-08-14T00:01:00.000Z',
  }
}

describe('draft integrity', () => {
  it('changes checksum when an operation or temporary photo version is tampered with', () => {
    const original = payload()
    const changedOperation = structuredClone(original)
    ;(changedOperation.operations[0].value as { personId: string }).personId = 'P9999'
    const changedAsset = structuredClone(original)
    changedAsset.assets[0].version = '5'

    expect(draftPayloadHash(changedOperation)).not.toBe(draftPayloadHash(original))
    expect(draftPayloadHash(changedAsset)).not.toBe(draftPayloadHash(original))
  })

  it('normalizes asset ordering and keeps only assets referenced by pending operations', () => {
    const withTwoAssets = payload()
    withTwoAssets.assets = [
      { fileId: 'unused-photo', version: '1' },
      { fileId: 'drive-photo-1', version: '4', md5Checksum: 'abc123', size: '1200' },
    ]
    const reversed = structuredClone(withTwoAssets)
    reversed.assets.reverse()

    expect(draftPayloadHash(reversed)).toBe(draftPayloadHash(withTwoAssets))
    expect(draftAssetIds(withTwoAssets.operations)).toEqual(['drive-photo-1'])
    expect(assetsForOperations(withTwoAssets.assets, withTwoAssets.operations)).toEqual([withTwoAssets.assets[1]])
  })

  it('requires a rejection reason and rejects an explicitly empty partial selection', () => {
    expect(draftReviewRequestProblem({ draftId: 'draft-1', draftRevision: 2, decision: 'reject' })).toBe('reject_note_required')
    expect(draftReviewRequestProblem({ draftId: 'draft-1', draftRevision: 2, decision: 'reject', note: 'Sai quan hệ' })).toBeUndefined()
    expect(draftReviewRequestProblem({ draftId: 'draft-1', draftRevision: 2, decision: 'approve', operationIds: [] })).toBe('invalid')
    expect(draftReviewRequestProblem({ draftId: 'draft-1', draftRevision: 2, decision: 'approve' })).toBeUndefined()
  })
})
