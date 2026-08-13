import { describe, expect, it } from 'vitest'
import { ACTIVITY_RETENTION_LIMIT, parseActivityJsonLines, retainRecentActivity, serializeActivityJsonLines } from '../activity/activityRetention'
import { deletePersonCascade } from '../family/deletePersonCascade'
import { createFamilyDataTemplate } from '../import/exportFamilyData'
import { requireValidFamilyData } from '../schema/familyDataSchema'
import type { ActivityEvent } from '../types/family'

function activity(index: number): ActivityEvent {
  return {
    id: `A${index}`,
    workspaceId: 'W1',
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    actorEmail: 'owner@example.com',
    action: 'person.updated',
    entityType: 'person',
    summary: `Activity ${index}`,
  }
}

describe('cascade person deletion', () => {
  it('removes the person, every attached relationship and media reference in one valid update', () => {
    const data = createFamilyDataTemplate()
    data.media.push({ id: 'M0001', profileId: 'F0001', personId: 'P0001', driveFileId: 'safe_photo', type: 'photo', isPrimary: true })
    const deletion = deletePersonCascade(data, 'P0001')
    expect(deletion.relationshipCount).toBe(2)
    expect(deletion.mediaCount).toBe(1)
    expect(deletion.data.persons.some((person) => person.id === 'P0001')).toBe(false)
    expect(deletion.data.relationships.some((relationship) => relationship.person1Id === 'P0001' || relationship.person2Id === 'P0001')).toBe(false)
    expect(deletion.data.media.some((media) => media.personId === 'P0001')).toBe(false)
    expect(deletion.data.profiles[0].subjectPersonId).toBeNull()
    expect(() => requireValidFamilyData(deletion.data)).not.toThrow()
  })
})

describe('activity retention', () => {
  it('keeps only the 20 newest unique activity records', () => {
    const events = Array.from({ length: 27 }, (_, index) => activity(index))
    const retained = retainRecentActivity([...events, activity(26)])
    expect(retained).toHaveLength(ACTIVITY_RETENTION_LIMIT)
    expect(retained[0].id).toBe('A26')
    expect(retained.at(-1)?.id).toBe('A7')
  })

  it('round-trips JSONL and ignores damaged lines', () => {
    const events = [activity(1), activity(2)]
    expect(parseActivityJsonLines([`${serializeActivityJsonLines(events)}not-json\n`])).toEqual(events)
  })
})
