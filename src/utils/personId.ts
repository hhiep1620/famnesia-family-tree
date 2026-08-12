const PERSON_ID = /^P(\d+)$/

export function generateNextPersonId(ids: string[]): string {
  const next = ids.reduce((max, id) => {
    const match = PERSON_ID.exec(id)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0) + 1

  return `P${String(next).padStart(4, '0')}`
}
