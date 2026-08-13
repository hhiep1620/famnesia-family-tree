import { createHash } from 'node:crypto'
import { compactFamilyOperations } from '../../src/draft/familyOperations.js'
import type { DraftAssetIntegrity, DraftReviewRequest, SubmittedFamilyDraft } from '../../src/types/collaboration.js'
import type { FamilyOperation } from '../../src/types/familyOperations.js'

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]))
  }
  return value
}

export function normalizedDraftAssets(assets: DraftAssetIntegrity[]): DraftAssetIntegrity[] {
  return assets.map((asset) => ({
    fileId: asset.fileId,
    ...(asset.version ? { version: asset.version } : {}),
    ...(asset.md5Checksum ? { md5Checksum: asset.md5Checksum } : {}),
    ...(asset.size ? { size: asset.size } : {}),
  })).toSorted((left, right) => left.fileId.localeCompare(right.fileId))
}

export function draftPayloadHash(payload: SubmittedFamilyDraft): string {
  const normalized = {
    ...payload,
    operations: compactFamilyOperations(payload.operations),
    assets: normalizedDraftAssets(payload.assets),
  }
  return createHash('sha256').update(JSON.stringify(stableValue(normalized))).digest('hex')
}

export function draftAssetIds(operations: FamilyOperation[]): string[] {
  return [...new Set(operations
    .filter((operation) => operation.type === 'media.attach')
    .map((operation) => (operation.value as { driveFileId?: unknown } | undefined)?.driveFileId)
    .filter((value): value is string => typeof value === 'string' && value.length > 0))]
}

export function assetsForOperations(assets: DraftAssetIntegrity[], operations: FamilyOperation[]): DraftAssetIntegrity[] {
  const referenced = new Set(draftAssetIds(operations))
  return assets.filter((asset) => referenced.has(asset.fileId))
}

export function draftReviewRequestProblem(value: unknown): 'invalid' | 'reject_note_required' | undefined {
  if (!value || typeof value !== 'object') return 'invalid'
  const request = value as Partial<DraftReviewRequest>
  if (typeof request.draftId !== 'string' || !request.draftId || !Number.isInteger(request.draftRevision) || Number(request.draftRevision) < 1
    || (request.decision !== 'approve' && request.decision !== 'reject')
    || (request.operationIds !== undefined && (!Array.isArray(request.operationIds) || request.operationIds.length === 0 || request.operationIds.length > 1000 || !request.operationIds.every((id) => typeof id === 'string' && id.length > 0)))
    || (request.note !== undefined && (typeof request.note !== 'string' || request.note.length > 2000))) return 'invalid'
  if (request.decision === 'reject' && !request.note?.trim()) return 'reject_note_required'
  return undefined
}
