import type { FamilyData, FamilyProfile, Person, PersonMedia, Relationship } from '../types/family'
import type { FamilyOperation, FamilyOperationConflict, FamilyOperationType } from '../types/familyOperations'

const OPERATION_TYPES = new Set<FamilyOperationType>([
  'profile.create', 'profile.update', 'subject.set',
  'person.create', 'person.update', 'person.delete',
  'relationship.create', 'relationship.update', 'relationship.delete',
  'media.attach', 'media.primary.set', 'media.caption.update', 'media.delete',
  'settings.duplicate_suppression.add',
])

function clone<T>(value: T): T { return structuredClone(value) }
function equal(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right) }
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

export function createOperation(input: Omit<FamilyOperation, 'id' | 'createdAt'>): FamilyOperation {
  return { ...input, id: `op_${crypto.randomUUID()}`, createdAt: new Date().toISOString() }
}

export function isFamilyOperation(value: unknown): value is FamilyOperation {
  const item = record(value)
  return Boolean(item
    && typeof item.id === 'string' && item.id.length > 0
    && typeof item.type === 'string' && OPERATION_TYPES.has(item.type as FamilyOperationType)
    && typeof item.createdAt === 'string' && !Number.isNaN(Date.parse(item.createdAt))
    && (item.entityId === undefined || typeof item.entityId === 'string')
    && (item.profileId === undefined || typeof item.profileId === 'string')
    && (item.changes === undefined || record(item.changes))
    && (item.baseValues === undefined || record(item.baseValues)))
}

function entityDomain(type: FamilyOperationType): string {
  if (type.startsWith('profile.') || type === 'subject.set') return 'profile'
  if (type.startsWith('person.')) return 'person'
  if (type.startsWith('relationship.')) return 'relationship'
  if (type.startsWith('media.')) return 'media'
  return 'settings'
}

function isUpdate(type: FamilyOperationType): boolean {
  return type === 'profile.update' || type === 'subject.set' || type === 'person.update'
    || type === 'relationship.update' || type === 'media.caption.update' || type === 'media.primary.set'
}

function isCreate(type: FamilyOperationType): boolean {
  return type === 'profile.create' || type === 'person.create' || type === 'relationship.create' || type === 'media.attach'
}

function isDelete(type: FamilyOperationType): boolean {
  return type === 'person.delete' || type === 'relationship.delete' || type === 'media.delete'
}

function referencesPerson(operation: FamilyOperation, personId: string): boolean {
  if (entityDomain(operation.type) === 'person' && operation.entityId === personId) return true
  const value = record(operation.value)
  const changes = operation.changes
  return value?.personId === personId || value?.person1Id === personId || value?.person2Id === personId
    || changes?.personId === personId
}

function referencesProfile(operation: FamilyOperation, profileId: string): boolean {
  return operation.profileId === profileId || record(operation.value)?.profileId === profileId
}

export function compactFamilyOperations(input: FamilyOperation[]): FamilyOperation[] {
  let result: FamilyOperation[] = []
  for (const source of input) {
    const operation = clone(source)
    if (operation.type === 'settings.duplicate_suppression.add') {
      if (!result.some((item) => item.type === operation.type && item.entityId === operation.entityId)) result.push(operation)
      continue
    }
    if (operation.type === 'media.primary.set') {
      result = result.filter((item) => item.type !== 'media.primary.set' || item.changes?.personId !== operation.changes?.personId)
      result.push(operation)
      continue
    }

    const domain = entityDomain(operation.type)
    const sameIndex = result.findIndex((item) => entityDomain(item.type) === domain && item.entityId === operation.entityId)
    const previous = sameIndex >= 0 ? result[sameIndex] : undefined

    if (previous && isCreate(previous.type) && isUpdate(operation.type)) {
      previous.value = { ...(record(previous.value) ?? {}), ...(operation.changes ?? {}) }
      continue
    }
    if (previous && isUpdate(previous.type) && isUpdate(operation.type)) {
      previous.changes = { ...(previous.changes ?? {}), ...(operation.changes ?? {}) }
      previous.baseValues = { ...(operation.baseValues ?? {}), ...(previous.baseValues ?? {}) }
      continue
    }
    if (previous && isCreate(previous.type) && isDelete(operation.type)) {
      const removed = previous
      result.splice(sameIndex, 1)
      if (domain === 'person' && removed.entityId) result = result.filter((item) => !referencesPerson(item, removed.entityId!))
      if (domain === 'profile' && removed.entityId) result = result.filter((item) => !referencesProfile(item, removed.entityId!))
      continue
    }
    if (previous && isUpdate(previous.type) && isDelete(operation.type)) {
      result.splice(sameIndex, 1, operation)
      continue
    }
    result.push(operation)
  }
  return result
}

export function removeOperationWithDependencies(operations: FamilyOperation[], operationId: string): FamilyOperation[] {
  const target = operations.find((item) => item.id === operationId)
  if (!target) return operations
  if (target.type === 'person.create' && target.entityId) return compactFamilyOperations(operations.filter((item) => !referencesPerson(item, target.entityId!)))
  if (target.type === 'profile.create' && target.entityId) return compactFamilyOperations(operations.filter((item) => !referencesProfile(item, target.entityId!)))
  if (target.type === 'media.attach' && target.entityId) return compactFamilyOperations(operations.filter((item) => item.entityId !== target.entityId))
  return compactFamilyOperations(operations.filter((item) => item.id !== operationId))
}

function updateEntity<T extends Record<string, unknown>>(entity: T, changes: Record<string, unknown> | undefined): T {
  return { ...entity, ...(changes ?? {}) }
}

function applyOne(data: FamilyData, operation: FamilyOperation): void {
  switch (operation.type) {
    case 'profile.create': data.profiles.push(clone(operation.value as FamilyProfile)); break
    case 'profile.update':
    case 'subject.set': data.profiles = data.profiles.map((item) => item.id === operation.entityId ? updateEntity(item as unknown as Record<string, unknown>, operation.changes) as unknown as FamilyProfile : item); break
    case 'person.create': data.persons.push(clone(operation.value as Person)); break
    case 'person.update': data.persons = data.persons.map((item) => item.id === operation.entityId ? { ...updateEntity(item as unknown as Record<string, unknown>, operation.changes) as unknown as Person, updatedAt: operation.createdAt } : item); break
    case 'person.delete': {
      const personId = operation.entityId
      data.persons = data.persons.filter((item) => item.id !== personId)
      data.relationships = data.relationships.filter((item) => item.person1Id !== personId && item.person2Id !== personId)
      data.media = data.media.filter((item) => item.personId !== personId)
      data.profiles = data.profiles.map((item) => item.subjectPersonId === personId ? { ...item, subjectPersonId: null } : item)
      break
    }
    case 'relationship.create': data.relationships.push(clone(operation.value as Relationship)); break
    case 'relationship.update': data.relationships = data.relationships.map((item) => item.id === operation.entityId ? { ...updateEntity(item as unknown as Record<string, unknown>, operation.changes) as unknown as Relationship, updatedAt: operation.createdAt } : item); break
    case 'relationship.delete': data.relationships = data.relationships.filter((item) => item.id !== operation.entityId); break
    case 'media.attach': data.media.push(clone(operation.value as PersonMedia)); break
    case 'media.caption.update': data.media = data.media.map((item) => item.id === operation.entityId ? updateEntity(item as unknown as Record<string, unknown>, operation.changes) as unknown as PersonMedia : item); break
    case 'media.primary.set': {
      const personId = String(operation.changes?.personId ?? '')
      const primaryMediaId = String(operation.changes?.primaryMediaId ?? operation.entityId ?? '')
      data.media = data.media.map((item) => item.personId === personId ? { ...item, isPrimary: item.id === primaryMediaId } : item)
      break
    }
    case 'media.delete': {
      const target = data.media.find((item) => item.id === operation.entityId)
      data.media = data.media.filter((item) => item.id !== operation.entityId)
      if (target?.isPrimary) {
        const replacement = data.media.find((item) => item.personId === target.personId)
        if (replacement) data.media = data.media.map((item) => item.id === replacement.id ? { ...item, isPrimary: true } : item)
      }
      break
    }
    case 'settings.duplicate_suppression.add': {
      const marker = String(operation.value ?? operation.entityId ?? '')
      const current = data.settings.duplicateSuppressions ?? []
      if (marker && !current.includes(marker)) data.settings = { ...data.settings, duplicateSuppressions: [...current, marker] }
      break
    }
  }
}

export function replayFamilyOperations(base: FamilyData, operations: FamilyOperation[]): FamilyData {
  const data = clone(base)
  operations.forEach((operation) => applyOne(data, operation))
  return data
}

function findEntity(data: FamilyData, operation: FamilyOperation): Record<string, unknown> | undefined {
  if (!operation.entityId) return undefined
  const domain = entityDomain(operation.type)
  if (domain === 'profile') return data.profiles.find((item) => item.id === operation.entityId) as unknown as Record<string, unknown> | undefined
  if (domain === 'person') return data.persons.find((item) => item.id === operation.entityId) as unknown as Record<string, unknown> | undefined
  if (domain === 'relationship') return data.relationships.find((item) => item.id === operation.entityId) as unknown as Record<string, unknown> | undefined
  if (domain === 'media') return data.media.find((item) => item.id === operation.entityId) as unknown as Record<string, unknown> | undefined
  return undefined
}

function conflict(operation: FamilyOperation, field: string, reason: FamilyOperationConflict['reason'], baseValue: unknown, remoteValue: unknown, localValue: unknown): FamilyOperationConflict {
  return { operationId: operation.id, operationType: operation.type, entityId: operation.entityId, profileId: operation.profileId, field, reason, baseValue, remoteValue, localValue }
}

export function mergeFamilyOperations(latest: FamilyData, operations: FamilyOperation[]): { data: FamilyData; conflicts: FamilyOperationConflict[] } {
  const data = clone(latest)
  const conflicts: FamilyOperationConflict[] = []
  for (const operation of compactFamilyOperations(operations)) {
    const current = findEntity(data, operation)
    if (isCreate(operation.type)) {
      if (current && !equal(current, operation.value)) {
        conflicts.push(conflict(operation, '$entity', 'id_exists', undefined, current, operation.value))
        continue
      }
      if (current) continue
      if (operation.type === 'relationship.create') {
        const value = record(operation.value)
        const missing = [value?.person1Id, value?.person2Id].find((id) => typeof id === 'string' && !data.persons.some((person) => person.id === id))
        if (missing) { conflicts.push(conflict(operation, '$reference', 'missing_reference', undefined, missing, operation.value)); continue }
      }
      if (operation.type === 'media.attach') {
        const value = record(operation.value)
        if (typeof value?.personId !== 'string' || !data.persons.some((person) => person.id === value.personId)) {
          conflicts.push(conflict(operation, '$reference', 'missing_reference', undefined, value?.personId, operation.value)); continue
        }
      }
      applyOne(data, operation)
      continue
    }
    if (isDelete(operation.type)) {
      if (!current) continue
      const baseline = operation.baseValues?.$entity
      if (baseline !== undefined && !equal(current, baseline)) {
        conflicts.push(conflict(operation, '$entity', 'delete_changed', baseline, current, null))
        continue
      }
      applyOne(data, operation)
      continue
    }
    if (operation.type === 'settings.duplicate_suppression.add') { applyOne(data, operation); continue }
    if (!current) {
      conflicts.push(conflict(operation, '$entity', 'entity_deleted', operation.baseValues, undefined, operation.changes))
      continue
    }
    let operationHasConflict = false
    for (const [field, localValue] of Object.entries(operation.changes ?? {})) {
      if (operation.type === 'media.primary.set' && field === 'personId') continue
      const remoteValue = operation.type === 'media.primary.set' && field === 'primaryMediaId'
        ? data.media.find((item) => item.personId === operation.changes?.personId && item.isPrimary)?.id ?? null
        : current[field]
      const baseValue = operation.baseValues?.[field]
      if (!equal(remoteValue, baseValue) && !equal(remoteValue, localValue)) {
        conflicts.push(conflict(operation, field, 'field_changed', baseValue, remoteValue, localValue))
        operationHasConflict = true
      }
    }
    if (!operationHasConflict) applyOne(data, operation)
  }
  return { data, conflicts }
}

export function operationCounts(operations: FamilyOperation[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const operation of operations) counts[operation.type] = (counts[operation.type] ?? 0) + 1
  return counts
}

export function operationReferencesNewPhoto(operation: FamilyOperation): string | undefined {
  return operation.type === 'media.attach' ? String(record(operation.value)?.driveFileId ?? '') || undefined : undefined
}

export function operationReferencesDeletedPhoto(operation: FamilyOperation): string | undefined {
  return operation.type === 'media.delete' ? String(record(operation.baseValues?.$entity)?.driveFileId ?? '') || undefined : undefined
}
