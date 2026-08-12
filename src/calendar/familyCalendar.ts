import type { FamilyEvent, FamilyEventType, Person } from '../types/family'
import { getBirthdayEvents } from './birthdayEvents'
import { getDeathAnniversaryEvents } from './deathAnniversaryEvents'
import { differenceInCalendarDays, parseIsoDate, todayInFamilyTimezone } from './dateUtils'

export function getFamilyEventsForYear(persons: Person[], year: number): FamilyEvent[] {
  return [...getBirthdayEvents(persons, year), ...getDeathAnniversaryEvents(persons, year)]
    .sort((a, b) => a.date.localeCompare(b.date) || a.personId.localeCompare(b.personId))
}

export function getFamilyEventsForMonth(persons: Person[], year: number, month: number, type: FamilyEventType | 'all' = 'all'): FamilyEvent[] {
  return getFamilyEventsForYear(persons, year).filter((event) => {
    const date = parseIsoDate(event.date)
    return date?.getMonth() === month && (type === 'all' || event.type === type)
  })
}

export function getUpcomingFamilyEvents(
  persons: Person[],
  days = 30,
  type: FamilyEventType | 'all' = 'all',
  referenceDate = todayInFamilyTimezone(),
): FamilyEvent[] {
  const events = [
    ...getFamilyEventsForYear(persons, referenceDate.getFullYear()),
    ...getFamilyEventsForYear(persons, referenceDate.getFullYear() + 1),
  ]
  return events.filter((event) => {
    const date = parseIsoDate(event.date)
    if (!date) return false
    const difference = differenceInCalendarDays(date, referenceDate)
    return difference >= 0 && difference <= days && (type === 'all' || event.type === type)
  }).sort((a, b) => a.date.localeCompare(b.date))
}

export function getReminderLabel(event: FamilyEvent, referenceDate = todayInFamilyTimezone()): string {
  const date = parseIsoDate(event.date)
  if (!date) return ''
  const days = differenceInCalendarDays(date, referenceDate)
  if (days === 0) return 'Hôm nay'
  if (days === 1) return 'Ngày mai'
  return `Trong ${days} ngày`
}
