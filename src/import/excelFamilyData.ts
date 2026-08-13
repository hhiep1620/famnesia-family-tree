import * as XLSX from '@e965/xlsx'
import { CURRENT_SCHEMA_VERSION, validateFamilyData } from '../schema/familyDataSchema'
import type { FactConfidence, FamilyData, FamilyProfile, Gender, Person, PersonMedia, Relationship, SpouseStatus } from '../types/family'
import { buildImportPreview } from './importPreview'
import type { ImportValidationResult } from './validateImport'
import { plainText, safeSpreadsheetText } from './security/contentSanitization'
import { inspectXlsxContainer } from './security/excelSecurity'
import { IMPORT_LIMITS } from './security/importLimits'

const COLUMNS = {
  profiles: ['id', 'name', 'lineage_surname', 'description', 'photo_file_id', 'subject_person_id', 'requires_secret', 'is_active'],
  persons: ['id', 'profile_id', 'name', 'nickname', 'gender', 'birth_date', 'birth_date_confidence', 'is_deceased', 'death_date', 'death_date_confidence', 'death_lunar_day', 'death_lunar_month', 'death_lunar_leap_month', 'phone_1', 'phone_2', 'address', 'note', 'ancestral_role', 'sort_order'],
  relationships: ['id', 'profile_id', 'person_1_id', 'person_2_id', 'type', 'status', 'confidence', 'start_date', 'end_date', 'sort_order'],
  media: ['id', 'profile_id', 'person_id', 'drive_file_id', 'type', 'is_primary', 'caption', 'taken_date', 'sort_order'],
} as const

function bool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  const normalized = plainText(value).toLocaleLowerCase('vi')
  if (['true', 'yes', 'y', '1', 'có', 'co'].includes(normalized)) return true
  if (['false', 'no', 'n', '0', 'không', 'khong'].includes(normalized)) return false
  return fallback
}

function number(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function date(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  }
  const text = plainText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : text
}

function gender(value: unknown): Gender {
  const normalized = plainText(value).toLocaleLowerCase('vi')
  if (['male', 'm', 'nam'].includes(normalized)) return 'male'
  if (['female', 'f', 'nữ', 'nu'].includes(normalized)) return 'female'
  if (['other', 'khác', 'khac'].includes(normalized)) return 'other'
  return 'unknown'
}

function relationshipType(value: unknown): 'parent' | 'spouse' {
  const normalized = plainText(value).toLocaleLowerCase('vi')
  return ['spouse', 'vợ chồng', 'vo chong', 'bạn đời', 'ban doi'].includes(normalized) ? 'spouse' : 'parent'
}

function confidence(value: unknown): FactConfidence | undefined {
  const normalized = plainText(value).toLocaleLowerCase('vi')
  return ['confirmed', 'likely', 'estimated', 'unknown'].includes(normalized) ? normalized as FactConfidence : undefined
}

function rows(workbook: XLSX.WorkBook, sheetName: keyof typeof COLUMNS): Record<string, unknown>[] {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return []
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true })
}

function normalizeWorkbook(workbook: XLSX.WorkBook): FamilyData {
  const profiles: FamilyProfile[] = rows(workbook, 'profiles').map((row) => ({
    id: plainText(row.id), name: plainText(row.name), lineageSurname: plainText(row.lineage_surname), description: plainText(row.description),
    photoFileId: plainText(row.photo_file_id) || null, subjectPersonId: plainText(row.subject_person_id) || null,
    requiresSecret: bool(row.requires_secret), isActive: bool(row.is_active, true),
  }))
  const persons: Person[] = rows(workbook, 'persons').map((row) => {
    const lunarDay = number(row.death_lunar_day); const lunarMonth = number(row.death_lunar_month)
    return {
      id: plainText(row.id), profileId: plainText(row.profile_id), name: plainText(row.name), nickname: plainText(row.nickname) || null,
      gender: gender(row.gender), birthDate: date(row.birth_date), isDeceased: bool(row.is_deceased), deathDate: date(row.death_date),
      deathLunar: lunarDay && lunarMonth ? { day: lunarDay, month: lunarMonth, leapMonth: bool(row.death_lunar_leap_month) } : null,
      phone1: plainText(row.phone_1), phone2: plainText(row.phone_2), address: plainText(row.address), note: plainText(row.note),
      ancestralRole: plainText(row.ancestral_role) === 'founding_ancestor' ? 'founding_ancestor' : 'none', sortOrder: number(row.sort_order),
      confidence: { birthDate: confidence(row.birth_date_confidence), deathDate: confidence(row.death_date_confidence) },
    }
  })
  const relationships: Relationship[] = rows(workbook, 'relationships').map((row) => {
    const type = relationshipType(row.type)
    return {
      id: plainText(row.id), profileId: plainText(row.profile_id), person1Id: plainText(row.person_1_id), person2Id: plainText(row.person_2_id), type,
      status: type === 'spouse' ? (plainText(row.status) || 'unknown') as SpouseStatus : undefined,
      confidence: confidence(row.confidence), startDate: date(row.start_date), endDate: date(row.end_date), sortOrder: number(row.sort_order),
    }
  })
  const media: PersonMedia[] = rows(workbook, 'media').map((row) => ({
    id: plainText(row.id), profileId: plainText(row.profile_id), personId: plainText(row.person_id), driveFileId: plainText(row.drive_file_id),
    type: 'photo', isPrimary: bool(row.is_primary), caption: plainText(row.caption), takenDate: date(row.taken_date), sortOrder: number(row.sort_order),
  }))
  return { schemaVersion: CURRENT_SCHEMA_VERSION, profiles, persons, relationships, media, settings: { timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN' } }
}

function workbookSafetyErrors(workbook: XLSX.WorkBook): string[] {
  const errors: string[] = []
  if (workbook.SheetNames.length > IMPORT_LIMITS.worksheets) errors.push('Workbook has too many worksheets.')
  if (!['profiles', 'persons', 'relationships'].every((name) => workbook.SheetNames.includes(name))) errors.push('Workbook must include profiles, persons and relationships sheets.')
  let cellCount = 0
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : undefined
    if (range && (range.e.r + 1 > IMPORT_LIMITS.rowsPerSheet || range.e.c + 1 > IMPORT_LIMITS.columnsPerSheet)) errors.push(`Worksheet '${name}' exceeds safe row or column limits.`)
    for (const address of Object.keys(sheet)) {
      if (address.startsWith('!')) continue
      cellCount += 1
      const cell = sheet[address] as XLSX.CellObject & { l?: { Target?: string } }
      if (cell.f) errors.push(`Formula cells are not supported (${name}!${address}).`)
      if (cell.l?.Target && !cell.l.Target.startsWith('#')) errors.push(`External links are not supported (${name}!${address}).`)
    }
  }
  if (cellCount > IMPORT_LIMITS.cells) errors.push('Workbook has too many cells to process safely.')
  return [...new Set(errors)]
}

export async function validateExcelImportFile(file: File): Promise<ImportValidationResult> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const container = inspectXlsxContainer(bytes)
  if (container.errors.length) return { errors: container.errors, warnings: [], preview: buildImportPreview(undefined, [], container.errors), filename: file.name, format: 'xlsx' }
  try {
    const workbook = XLSX.read(bytes, { type: 'array', cellDates: true, cellFormula: true, cellHTML: false, bookVBA: true, bookDeps: false, WTF: true, sheetRows: IMPORT_LIMITS.rowsPerSheet })
    const securityErrors = workbookSafetyErrors(workbook)
    if (securityErrors.length) return { errors: securityErrors, warnings: [], preview: buildImportPreview(undefined, [], securityErrors), filename: file.name, format: 'xlsx' }
    const data = normalizeWorkbook(workbook)
    const countErrors: string[] = []
    if (data.persons.length > IMPORT_LIMITS.persons) countErrors.push('Import contains too many people.')
    if (data.relationships.length > IMPORT_LIMITS.relationships) countErrors.push('Import contains too many relationships.')
    if (data.media.length > IMPORT_LIMITS.media) countErrors.push('Import contains too many media references.')
    const validation = countErrors.length ? { errors: countErrors, warnings: [] } : validateFamilyData(data)
    return { ...validation, filename: file.name, format: 'xlsx', preview: buildImportPreview(validation.data ?? data, validation.warnings, validation.errors) }
  } catch {
    const errors = ['Potentially unsafe workbook content detected. Import has been blocked.']
    return { errors, warnings: [], preview: buildImportPreview(undefined, [], errors), filename: file.name, format: 'xlsx' }
  }
}

function row(values: unknown[]): unknown[] { return values.map((value) => typeof value === 'string' ? safeSpreadsheetText(value) : value ?? '') }
function addSheet(workbook: XLSX.WorkBook, name: string, header: readonly string[], values: unknown[][]): void {
  const sheet = XLSX.utils.aoa_to_sheet([row([...header]), ...values.map(row)])
  sheet['!cols'] = header.map((field) => ({ wch: Math.max(14, Math.min(28, field.length + 4)) }))
  XLSX.utils.book_append_sheet(workbook, sheet, name)
}

export function createFamilyWorkbook(data: FamilyData): Uint8Array {
  const workbook = XLSX.utils.book_new()
  const readme = [
    ['FAMNESIA EXCEL DATA TEMPLATE'],
    ['Chỉ dùng giá trị thuần. Không dùng macro, công thức, external link hoặc đối tượng nhúng.'],
    ['Ngày dùng định dạng YYYY-MM-DD. Gender: male/female/other/unknown. Relationship: parent/spouse.'],
    ['Ảnh không được nhúng; sheet media chỉ lưu Google Drive file ID. Các cột tính toán như tuổi, đời và vai vế không được lưu.'],
    ['Import thay thế toàn bộ dữ liệu và luôn tạo backup trước khi ghi.'],
  ]
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(readme), 'README')
  addSheet(workbook, 'profiles', COLUMNS.profiles, data.profiles.map((item) => [item.id, item.name, item.lineageSurname, item.description, item.photoFileId, item.subjectPersonId, item.requiresSecret, item.isActive]))
  addSheet(workbook, 'persons', COLUMNS.persons, data.persons.map((item) => [item.id, item.profileId, item.name, item.nickname, item.gender, item.birthDate, item.confidence?.birthDate, item.isDeceased, item.deathDate, item.confidence?.deathDate, item.deathLunar?.day, item.deathLunar?.month, item.deathLunar?.leapMonth, item.phone1, item.phone2, item.address, item.note, item.ancestralRole, item.sortOrder]))
  addSheet(workbook, 'relationships', COLUMNS.relationships, data.relationships.map((item) => [item.id, item.profileId, item.person1Id, item.person2Id, item.type, item.status, item.confidence, item.startDate, item.endDate, item.sortOrder]))
  addSheet(workbook, 'media', COLUMNS.media, data.media.map((item) => [item.id, item.profileId, item.personId, item.driveFileId, item.type, item.isPrimary, item.caption, item.takenDate, item.sortOrder]))
  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: true }) as ArrayBuffer | Uint8Array
  return output instanceof Uint8Array ? output : new Uint8Array(output)
}

export function downloadFamilyWorkbook(data: FamilyData, filename = `famnesia-${new Date().toISOString().slice(0, 10)}.xlsx`): void {
  const bytes = createFamilyWorkbook(data); const copy = new Uint8Array(bytes.byteLength); copy.set(bytes)
  const url = URL.createObjectURL(new Blob([copy.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url)
}
