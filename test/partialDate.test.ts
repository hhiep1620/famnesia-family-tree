import { describe, expect, it } from 'vitest'
import { formatPartialDate, hasBirthdayPrecision, parsePartialDate, toLegacyDate } from '../src/calendar/partialDate'
import { getBirthdayEvents } from '../src/calendar/birthdayEvents'

describe('CR-15 partial birth dates', () => {
  it('keeps year-only precision without treating 01-01 as a birthday', () => {
    const value = parsePartialDate('1990')!
    expect(value).toEqual({ year: 1990, precision: 'year' })
    expect(formatPartialDate(value)).toBe('1990')
    expect(toLegacyDate(value)).toBeNull()
    expect(hasBirthdayPrecision(value)).toBe(false)
    expect(getBirthdayEvents([{ id: 'P1', name: 'No fake birthday', birthDateParts: value }], 2026)).toEqual([])
  })
  it('round-trips month and day precision', () => {
    expect(formatPartialDate(parsePartialDate('1990-05'))).toBe('05/1990')
    expect(formatPartialDate(parsePartialDate('1990-05-10'))).toBe('10/05/1990')
    expect(hasBirthdayPrecision(parsePartialDate('1990-05-10'))).toBe(true)
    expect(parsePartialDate('1990-13')).toBeNull()
    expect(parsePartialDate('1990-02-30')).toBeNull()
  })
})
