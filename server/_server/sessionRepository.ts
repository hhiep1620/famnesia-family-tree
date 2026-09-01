import { Redis } from '@upstash/redis'
import { isProduction } from './env.js'
import type { AuthSession } from './types.js'

export interface SessionRepository {
  saveSession(session: AuthSession): Promise<void>
  getSession(id: string): Promise<AuthSession | null>
  deleteSession(id: string): Promise<void>
  deleteUserSessions(googleSub: string): Promise<void>
  saveRefreshToken(googleSub: string, encryptedToken: string, expiresAt: string): Promise<void>
  getRefreshToken(googleSub: string): Promise<string | null>
}

const PREFIX = 'family-tree'
const sessionKey = (id: string) => `${PREFIX}:session:${id}`
const userSessionsKey = (sub: string) => `${PREFIX}:user-sessions:${sub}`
const refreshTokenKey = (sub: string) => `${PREFIX}:refresh-token:${sub}`

function ttl(expiresAt: string): number {
  return Math.max(1, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
}

class RedisSessionRepository implements SessionRepository {
  constructor(private readonly redis: Redis) {}

  async saveSession(session: AuthSession): Promise<void> {
    const seconds = ttl(session.expiresAt)
    await Promise.all([
      this.redis.set(sessionKey(session.id), session, { ex: seconds }),
      this.redis.sadd(userSessionsKey(session.googleSub), session.id),
      this.redis.expire(userSessionsKey(session.googleSub), seconds),
    ])
  }

  async getSession(id: string): Promise<AuthSession | null> {
    return await this.redis.get<AuthSession>(sessionKey(id))
  }

  async deleteSession(id: string): Promise<void> {
    const session = await this.getSession(id)
    await this.redis.del(sessionKey(id))
    if (session) await this.redis.srem(userSessionsKey(session.googleSub), id)
  }

  async deleteUserSessions(googleSub: string): Promise<void> {
    const key = userSessionsKey(googleSub)
    const ids = await this.redis.smembers(key)
    if (ids.length) await this.redis.del(...ids.map(sessionKey))
    await this.redis.del(key)
  }

  async saveRefreshToken(googleSub: string, encryptedToken: string, expiresAt: string): Promise<void> {
    await this.redis.set(refreshTokenKey(googleSub), encryptedToken, { ex: ttl(expiresAt) })
  }

  async getRefreshToken(googleSub: string): Promise<string | null> {
    return await this.redis.get<string>(refreshTokenKey(googleSub))
  }
}

interface MemoryStore {
  sessions: Map<string, AuthSession>
  refreshTokens: Map<string, string>
  userSessions: Map<string, Set<string>>
}

declare global { var __familyTreeMemoryStore: MemoryStore | undefined }

class MemorySessionRepository implements SessionRepository {
  private readonly store = globalThis.__familyTreeMemoryStore ??= {
    sessions: new Map(), refreshTokens: new Map(), userSessions: new Map(),
  }

  async saveSession(session: AuthSession) {
    this.store.sessions.set(session.id, structuredClone(session))
    const ids = this.store.userSessions.get(session.googleSub) ?? new Set<string>()
    ids.add(session.id)
    this.store.userSessions.set(session.googleSub, ids)
  }
  async getSession(id: string) {
    const value = this.store.sessions.get(id)
    if (!value || new Date(value.expiresAt).getTime() <= Date.now()) {
      this.store.sessions.delete(id)
      return null
    }
    return structuredClone(value)
  }
  async deleteSession(id: string) {
    const session = this.store.sessions.get(id)
    this.store.sessions.delete(id)
    if (session) this.store.userSessions.get(session.googleSub)?.delete(id)
  }
  async deleteUserSessions(sub: string) {
    for (const id of this.store.userSessions.get(sub) ?? []) this.store.sessions.delete(id)
    this.store.userSessions.delete(sub)
  }
  async saveRefreshToken(sub: string, encryptedToken: string) { this.store.refreshTokens.set(sub, encryptedToken) }
  async getRefreshToken(sub: string) { return this.store.refreshTokens.get(sub) ?? null }
}

let repository: SessionRepository | undefined

export function sessions(): SessionRepository {
  if (repository) return repository
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN
  if (url && token) repository = new RedisSessionRepository(new Redis({ url, token }))
  else if (!isProduction() && process.env.SESSION_STORE_DRIVER === 'memory') repository = new MemorySessionRepository()
  else throw new Error('Persistent session store is not configured. Add Upstash Redis credentials.')
  return repository
}
