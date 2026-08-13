import { describe, expect, it } from 'vitest'
import { calculateFamilyAnalytics } from '../analytics/familyAnalytics'
import { groupProfilesByLineage, normalizeLineageSurname, resolveProfileLineageSurname } from '../family/profileLineage'
import { createFamilyDataTemplate } from '../import/exportFamilyData'
import type { FamilyProfile, Person } from '../types/family'

describe('family lineage profiles', () => {
  const profiles: FamilyProfile[] = [
    { id: 'F1', name: 'Nhà bác Hải', lineageSurname: 'hoàng', subjectPersonId: 'P1', requiresSecret: false, isActive: true },
    { id: 'F2', name: 'Nhà cô Mai', subjectPersonId: 'P2', requiresSecret: false, isActive: true },
  ]
  const people: Person[] = [
    { id: 'P1', profileId: 'F1', name: 'Hoàng Văn Hải', gender: 'male' },
    { id: 'P2', profileId: 'F2', name: 'Nguyễn Văn Minh', gender: 'male' },
  ]

  it('normalizes user-entered clan labels and infers the male subject surname', () => {
    expect(normalizeLineageSurname('  Gia tộc họ hoÀNG ')).toBe('Hoàng')
    expect(resolveProfileLineageSurname(profiles[1], people)).toBe('Nguyễn')
  })

  it('groups multiple family profiles under paternal clan headings', () => {
    expect(groupProfilesByLineage(profiles, people).map((group) => ({ label: group.label, names: group.profiles.map((profile) => profile.name) }))).toEqual([
      { label: 'Gia tộc họ Hoàng', names: ['Nhà bác Hải'] },
      { label: 'Gia tộc họ Nguyễn', names: ['Nhà cô Mai'] },
    ])
  })
})

describe('family analytics distributions', () => {
  it('returns absolute gender totals and ten-year age bins for the charts', () => {
    const data = createFamilyDataTemplate()
    const year = new Date().getFullYear() - 25
    data.persons[0].birthDate = `${year}-01-01`
    data.persons[0].gender = 'male'
    data.persons[1].gender = 'female'
    const analytics = calculateFamilyAnalytics(data, data.profiles[0].subjectPersonId ?? undefined)
    expect(analytics.gender.male).toBe(1)
    expect(analytics.gender.female).toBe(2)
    expect(analytics.age['20–29']).toBeGreaterThanOrEqual(1)
    expect(Object.keys(analytics.age)).toEqual(['0–9', '10–19', '20–29', '30–39', '40–49', '50–59', '60–69', '70–79', '80+', 'Không rõ'])
  })
})
