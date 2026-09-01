import type { Person } from '../types/family.js'

export type PartialDatePrecision = 'year' | 'month' | 'day'
export interface PartialDate { year: number; month?: number; day?: number; precision: PartialDatePrecision }

export function parsePartialDate(value: string | null | undefined): PartialDate | null {
  if (!value) return null
  const text = value.trim()
  if (/^\d{4}$/u.test(text)) { const year = Number(text); return year >= 1 && year <= 9999 ? { year, precision: 'year' } : null }
  if (/^\d{4}-\d{2}$/u.test(text)) { const year = Number(text.slice(0, 4)); const month = Number(text.slice(5)); return year >= 1 && year <= 9999 && month >= 1 && month <= 12 ? { year, month, precision: 'month' } : null }
  if (/^\d{4}-\d{2}-\d{2}$/u.test(text)) {
    const year = Number(text.slice(0, 4)); const month = Number(text.slice(5, 7)); const day = Number(text.slice(8))
    const parsed = new Date(Date.UTC(year, month - 1, day))
    return year >= 1 && year <= 9999 && parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
      ? { year, month, day, precision: 'day' } : null
  }
  return null
}

export function formatPartialDate(value: PartialDate | null | undefined): string {
  if (!value) return ''
  if (value.precision === 'year') return String(value.year)
  if (value.precision === 'month') return `${value.month!.toString().padStart(2, '0')}/${value.year}`
  return `${value.day!.toString().padStart(2, '0')}/${value.month!.toString().padStart(2, '0')}/${value.year}`
}

export function toLegacyDate(value: PartialDate | null | undefined): string | null {
  if (!value) return null
  if (value.precision !== 'day') return null
  return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`
}

export function hasBirthdayPrecision(value: PartialDate | null | undefined): boolean { return value?.precision === 'day' }

export function personBirthDate(person: Pick<Person, 'birthDate' | 'birthDateParts'>): PartialDate | null {
  return person.birthDateParts ?? parsePartialDate(person.birthDate)
}

export function serializePartialDate(value: PartialDate | null | undefined): string {
  if (!value) return ''
  if (value.precision === 'year') return String(value.year).padStart(4, '0')
  if (value.precision === 'month') return `${String(value.year).padStart(4, '0')}-${String(value.month).padStart(2, '0')}`
  return `${String(value.year).padStart(4, '0')}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`
}

export function ageFromPartialDate(value: PartialDate | null | undefined, referenceDate: Date): number | undefined {
  if (!value || value.precision !== 'day') return undefined
  let age = referenceDate.getFullYear() - value.year
  if (referenceDate.getMonth() + 1 < value.month!
    || (referenceDate.getMonth() + 1 === value.month && referenceDate.getDate() < value.day!)) age -= 1
  return age >= 0 ? age : undefined
}
