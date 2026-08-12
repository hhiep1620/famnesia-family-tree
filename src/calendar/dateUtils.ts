export const FAMILY_TIMEZONE = 'Asia/Ho_Chi_Minh'
export const FAMILY_LOCALE = 'vi-VN'

export function parseIsoDate(value?: string): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined
  return date
}

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function todayInFamilyTimezone(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: FAMILY_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return new Date(Number(value.year), Number(value.month) - 1, Number(value.day), 12)
}

export function calculateAge(birthDate?: string, referenceDate = todayInFamilyTimezone()): number | undefined {
  const birth = parseIsoDate(birthDate)
  if (!birth || birth > referenceDate) return undefined
  let age = referenceDate.getFullYear() - birth.getFullYear()
  if (referenceDate.getMonth() < birth.getMonth()
    || (referenceDate.getMonth() === birth.getMonth() && referenceDate.getDate() < birth.getDate())) age -= 1
  return age
}

export function formatFamilyDate(value?: string): string | undefined {
  const date = parseIsoDate(value)
  return date?.toLocaleDateString(FAMILY_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function differenceInCalendarDays(date: Date, from: Date): number {
  const target = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  return Math.round((target - start) / 86_400_000)
}
