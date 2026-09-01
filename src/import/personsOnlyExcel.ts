import * as XLSX from '@e965/xlsx'
import { plainText } from './security/contentSanitization'
import type { Person } from '../types/family'

export const PERSONS_ONLY_SHEETS = ['Hướng dẫn', 'Danh sách người'] as const
export const PERSONS_ONLY_HEADERS = ['Mã người', 'Họ và tên', 'Biệt danh', 'Giới tính', 'Năm sinh', 'Ngày sinh', 'Đã mất', 'Ngày mất dương lịch', 'Ngày giỗ âm lịch', 'Tháng nhuận ngày giỗ', 'Cha (mã hoặc tên)', 'Mẹ (mã hoặc tên)', 'Vợ/Chồng (mã hoặc tên)', 'Số điện thoại', 'Địa chỉ', 'Ghi chú', 'Vai trò tổ tiên', 'Thứ tự anh/chị/em'] as const
export interface StagedPersonRow { row: number; values: Record<string, string>; status: 'ready' | 'needs_confirmation' | 'error'; messages: string[] }
const aliases: Record<string, string> = { 'ho va ten': 'Họ và tên', 'họ tên': 'Họ và tên', name: 'Họ và tên', 'ma nguoi': 'Mã người', id: 'Mã người', gender: 'Giới tính', 'nam sinh': 'Năm sinh', 'ngay sinh': 'Ngày sinh', 'cha': 'Cha (mã hoặc tên)', 'me': 'Mẹ (mã hoặc tên)', 'vo chong': 'Vợ/Chồng (mã hoặc tên)' }
function key(value: unknown): string { return plainText(value).normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLocaleLowerCase('vi').replace(/\s+/gu, ' ').trim() }
function validDate(value: string): boolean { return !value || /^\d{4}$|^\d{2}\/\d{2}\/\d{4}$/u.test(value) }
export function normalizePersonsOnlyWorkbook(bytes: Uint8Array): StagedPersonRow[] {
  const workbook = XLSX.read(bytes, { type: 'array', cellDates: false, cellFormula: false, cellHTML: false, WTF: true })
  const sheet = workbook.Sheets['Danh sách người']
  if (!sheet || workbook.SheetNames.some((name) => !PERSONS_ONLY_SHEETS.includes(name as typeof PERSONS_ONLY_SHEETS[number]))) throw new Error('PERSONS_ONLY_SHEET_CONTRACT_INVALID')
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
  return rows.map((raw, index) => {
    const values: Record<string, string> = {}; const messages: string[] = []
    for (const [rawHeader, rawValue] of Object.entries(raw)) { const header = PERSONS_ONLY_HEADERS.includes(rawHeader as typeof PERSONS_ONLY_HEADERS[number]) ? rawHeader : aliases[key(rawHeader)]; if (header) values[header] = plainText(rawValue); else messages.push(`Cột không được hỗ trợ: ${rawHeader}`) }
    if (!values['Họ và tên']?.trim()) messages.push('Thiếu Họ và tên')
    if (!validDate(values['Ngày sinh'] ?? '') || (values['Năm sinh'] && !/^\d{4}$/u.test(values['Năm sinh']))) messages.push('Ngày/năm sinh không hợp lệ')
    return { row: index + 2, values, status: messages.some((message) => message.startsWith('Cột') || message.startsWith('Thiếu') || message.startsWith('Ngày')) ? 'error' : values['Cha (mã hoặc tên)'] || values['Mẹ (mã hoặc tên)'] ? 'needs_confirmation' : 'ready', messages }
  })
}

export function resolvePersonReference(reference: string, rows: StagedPersonRow[], existing: Person[]): { personId?: string; candidates: string[] } {
  const needle = key(reference); if (!needle) return { candidates: [] }
  const byId = rows.find((row) => key(row.values['Mã người']) === needle)?.values['Mã người']; if (byId) return { personId: byId, candidates: [byId] }
  const candidates = [...rows.map((row) => row.values).filter((value) => key(value['Họ và tên']) === needle).map((value) => value['Mã người']).filter(Boolean), ...existing.filter((person) => key(person.name) === needle).map((person) => person.id)]
  return candidates.length === 1 ? { personId: candidates[0], candidates } : { candidates }
}
