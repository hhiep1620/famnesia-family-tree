import { describe, expect, it } from 'vitest'
import { formatPartialDate, hasBirthdayPrecision, parsePartialDate, toLegacyDate } from '../src/calendar/partialDate'

describe('CR-15 partial birth dates', () => {
  it('keeps year-only precision without treating 01-01 as a birthday', () => {
    const value = parsePartialDate('1990')!
    expect(value).toEqual({ year: 1990, precision: 'year' })
    expect(formatPartialDate(value)).toBe('1990')
    expect(toLegacyDate(value)).toBe('1990-01-01')
    expect(hasBirthdayPrecision(value)).toBe(false)
  })
  it('round-trips month and day precision', () => {
    expect(formatPartialDate(parsePartialDate('1990-05'))).toBe('05/1990')
    expect(formatPartialDate(parsePartialDate('1990-05-10'))).toBe('10/05/1990')
    expect(hasBirthdayPrecision(parsePartialDate('1990-05-10'))).toBe(true)
  })
})
