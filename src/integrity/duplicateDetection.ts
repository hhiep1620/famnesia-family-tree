import { buildFamilyGraph } from '../graph/familyGraph'
import type { FamilyData, Person } from '../types/family'

export interface DuplicateSignal { label: string; matched: boolean; weight: number }
export interface DuplicateCandidate { id: string; personA: Person; personB: Person; score: number; signals: DuplicateSignal[] }

export function duplicatePairId(leftId: string, rightId: string): string {
  return [leftId, rightId].sort().join('::')
}

function normalized(value?: string | null): string {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLocaleLowerCase('vi').replace(/[^a-z0-9]+/g, ' ').trim()
}

function nameSimilarity(left: string, right: string): number {
  const a = normalized(left); const b = normalized(right)
  if (!a || !b) return 0
  if (a === b) return 1
  const bigrams = (value: string) => new Set(Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2)))
  const aa = bigrams(a); const bb = bigrams(b)
  if (!aa.size || !bb.size) return 0
  let overlap = 0
  for (const token of aa) if (bb.has(token)) overlap += 1
  return 2 * overlap / (aa.size + bb.size)
}

function setOverlap(left: string[], right: string[]): boolean {
  const other = new Set(right)
  return left.some((value) => other.has(value))
}

function nameBucket(name: string): string {
  const parts = normalized(name).split(' ').filter(Boolean)
  return `${parts[0]?.[0] ?? '_'}:${parts.at(-1)?.[0] ?? '_'}:${parts.length}`
}

export function detectDuplicateCandidates(data: FamilyData, minimumScore = 0.62): DuplicateCandidate[] {
  const graph = buildFamilyGraph(data.persons, data.relationships)
  const suppressed = new Set(data.settings.duplicateSuppressions ?? [])
  const candidates: DuplicateCandidate[] = []
  const byProfile = new Map<string, Person[]>()
  for (const person of data.persons) byProfile.set(person.profileId ?? '', [...(byProfile.get(person.profileId ?? '') ?? []), person])
  const pairs: Array<[Person, Person]> = []
  for (const persons of byProfile.values()) {
    const buckets = new Map<string, Person[]>()
    for (const person of persons) {
      const key = nameBucket(person.name)
      for (const earlier of buckets.get(key) ?? []) pairs.push([earlier, person])
      buckets.set(key, [...(buckets.get(key) ?? []), person])
    }
  }
  for (const [personA, personB] of pairs) {
    const id = duplicatePairId(personA.id, personB.id)
    if (suppressed.has(id)) continue
    const nameScore = nameSimilarity(personA.name, personB.name)
    if (nameScore < 0.55) continue
    const birthMatch = Boolean(personA.birthDate && personA.birthDate === personB.birthDate)
    const parentMatch = setOverlap(graph.parentsByChild.get(personA.id) ?? [], graph.parentsByChild.get(personB.id) ?? [])
    const spouseMatch = setOverlap(graph.spousesByPerson.get(personA.id) ?? [], graph.spousesByPerson.get(personB.id) ?? [])
    const phoneMatch = Boolean((personA.phone1 || personA.phone2) && [personB.phone1, personB.phone2].some((phone) => phone && [personA.phone1, personA.phone2].includes(phone)))
    const addressMatch = Boolean(normalized(personA.address) && normalized(personA.address) === normalized(personB.address))
    const nicknameMatch = Boolean(normalized(personA.nickname) && normalized(personA.nickname) === normalized(personB.nickname))
    const score = nameScore * 0.4 + Number(birthMatch) * 0.25 + Number(parentMatch) * 0.15 + Number(spouseMatch) * 0.1 + Number(phoneMatch) * 0.05 + Number(addressMatch) * 0.05 + Number(nicknameMatch) * 0.03
    if (score < minimumScore) continue
    candidates.push({ id, personA, personB, score: Math.min(1, score), signals: [
      { label: 'Họ tên', matched: nameScore >= 0.85, weight: 0.4 }, { label: 'Ngày sinh', matched: birthMatch, weight: 0.25 },
      { label: 'Cha mẹ', matched: parentMatch, weight: 0.15 }, { label: 'Vợ/chồng', matched: spouseMatch, weight: 0.1 },
      { label: 'Điện thoại', matched: phoneMatch, weight: 0.05 }, { label: 'Địa chỉ', matched: addressMatch, weight: 0.05 },
    ] })
  }
  return candidates.sort((left, right) => right.score - left.score)
}
