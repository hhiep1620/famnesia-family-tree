import type { ActivityEvent } from '../types/family.js'

export const ACTIVITY_RETENTION_LIMIT = 20

export function retainRecentActivity(events: ActivityEvent[], limit = ACTIVITY_RETENTION_LIMIT): ActivityEvent[] {
  const byId = new Map<string, ActivityEvent>()
  for (const event of events) {
    const previous = byId.get(event.id)
    if (!previous || event.timestamp > previous.timestamp) byId.set(event.id, event)
  }
  return [...byId.values()].sort((left, right) => right.timestamp.localeCompare(left.timestamp)).slice(0, Math.max(0, Math.min(limit, ACTIVITY_RETENTION_LIMIT)))
}

export function parseActivityJsonLines(contents: string[]): ActivityEvent[] {
  const events: ActivityEvent[] = []
  for (const content of contents) {
    for (const line of content.split('\n').filter(Boolean)) {
      try { events.push(JSON.parse(line) as ActivityEvent) } catch { /* ignore one damaged audit line */ }
    }
  }
  return events
}

export function serializeActivityJsonLines(events: ActivityEvent[]): string {
  return events.map((event) => JSON.stringify(event)).join('\n') + (events.length ? '\n' : '')
}
