import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { ReviewDraftSummary } from '../src/types/collaboration'

beforeAll(() => {
  vi.stubEnv('SESSION_STORE_DRIVER', 'memory')
  vi.stubEnv('VERCEL_ENV', 'development')
})

function summary(workspaceId: string, id: string, authorId: string, updatedAt: string): ReviewDraftSummary {
  return {
    id, workspaceId, author: { id: authorId, email: `${authorId}@example.com`, name: authorId }, revision: 1,
    status: 'pending', operationCount: 1, submittedAt: updatedAt, updatedAt, payloadHash: `hash-${id}`, fileId: `file-${id}`, reviewHistory: [],
  }
}

describe('collaboration repository workflow metadata', () => {
  it('keeps one active draft pointer per author and clears it at a terminal status', async () => {
    const { collaboration } = await import('../server/_server/collaborationRepository')
    const repository = collaboration()
    const workspaceId = `workspace-${crypto.randomUUID()}`
    const draft = summary(workspaceId, 'draft-1', 'author-1', '2026-08-14T00:00:00.000Z')

    await repository.saveDraft(draft)
    expect((await repository.getDraftForAuthor(workspaceId, 'author-1'))?.id).toBe('draft-1')

    await repository.saveDraft({ ...draft, status: 'approved', terminalAt: '2026-08-14T01:00:00.000Z' })
    expect(await repository.getDraftForAuthor(workspaceId, 'author-1')).toBeNull()
    expect((await repository.getDraft(workspaceId, 'draft-1'))?.status).toBe('approved')
  })

  it('tracks mirror generation and returns drafts newest first', async () => {
    const { collaboration } = await import('../server/_server/collaborationRepository')
    const repository = collaboration()
    const workspaceId = `workspace-${crypto.randomUUID()}`
    await repository.saveDraft(summary(workspaceId, 'older', 'author-a', '2026-08-14T00:00:00.000Z'))
    await repository.saveDraft(summary(workspaceId, 'newer', 'author-b', '2026-08-14T02:00:00.000Z'))

    expect((await repository.listDrafts(workspaceId)).map((draft) => draft.id)).toEqual(['newer', 'older'])
    expect(await repository.getMirrorGeneration(workspaceId)).toBe(0)
    expect(await repository.bumpMirrorGeneration(workspaceId)).toBe(1)
    expect(await repository.bumpMirrorGeneration(workspaceId)).toBe(2)
  })

  it('serializes submit and review for the same contributor', async () => {
    const { collaboration } = await import('../server/_server/collaborationRepository')
    const repository = collaboration()
    const workspaceId = `workspace-${crypto.randomUUID()}`
    const first = await repository.acquireAuthorWorkflowLock(workspaceId, 'author-lock')
    expect(first).toBeTypeOf('string')
    expect(await repository.acquireAuthorWorkflowLock(workspaceId, 'author-lock')).toBeNull()
    await repository.releaseAuthorWorkflowLock(workspaceId, 'author-lock', 'wrong-token')
    expect(await repository.acquireAuthorWorkflowLock(workspaceId, 'author-lock')).toBeNull()
    await repository.releaseAuthorWorkflowLock(workspaceId, 'author-lock', first!)
    expect(await repository.acquireAuthorWorkflowLock(workspaceId, 'author-lock')).toBeTypeOf('string')
  })

  it('does not clear a newer active-draft pointer while deleting terminal history', async () => {
    const { collaboration } = await import('../server/_server/collaborationRepository')
    const repository = collaboration()
    const workspaceId = `workspace-${crypto.randomUUID()}`
    const old = summary(workspaceId, 'old-terminal', 'same-author', '2026-08-12T00:00:00.000Z')
    await repository.saveDraft({ ...old, status: 'approved', terminalAt: '2026-08-12T01:00:00.000Z' })
    await repository.saveDraft(summary(workspaceId, 'new-active', 'same-author', '2026-08-14T00:00:00.000Z'))

    await repository.deleteDraft(workspaceId, old.id)

    expect((await repository.getDraftForAuthor(workspaceId, 'same-author'))?.id).toBe('new-active')
  })
})
