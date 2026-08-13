import { Redis } from '@upstash/redis'
import { isProduction } from './env.js'
import type { ReviewDraftSummary } from '../../src/types/collaboration.js'

export interface CollaborationMemberRecord {
  workspaceId: string
  email: string
  rootPermissionId: string
  draftFolderId?: string
  draftPermissionId?: string
  draftFileId?: string
  assetsFolderId?: string
  role: 'contributor' | 'viewer'
  migratedAt?: string
  migrationError?: string
}

export interface MirrorRecord {
  workspaceId: string
  googleSub: string
  email: string
  generation: number
  syncedGeneration: number
  status: 'idle' | 'syncing' | 'synced' | 'pending' | 'failed'
  rootFolderId?: string
  latestFolderId?: string
  historyFolderId?: string
  stateFileId?: string
  cursor?: string
  lastSyncedAt?: string
  error?: string
}

export interface CollaborationRepository {
  getMember(workspaceId: string, email: string): Promise<CollaborationMemberRecord | null>
  listMembers(workspaceId: string): Promise<CollaborationMemberRecord[]>
  saveMember(member: CollaborationMemberRecord): Promise<void>
  deleteMember(workspaceId: string, email: string): Promise<void>
  getDraft(workspaceId: string, draftId: string): Promise<ReviewDraftSummary | null>
  getDraftForAuthor(workspaceId: string, authorId: string): Promise<ReviewDraftSummary | null>
  listDrafts(workspaceId: string): Promise<ReviewDraftSummary[]>
  saveDraft(draft: ReviewDraftSummary): Promise<void>
  deleteDraft(workspaceId: string, draftId: string): Promise<void>
  getMirrorGeneration(workspaceId: string): Promise<number>
  bumpMirrorGeneration(workspaceId: string): Promise<number>
  getMirror(workspaceId: string, googleSub: string): Promise<MirrorRecord | null>
  saveMirror(mirror: MirrorRecord): Promise<void>
  acquireAuthorWorkflowLock(workspaceId: string, authorId: string): Promise<string | null>
  releaseAuthorWorkflowLock(workspaceId: string, authorId: string, token: string): Promise<void>
}

const PREFIX = 'family-tree:collaboration:v2'
const normalizeEmail = (email: string) => email.trim().toLowerCase()
const memberKey = (workspaceId: string, email: string) => `${PREFIX}:workspace:${workspaceId}:member:${normalizeEmail(email)}`
const memberIndexKey = (workspaceId: string) => `${PREFIX}:workspace:${workspaceId}:members`
const draftKey = (workspaceId: string, draftId: string) => `${PREFIX}:workspace:${workspaceId}:draft:${draftId}`
const draftIndexKey = (workspaceId: string) => `${PREFIX}:workspace:${workspaceId}:drafts`
const authorDraftKey = (workspaceId: string, authorId: string) => `${PREFIX}:workspace:${workspaceId}:author-draft:${authorId}`
const generationKey = (workspaceId: string) => `${PREFIX}:workspace:${workspaceId}:mirror-generation`
const mirrorKey = (workspaceId: string, googleSub: string) => `${PREFIX}:workspace:${workspaceId}:mirror:${googleSub}`
const workflowLockKey = (workspaceId: string, authorId: string) => `${PREFIX}:workspace:${workspaceId}:author-lock:${authorId}`

class RedisCollaborationRepository implements CollaborationRepository {
  constructor(private readonly redis: Redis) {}

  getMember(workspaceId: string, email: string) { return this.redis.get<CollaborationMemberRecord>(memberKey(workspaceId, email)) }
  async listMembers(workspaceId: string) {
    const emails = await this.redis.smembers(memberIndexKey(workspaceId))
    return (await Promise.all(emails.map((email) => this.getMember(workspaceId, email)))).filter((item): item is CollaborationMemberRecord => Boolean(item))
  }
  async saveMember(member: CollaborationMemberRecord) {
    const email = normalizeEmail(member.email)
    await Promise.all([this.redis.set(memberKey(member.workspaceId, email), { ...member, email }), this.redis.sadd(memberIndexKey(member.workspaceId), email)])
  }
  async deleteMember(workspaceId: string, email: string) {
    const normalized = normalizeEmail(email)
    await Promise.all([this.redis.del(memberKey(workspaceId, normalized)), this.redis.srem(memberIndexKey(workspaceId), normalized)])
  }
  getDraft(workspaceId: string, draftId: string) { return this.redis.get<ReviewDraftSummary>(draftKey(workspaceId, draftId)) }
  async getDraftForAuthor(workspaceId: string, authorId: string) {
    const draftId = await this.redis.get<string>(authorDraftKey(workspaceId, authorId))
    return draftId ? this.getDraft(workspaceId, draftId) : null
  }
  async listDrafts(workspaceId: string) {
    const ids = await this.redis.smembers(draftIndexKey(workspaceId))
    const drafts = (await Promise.all(ids.map((id) => this.getDraft(workspaceId, id)))).filter((item): item is ReviewDraftSummary => Boolean(item))
    return drafts.toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }
  async saveDraft(draft: ReviewDraftSummary) {
    const terminal = ['approved', 'rejected', 'invalid'].includes(draft.status)
    const actions: Promise<unknown>[] = [this.redis.set(draftKey(draft.workspaceId, draft.id), draft), this.redis.sadd(draftIndexKey(draft.workspaceId), draft.id)]
    if (terminal) actions.push(this.redis.del(authorDraftKey(draft.workspaceId, draft.author.id)))
    else actions.push(this.redis.set(authorDraftKey(draft.workspaceId, draft.author.id), draft.id))
    await Promise.all(actions)
  }
  async deleteDraft(workspaceId: string, draftId: string) {
    const draft = await this.getDraft(workspaceId, draftId)
    const actions: Promise<unknown>[] = [
      this.redis.del(draftKey(workspaceId, draftId)),
      this.redis.srem(draftIndexKey(workspaceId), draftId),
    ]
    if (draft && await this.redis.get<string>(authorDraftKey(workspaceId, draft.author.id)) === draftId) actions.push(this.redis.del(authorDraftKey(workspaceId, draft.author.id)))
    await Promise.all(actions)
  }
  async getMirrorGeneration(workspaceId: string) { return Number(await this.redis.get<number>(generationKey(workspaceId)) ?? 0) }
  async bumpMirrorGeneration(workspaceId: string) { return Number(await this.redis.incr(generationKey(workspaceId))) }
  getMirror(workspaceId: string, googleSub: string) { return this.redis.get<MirrorRecord>(mirrorKey(workspaceId, googleSub)) }
  async saveMirror(mirror: MirrorRecord) { await this.redis.set(mirrorKey(mirror.workspaceId, mirror.googleSub), mirror) }
  async acquireAuthorWorkflowLock(workspaceId: string, authorId: string) {
    const token = crypto.randomUUID()
    const result = await this.redis.set(workflowLockKey(workspaceId, authorId), token, { nx: true, ex: 120 })
    return result === 'OK' ? token : null
  }
  async releaseAuthorWorkflowLock(workspaceId: string, authorId: string, token: string) {
    const key = workflowLockKey(workspaceId, authorId)
    if (await this.redis.get<string>(key) === token) await this.redis.del(key)
  }
}

interface MemoryCollaborationStore {
  members: Map<string, CollaborationMemberRecord>
  drafts: Map<string, ReviewDraftSummary>
  authorDrafts: Map<string, string>
  generations: Map<string, number>
  mirrors: Map<string, MirrorRecord>
  workflowLocks: Map<string, string>
}

declare global { var __famnesiaCollaborationStore: MemoryCollaborationStore | undefined }

class MemoryCollaborationRepository implements CollaborationRepository {
  private readonly store: MemoryCollaborationStore
  constructor() {
    this.store = globalThis.__famnesiaCollaborationStore ??= { members: new Map(), drafts: new Map(), authorDrafts: new Map(), generations: new Map(), mirrors: new Map(), workflowLocks: new Map() }
    this.store.workflowLocks ??= new Map()
  }
  private memberId(workspaceId: string, email: string) { return `${workspaceId}:${normalizeEmail(email)}` }
  private draftId(workspaceId: string, draftId: string) { return `${workspaceId}:${draftId}` }
  getMember(workspaceId: string, email: string) { return Promise.resolve(structuredClone(this.store.members.get(this.memberId(workspaceId, email)) ?? null)) }
  listMembers(workspaceId: string) { return Promise.resolve([...this.store.members.values()].filter((item) => item.workspaceId === workspaceId).map((item) => structuredClone(item))) }
  saveMember(member: CollaborationMemberRecord) { this.store.members.set(this.memberId(member.workspaceId, member.email), structuredClone({ ...member, email: normalizeEmail(member.email) })); return Promise.resolve() }
  deleteMember(workspaceId: string, email: string) { this.store.members.delete(this.memberId(workspaceId, email)); return Promise.resolve() }
  getDraft(workspaceId: string, draftId: string) { return Promise.resolve(structuredClone(this.store.drafts.get(this.draftId(workspaceId, draftId)) ?? null)) }
  async getDraftForAuthor(workspaceId: string, authorId: string) { const id = this.store.authorDrafts.get(`${workspaceId}:${authorId}`); return id ? this.getDraft(workspaceId, id) : null }
  listDrafts(workspaceId: string) { return Promise.resolve([...this.store.drafts.values()].filter((item) => item.workspaceId === workspaceId).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((item) => structuredClone(item))) }
  saveDraft(draft: ReviewDraftSummary) { this.store.drafts.set(this.draftId(draft.workspaceId, draft.id), structuredClone(draft)); const key = `${draft.workspaceId}:${draft.author.id}`; if (['approved', 'rejected', 'invalid'].includes(draft.status)) this.store.authorDrafts.delete(key); else this.store.authorDrafts.set(key, draft.id); return Promise.resolve() }
  async deleteDraft(workspaceId: string, draftId: string) { const draft = await this.getDraft(workspaceId, draftId); this.store.drafts.delete(this.draftId(workspaceId, draftId)); const key = draft ? `${workspaceId}:${draft.author.id}` : ''; if (key && this.store.authorDrafts.get(key) === draftId) this.store.authorDrafts.delete(key) }
  getMirrorGeneration(workspaceId: string) { return Promise.resolve(this.store.generations.get(workspaceId) ?? 0) }
  bumpMirrorGeneration(workspaceId: string) { const value = (this.store.generations.get(workspaceId) ?? 0) + 1; this.store.generations.set(workspaceId, value); return Promise.resolve(value) }
  getMirror(workspaceId: string, googleSub: string) { return Promise.resolve(structuredClone(this.store.mirrors.get(`${workspaceId}:${googleSub}`) ?? null)) }
  saveMirror(mirror: MirrorRecord) { this.store.mirrors.set(`${mirror.workspaceId}:${mirror.googleSub}`, structuredClone(mirror)); return Promise.resolve() }
  acquireAuthorWorkflowLock(workspaceId: string, authorId: string) { const key = `${workspaceId}:${authorId}`; if (this.store.workflowLocks.has(key)) return Promise.resolve(null); const token = crypto.randomUUID(); this.store.workflowLocks.set(key, token); return Promise.resolve(token) }
  releaseAuthorWorkflowLock(workspaceId: string, authorId: string, token: string) { const key = `${workspaceId}:${authorId}`; if (this.store.workflowLocks.get(key) === token) this.store.workflowLocks.delete(key); return Promise.resolve() }
}

let repository: CollaborationRepository | undefined

export function collaboration(): CollaborationRepository {
  if (repository) return repository
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN
  if (url && token) repository = new RedisCollaborationRepository(new Redis({ url, token }))
  else if (!isProduction() && process.env.SESSION_STORE_DRIVER === 'memory') repository = new MemoryCollaborationRepository()
  else throw new Error('Persistent collaboration store is not configured. Add Upstash Redis credentials.')
  return repository
}
