import { describe, expect, it } from 'vitest'
import { compactFamilyOperations, mergeFamilyOperations, operationReviewClosure, replayFamilyOperations } from '../draft/familyOperations'
import { createFamilyDataTemplate } from '../import/exportFamilyData'
import { requireValidFamilyData } from '../schema/familyDataSchema'
import type { FamilyOperation } from '../types/familyOperations'

let sequence = 0
function operation(input: Omit<FamilyOperation, 'id' | 'createdAt'>): FamilyOperation {
  sequence += 1
  return { ...input, id: `op_test_${sequence}`, createdAt: new Date(Date.UTC(2026, 7, 13, 0, sequence)).toISOString() }
}

describe('family Draft operations', () => {
  it('compacts repeated field edits without losing the original base value', () => {
    const operations = compactFamilyOperations([
      operation({ type: 'person.update', entityId: 'P0001', profileId: 'F0001', changes: { nickname: 'An' }, baseValues: { nickname: 'Ông An' } }),
      operation({ type: 'person.update', entityId: 'P0001', profileId: 'F0001', changes: { nickname: 'Bác An', phone1: '0901' }, baseValues: { nickname: 'An', phone1: '0912345678' } }),
    ])
    expect(operations).toHaveLength(1)
    expect(operations[0].changes).toEqual({ nickname: 'Bác An', phone1: '0901' })
    expect(operations[0].baseValues).toEqual({ nickname: 'Ông An', phone1: '0912345678' })
  })

  it('auto-merges non-overlapping remote and local person fields', () => {
    const base = createFamilyDataTemplate()
    const latest = structuredClone(base)
    latest.persons[0] = { ...latest.persons[0], birthDate: '1951-05-10' }
    const local = operation({ type: 'person.update', entityId: 'P0001', profileId: 'F0001', changes: { nickname: 'Bác An' }, baseValues: { nickname: 'Ông An' } })
    const result = mergeFamilyOperations(latest, [local])
    expect(result.conflicts).toEqual([])
    expect(result.data.persons[0]).toMatchObject({ birthDate: '1951-05-10', nickname: 'Bác An' })
  })

  it('reports a same-field conflict and leaves the remote value intact', () => {
    const latest = createFamilyDataTemplate()
    latest.persons[0] = { ...latest.persons[0], nickname: 'Híp' }
    const local = operation({ type: 'person.update', entityId: 'P0001', profileId: 'F0001', changes: { nickname: 'Hiệp' }, baseValues: { nickname: 'Ông An' } })
    const result = mergeFamilyOperations(latest, [local])
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]).toMatchObject({ field: 'nickname', remoteValue: 'Híp', localValue: 'Hiệp', reason: 'field_changed' })
    expect(result.data.persons[0].nickname).toBe('Híp')
  })

  it('removes a create and every dependent relationship when the new person is deleted before Save All', () => {
    const person = { ...createFamilyDataTemplate().persons[0], id: 'P0099', name: 'Người mới' }
    const relationship = { ...createFamilyDataTemplate().relationships[1], id: 'R0099', person2Id: 'P0099' }
    const operations = compactFamilyOperations([
      operation({ type: 'person.create', entityId: person.id, profileId: 'F0001', value: person }),
      operation({ type: 'relationship.create', entityId: relationship.id, profileId: 'F0001', value: relationship }),
      operation({ type: 'person.delete', entityId: person.id, profileId: 'F0001', baseValues: { $entity: person } }),
    ])
    expect(operations).toEqual([])
  })

  it('replays cascade deletion and primary-photo changes into a valid Draft snapshot', () => {
    const base = createFamilyDataTemplate()
    base.media = [
      { id: 'M0001', profileId: 'F0001', personId: 'P0001', driveFileId: 'photo_one', type: 'photo', isPrimary: true },
      { id: 'M0002', profileId: 'F0001', personId: 'P0001', driveFileId: 'photo_two', type: 'photo', isPrimary: false },
    ]
    const primary = operation({ type: 'media.primary.set', entityId: 'M0002', profileId: 'F0001', changes: { personId: 'P0001', primaryMediaId: 'M0002' }, baseValues: { primaryMediaId: 'M0001' } })
    const switched = replayFamilyOperations(base, [primary])
    expect(switched.media.find((item) => item.id === 'M0002')?.isPrimary).toBe(true)
    const deleted = replayFamilyOperations(switched, [operation({ type: 'person.delete', entityId: 'P0001', profileId: 'F0001', baseValues: { $entity: base.persons[0] } })])
    expect(deleted.relationships.some((item) => item.person1Id === 'P0001' || item.person2Id === 'P0001')).toBe(false)
    expect(deleted.media.some((item) => item.personId === 'P0001')).toBe(false)
    expect(() => requireValidFamilyData(deleted)).not.toThrow()
  })

  it('automatically approves prerequisite person creates for a selected relationship and photo', () => {
    const template = createFamilyDataTemplate()
    const first = { ...template.persons[0], id: 'P0101', name: 'Người thứ nhất' }
    const second = { ...template.persons[0], id: 'P0102', name: 'Người thứ hai' }
    const relationship = { ...template.relationships[0], id: 'R0101', person1Id: first.id, person2Id: second.id }
    const media = { id: 'M0101', profileId: first.profileId, personId: first.id, driveFileId: 'draft-photo-1', type: 'photo' as const, isPrimary: true }
    const operations = [
      operation({ type: 'person.create', entityId: first.id, profileId: first.profileId, value: first }),
      operation({ type: 'person.create', entityId: second.id, profileId: second.profileId, value: second }),
      operation({ type: 'relationship.create', entityId: relationship.id, profileId: relationship.profileId, value: relationship }),
      operation({ type: 'media.attach', entityId: media.id, profileId: media.profileId, value: media }),
    ]

    expect(operationReviewClosure(operations, [operations[2].id, operations[3].id], 'approve'))
      .toEqual(operations.map((item) => item.id))
  })

  it('automatically rejects every operation that depends on a rejected person create', () => {
    const template = createFamilyDataTemplate()
    const person = { ...template.persons[0], id: 'P0201', name: 'Người phụ thuộc' }
    const relationship = { ...template.relationships[0], id: 'R0201', person2Id: person.id }
    const media = { id: 'M0201', profileId: person.profileId, personId: person.id, driveFileId: 'draft-photo-2', type: 'photo' as const, isPrimary: true }
    const operations = [
      operation({ type: 'person.create', entityId: person.id, profileId: person.profileId, value: person }),
      operation({ type: 'relationship.create', entityId: relationship.id, profileId: relationship.profileId, value: relationship }),
      operation({ type: 'media.attach', entityId: media.id, profileId: media.profileId, value: media }),
      operation({ type: 'person.update', entityId: template.persons[0].id, profileId: template.persons[0].profileId, changes: { nickname: 'Không phụ thuộc' }, baseValues: { nickname: template.persons[0].nickname } }),
    ]

    expect(operationReviewClosure(operations, [operations[0].id], 'reject'))
      .toEqual(operations.slice(0, 3).map((item) => item.id))
  })
})
