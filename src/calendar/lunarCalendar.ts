import { getLunarDate, getSolarDate } from '@forvn/vn-lunar-calendar'
import { parseIsoDate, toIsoDate } from './dateUtils'

export interface LunarDateValue {
  day: number
  month: number
  year: number
  leapMonth: boolean
}

export function convertSolarToLunar(isoDate: string): LunarDateValue | undefined {
  const date = parseIsoDate(isoDate)
  if (!date) return undefined
  const lunar = getLunarDate(date.getDate(), date.getMonth() + 1, date.getFullYear())
  return { day: lunar.day, month: lunar.month, year: lunar.year, leapMonth: lunar.leap }
}

export function convertLunarToSolar(day: number, month: number, year: number, leapMonth = false): string | undefined {
  if (!Number.isInteger(day) || !Number.isInteger(month) || day < 1 || day > 30 || month < 1 || month > 12) return undefined
  try {
    const solar = getSolarDate(day, month, year, leapMonth)
    const lunarCheck = getLunarDate(solar.day, solar.month, solar.year)
    if (lunarCheck.day !== day || lunarCheck.month !== month || lunarCheck.year !== year || lunarCheck.leap !== leapMonth) return undefined
    return toIsoDate(new Date(solar.year, solar.month - 1, solar.day, 12))
  } catch (error) {
    console.error('Lunar date conversion failed', error)
    return undefined
  }
}

const STEMS = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý']
const BRANCHES = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi']

export function lunarYearName(year: number): string {
  return `${STEMS[(year + 6) % 10]} ${BRANCHES[(year + 8) % 12]}`
}

export function formatLunarDate(isoDate: string, includeYearName = false): string {
  const lunar = convertSolarToLunar(isoDate)
  if (!lunar) return ''
  const value = `${lunar.day}/${lunar.month}${lunar.leapMonth ? ' nhuận' : ''}`
  return includeYearName ? `${value} ${lunarYearName(lunar.year)}` : `${value} ÂL`
}
