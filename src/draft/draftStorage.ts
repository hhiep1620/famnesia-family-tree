import type { StoredFamilyDraft } from '../types/familyOperations'

export const FAMILY_DRAFT_SCHEMA_VERSION = 1
export const FAMILY_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const DB_NAME = 'famnesia-drafts'
const STORE_NAME = 'family-drafts'

export function familyDraftKey(workspaceId: string, userId: string): string {
  return `famnesia:draft:${workspaceId}:${userId}`
}

function openDraftDatabase(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(undefined)
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Không thể mở kho Draft trên thiết bị.'))
  })
}

async function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Không thể truy cập Draft trên thiết bị.'))
  })
}

export async function saveFamilyDraft(draft: StoredFamilyDraft): Promise<void> {
  const database = await openDraftDatabase()
  if (!database) return
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    await requestResult(transaction.objectStore(STORE_NAME).put(draft, familyDraftKey(draft.workspaceId, draft.userId)))
  } finally { database.close() }
}

export async function loadFamilyDraft(workspaceId: string, userId: string): Promise<StoredFamilyDraft | undefined> {
  const database = await openDraftDatabase()
  if (!database) return undefined
  try {
    return await requestResult(database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(familyDraftKey(workspaceId, userId))) as StoredFamilyDraft | undefined
  } finally { database.close() }
}

export async function deleteFamilyDraft(workspaceId: string, userId: string): Promise<void> {
  const database = await openDraftDatabase()
  if (!database) return
  try {
    await requestResult(database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(familyDraftKey(workspaceId, userId)))
  } finally { database.close() }
}

export function isExpiredFamilyDraft(draft: StoredFamilyDraft, now = Date.now()): boolean {
  return now - Date.parse(draft.updatedAt) > FAMILY_DRAFT_TTL_MS
}
