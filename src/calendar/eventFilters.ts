import type { FamilyEvent, FamilyEventType } from '../types/family'
import { parseIsoDate } from './dateUtils'

export function filterFamilyEvents(events: FamilyEvent[], type: FamilyEventType | 'all', year?: number, month?: number): FamilyEvent[] {
  return events.filter((event) => {
    const date = parseIsoDate(event.date)
    return (type === 'all' || event.type === type)
      && (year === undefined || date?.getFullYear() === year)
      && (month === undefined || date?.getMonth() === month)
  })
}
