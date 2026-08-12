import { describe, expect, it } from 'vitest'
import { calculateAge } from '../calendar/dateUtils'
import { getBirthdayEvents } from '../calendar/birthdayEvents'
import { getDeathAnniversaryEvents } from '../calendar/deathAnniversaryEvents'
import { getUpcomingFamilyEvents } from '../calendar/familyCalendar'
import { convertLunarToSolar, convertSolarToLunar } from '../calendar/lunarCalendar'
import { buildFamilyGraph } from '../graph/familyGraph'
import { createFamilyUnits } from '../graph/familyUnits'
import { getKinship } from '../kinship/kinshipEngine'
import { createFlowEdges } from '../layout/familyLayout'
import type { Person, Relationship } from '../types/family'

const people: Person[] = [
  { id: 'S', name: 'Tôi', gender: 'male', birthDate: '1990-12-05' },
  { id: 'F', name: 'Bố', gender: 'male', birthDate: '1960-01-01' },
  { id: 'M', name: 'Mẹ', gender: 'female', birthDate: '1962-01-01' },
  { id: 'PGF', name: 'Ông nội', gender: 'male', birthDate: '1930-01-01' },
  { id: 'PGM', name: 'Bà nội', gender: 'female', birthDate: '1932-01-01' },
  { id: 'MGF', name: 'Ông ngoại', gender: 'male', birthDate: '1931-01-01' },
  { id: 'MGM', name: 'Bà ngoại', gender: 'female', birthDate: '1933-01-01' },
  { id: 'PA', name: 'Cô', gender: 'female', birthDate: '1965-01-01' },
  { id: 'PB', name: 'Bác', gender: 'male', birthDate: '1957-01-01' },
  { id: 'PU', name: 'Chú', gender: 'male', birthDate: '1964-01-01' },
  { id: 'PAS', name: 'Dượng', gender: 'male' },
  { id: 'PUS', name: 'Thím', gender: 'female' },
  { id: 'MU', name: 'Cậu', gender: 'male', birthDate: '1964-01-01' },
  { id: 'MA', name: 'Dì', gender: 'female', birthDate: '1966-01-01' },
  { id: 'W', name: 'Vợ', gender: 'female' },
  { id: 'C', name: 'Con', gender: 'female' },
  { id: 'GC', name: 'Cháu', gender: 'male' },
  { id: 'MUS', name: 'Mợ', gender: 'female' },
  { id: 'GGP', name: 'Cụ', gender: 'male' },
  { id: 'SIB', name: 'Chị', gender: 'female', birthDate: '1988-01-01' },
  { id: 'SIBH', name: 'Chồng của chị', gender: 'male', birthDate: '1987-01-01' },
  { id: 'YB', name: 'Em trai', gender: 'male', birthDate: '1994-01-01' },
  { id: 'YBW', name: 'Vợ của em trai', gender: 'female', birthDate: '1995-01-01' },
  { id: 'PAC', name: 'Em họ nội', gender: 'female', birthDate: '1992-01-01' },
  { id: 'MAO', name: 'Chị của mẹ', gender: 'female', birthDate: '1958-01-01' },
  { id: 'MAOS', name: 'Chồng của chị mẹ', gender: 'male' },
]

const relationships: Relationship[] = [
  { id: 'r1', person1Id: 'F', person2Id: 'S', type: 'parent' },
  { id: 'r2', person1Id: 'M', person2Id: 'S', type: 'parent' },
  { id: 'r3', person1Id: 'PGF', person2Id: 'F', type: 'parent' },
  { id: 'r4', person1Id: 'PGM', person2Id: 'F', type: 'parent' },
  { id: 'r5', person1Id: 'MGF', person2Id: 'M', type: 'parent' },
  { id: 'r6', person1Id: 'MGM', person2Id: 'M', type: 'parent' },
  { id: 'r7', person1Id: 'PGF', person2Id: 'PA', type: 'parent' },
  { id: 'r8', person1Id: 'PGM', person2Id: 'PA', type: 'parent' },
  { id: 'r9', person1Id: 'MGF', person2Id: 'MU', type: 'parent' },
  { id: 'r10', person1Id: 'MGM', person2Id: 'MU', type: 'parent' },
  { id: 'r11', person1Id: 'MGF', person2Id: 'MA', type: 'parent' },
  { id: 'r12', person1Id: 'MGM', person2Id: 'MA', type: 'parent' },
  { id: 'r13', person1Id: 'S', person2Id: 'W', type: 'spouse', status: 'married' },
  { id: 'r14', person1Id: 'S', person2Id: 'C', type: 'parent' },
  { id: 'r15', person1Id: 'C', person2Id: 'GC', type: 'parent' },
  { id: 'r16', person1Id: 'MU', person2Id: 'MUS', type: 'spouse', status: 'married' },
  { id: 'r17', person1Id: 'GGP', person2Id: 'PGF', type: 'parent' },
  { id: 'r18', person1Id: 'PGF', person2Id: 'PB', type: 'parent' },
  { id: 'r19', person1Id: 'PGM', person2Id: 'PB', type: 'parent' },
  { id: 'r20', person1Id: 'PGF', person2Id: 'PU', type: 'parent' },
  { id: 'r21', person1Id: 'PGM', person2Id: 'PU', type: 'parent' },
  { id: 'r22', person1Id: 'PA', person2Id: 'PAS', type: 'spouse', status: 'married' },
  { id: 'r23', person1Id: 'PU', person2Id: 'PUS', type: 'spouse', status: 'married' },
  { id: 'r24', person1Id: 'F', person2Id: 'SIB', type: 'parent' },
  { id: 'r25', person1Id: 'M', person2Id: 'SIB', type: 'parent' },
  { id: 'r26', person1Id: 'SIB', person2Id: 'SIBH', type: 'spouse', status: 'married' },
  { id: 'r27', person1Id: 'F', person2Id: 'YB', type: 'parent' },
  { id: 'r28', person1Id: 'M', person2Id: 'YB', type: 'parent' },
  { id: 'r29', person1Id: 'YB', person2Id: 'YBW', type: 'spouse', status: 'married' },
  { id: 'r30', person1Id: 'PA', person2Id: 'PAC', type: 'parent' },
  { id: 'r31', person1Id: 'PAS', person2Id: 'PAC', type: 'parent' },
  { id: 'r32', person1Id: 'MGF', person2Id: 'MAO', type: 'parent' },
  { id: 'r33', person1Id: 'MGM', person2Id: 'MAO', type: 'parent' },
  { id: 'r34', person1Id: 'MAO', person2Id: 'MAOS', type: 'spouse', status: 'married' },
]

describe('age and family events', () => {
  it('calculates age dynamically and generates annual birthdays', () => {
    expect(calculateAge('1990-12-05', new Date(2026, 11, 4, 12))).toBe(35)
    expect(calculateAge('1990-12-05', new Date(2026, 11, 5, 12))).toBe(36)
    expect(getBirthdayEvents([people[0]], 2026)[0]).toMatchObject({ date: '2026-12-05', ageTurning: 36 })
  })

  it('round-trips Vietnamese lunar dates and generates a memorial event', () => {
    expect(convertSolarToLunar('2010-09-21')).toMatchObject({ day: 14, month: 8, year: 2010, leapMonth: false })
    expect(convertLunarToSolar(14, 8, 2026, false)).toBe('2026-09-24')
    const deceased: Person = { id: 'D', name: 'Người đã mất', isDeceased: true, deathLunar: { day: 12, month: 7, leapMonth: false } }
    expect(getDeathAnniversaryEvents([deceased], 2026)).toHaveLength(1)
  })

  it('limits upcoming reminders to the next six months without duplicating the following year', () => {
    const events = getUpcomingFamilyEvents([people[0]], 183, 'all', new Date(2026, 7, 12, 12))
    expect(events.map((event) => event.date)).toEqual(['2026-12-05'])
  })
})

describe('Vietnamese kinship engine', () => {
  const graph = buildFamilyGraph(people, relationships)
  const label = (id: string) => getKinship('S', id, graph)?.label

  it('classifies direct and generational relationships', () => {
    expect(label('F')).toBe('Bố')
    expect(label('M')).toBe('Mẹ')
    expect(label('PGF')).toBe('Ông nội')
    expect(label('PGM')).toBe('Bà nội')
    expect(label('MGF')).toBe('Ông ngoại')
    expect(label('MGM')).toBe('Bà ngoại')
    expect(label('W')).toBe('Vợ')
    expect(label('C')).toBe('Con gái')
    expect(label('GC')).toBe('Cháu trai ngoại')
    expect(label('GGP')).toBe('Cụ ông nội')
  })

  it('uses parental branch and marriage edges for extended kinship', () => {
    expect(label('PA')).toBe('Cô')
    expect(label('MU')).toBe('Cậu')
    expect(label('MA')).toBe('Dì')
    expect(label('MUS')).toBe('Mợ')
    expect(label('PB')).toBe('Bác trai')
    expect(label('PU')).toBe('Chú')
    expect(label('PAS')).toBe('Dượng')
    expect(label('PUS')).toBe('Thím')
    expect(label('SIB')).toBe('Chị ruột')
    expect(label('SIBH')).toBe('Anh rể')
    expect(label('YB')).toBe('Em trai ruột')
    expect(label('YBW')).toBe('Em dâu')
    expect(label('PAC')).toBe('Em họ bên nội')
    expect(label('MAO')).toBe('Bác gái')
    expect(label('MAOS')).toBe('Bác trai')
    expect(getKinship('S', 'MUS', graph)?.isMarriageRelation).toBe(true)
  })
})

describe('historical spouse status', () => {
  it('keeps divorced parents connected to their child', () => {
    const family: Person[] = [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }, { id: 'C', name: 'C' }]
    const links: Relationship[] = [
      { id: 's', person1Id: 'A', person2Id: 'B', type: 'spouse', status: 'divorced' },
      { id: 'a', person1Id: 'A', person2Id: 'C', type: 'parent' },
      { id: 'b', person1Id: 'B', person2Id: 'C', type: 'parent' },
    ]
    const graph = buildFamilyGraph(family, links)
    expect(graph.spousesByPerson.get('A')).toEqual(['B'])
    expect(graph.parentsByChild.get('C')).toEqual(['A', 'B'])
    expect(createFlowEdges(graph, createFamilyUnits(graph)).find((edge) => edge.id === 'spouse:s')?.className).toContain('spouse-divorced')
  })

  it('preserves separated relationships as a distinct state', () => {
    const family: Person[] = [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }]
    const graph = buildFamilyGraph(family, [{ id: 's', person1Id: 'A', person2Id: 'B', type: 'spouse', status: 'separated' }])
    expect(graph.spousesByPerson.get('A')).toEqual(['B'])
    expect(createFlowEdges(graph, createFamilyUnits(graph)).find((edge) => edge.id === 'spouse:s')?.className).toContain('spouse-separated')
  })
})
