import { afterEach, describe, expect, it, vi } from 'vitest'
import { CommitOutcomeUnknownError, FamilyRepository } from '../src/services/familyRepository.js'
import type { WorkspaceInfo } from '../src/types/family.js'
import type { FamilyCommitRequest, FamilyCommitResult } from '../src/types/familyOperations.js'

const workspace: WorkspaceInfo = {
  id: 'workspace-test', name: 'Test', role: 'owner', canRead: true, canEdit: true, canUpload: false,
  canManageMembers: false, canCommitDirectly: true, canSubmitDraft: false, canReviewDrafts: false, ownedByMe: true,
}

const request: FamilyCommitRequest = {
  commitId: 'commit_test_1234',
  baseRevision: { version: '1' },
  operations: [{ id: 'op-test', type: 'person.update', entityId: 'P1', changes: { nickname: 'An' }, baseValues: { nickname: null }, createdAt: '2026-08-14T00:00:00.000Z' }],
  clientCreatedAt: '2026-08-14T00:00:00.000Z',
}

const applied: FamilyCommitResult = {
  snapshot: {
    data: { schemaVersion: 3, profiles: [], persons: [], relationships: [], media: [], settings: { timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN', duplicateSuppressions: [] } },
    revision: { version: '2' },
  },
  commit: { commitId: request.commitId, operationCount: 1, counts: { personUpdated: 1 }, idempotent: true },
}

function repository(): FamilyRepository {
  return new (FamilyRepository as unknown as new (selected: WorkspaceInfo, all: WorkspaceInfo[]) => FamilyRepository)(workspace, [workspace])
}

afterEach(() => vi.unstubAllGlobals())

describe('FamilyRepository unknown commit outcome recovery', () => {
  it('returns the applied result when the commit response is lost but status confirms it', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('network response lost'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'applied', result: applied }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(repository().commit(request)).resolves.toEqual(applied)
    expect(String(fetchMock.mock.calls[1][0])).toContain('resource=commit-status')
  })

  it('reports a safe ordinary failure when status confirms the commit is missing', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockRejectedValueOnce(new TypeError('network response lost'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'missing' }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    await expect(repository().commit(request)).rejects.toThrow('network response lost')
  })

  it('preserves the commit ID path by reporting an unknown outcome when status also fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(repository().commit(request)).rejects.toBeInstanceOf(CommitOutcomeUnknownError)
  })
})
