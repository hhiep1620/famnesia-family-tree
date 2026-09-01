export type PartialDatePrecision = 'year' | 'month' | 'day'
export interface PartialDate { year: number; month?: number; day?: number; precision: PartialDatePrecision }

export function parsePartialDate(value: string | null | undefined): PartialDate | null {
  if (!value) return null
  const text = value.trim()
  if (/^\d{4}$/u.test(text)) return { year: Number(text), precision: 'year' }
  if (/^\d{4}-\d{2}$/u.test(text)) return { year: Number(text.slice(0, 4)), month: Number(text.slice(5)), precision: 'month' }
  if (/^\d{4}-\d{2}-\d{2}$/u.test(text)) return { year: Number(text.slice(0, 4)), month: Number(text.slice(5, 7)), day: Number(text.slice(8)), precision: 'day' }
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
  if (value.precision === 'year') return `${value.year}-01-01`
  if (value.precision === 'month') return `${value.year}-${String(value.month).padStart(2, '0')}-01`
  return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`
}

export function hasBirthdayPrecision(value: PartialDate | null | undefined): boolean { return value?.precision === 'day' }
