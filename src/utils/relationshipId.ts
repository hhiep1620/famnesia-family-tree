const RELATIONSHIP_ID = /^R(\d+)$/

export function generateNextRelationshipId(ids: string[]): string {
  const next = ids.reduce((max, id) => {
    const match = RELATIONSHIP_ID.exec(id)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0) + 1

  return `R${String(next).padStart(4, '0')}`
}
