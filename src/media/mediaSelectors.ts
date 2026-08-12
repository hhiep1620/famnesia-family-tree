import type { PersonMedia } from '../types/family'

export function getPersonMedia(media: PersonMedia[], personId: string): PersonMedia[] {
  return media
    .filter((item) => item.personId === personId && item.type === 'photo')
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id))
}

export function getPrimaryMedia(media: PersonMedia[], personId: string): PersonMedia | undefined {
  return getPersonMedia(media, personId)[0]
}

export function createPrimaryMediaMap(media: PersonMedia[]): Map<string, PersonMedia> {
  const result = new Map<string, PersonMedia>()
  for (const item of media) {
    const current = result.get(item.personId)
    if (!current || item.isPrimary || (!current.isPrimary && (item.sortOrder ?? Number.MAX_SAFE_INTEGER) < (current.sortOrder ?? Number.MAX_SAFE_INTEGER))) {
      result.set(item.personId, item)
    }
  }
  return result
}

export function generateNextMediaId(ids: string[]): string {
  const max = ids.reduce((current, id) => {
    const match = /^M(\d+)$/i.exec(id.trim())
    return match ? Math.max(current, Number(match[1])) : current
  }, 0)
  return `M${String(max + 1).padStart(4, '0')}`
}
