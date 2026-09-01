import { CURRENT_SCHEMA_VERSION, migrateFamilyData, validateFamilyData } from '../schema/familyDataSchema'
import type { FamilyData } from '../types/family'
import { buildImportPreview, type ImportPreview } from './importPreview'
import { validateImportFileEnvelope } from './security/fileValidation'
import { validateJsonSecurity } from './security/jsonSecurity'

export interface ImportValidationResult {
  data?: FamilyData
  warnings: string[]
  errors: string[]
  preview: ImportPreview
  filename?: string
  format?: 'json' | 'xlsx' | 'gedcom'
}

function previewRawImport(raw: unknown) {
  if (!raw || typeof raw !== 'object') return undefined
  const value = raw as { profiles?: unknown; persons?: unknown; relationships?: unknown; media?: unknown }
  if (!Array.isArray(value.profiles) || !Array.isArray(value.persons) || !Array.isArray(value.relationships)) return undefined
  const people = value.persons.filter((person): person is { isDeceased?: unknown } => Boolean(person) && typeof person === 'object')
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    profiles: value.profiles,
    persons: people,
    relationships: value.relationships,
    media: Array.isArray(value.media) ? value.media : [],
    settings: { timezone: '', locale: '' },
  } as FamilyData
}

export function validateImportText(text: string, filename?: string): ImportValidationResult {
  const securityErrors = validateJsonSecurity(text)
  if (securityErrors.length) return { errors: securityErrors, warnings: [], preview: buildImportPreview(undefined, [], securityErrors), filename, format: 'json' }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Không thể đọc JSON.'
    const errors = [`JSON không hợp lệ: ${detail}`]
    return { errors, warnings: [], preview: buildImportPreview(undefined, [], errors), filename }
  }
  try {
    const validation = validateFamilyData(migrateFamilyData(raw))
    return {
      ...validation,
      filename,
      format: 'json',
      preview: buildImportPreview(validation.data ?? previewRawImport(raw), validation.warnings, validation.errors),
    }
  } catch (error) {
    const errors = [error instanceof Error ? error.message : 'Không thể nâng cấp dữ liệu import.']
    return { errors, warnings: [], preview: buildImportPreview(undefined, [], errors), filename }
  }
}

export async function validateImportFile(file: File): Promise<ImportValidationResult> {
  const envelope = validateImportFileEnvelope(file)
  if (!envelope.format || envelope.errors.length) return { errors: envelope.errors, warnings: [], preview: buildImportPreview(undefined, [], envelope.errors), filename: file.name, format: envelope.format }
  if (envelope.format === 'xlsx') return (await import('./excelFamilyData')).validateExcelImportFile(file)
  if (file.name.toLowerCase().endsWith('.ged')) {
    const { parseGedcomText } = await import('./gedcom.js')
    const result = parseGedcomText(await file.text(), file.name)
    const errors = result.diagnostics.filter((item) => item.severity === 'error').map((item) => `${item.code}${item.line ? ` (dòng ${item.line})` : ''}: ${item.message}`)
    const warnings = result.diagnostics.filter((item) => item.severity === 'warning').map((item) => `${item.code}: ${item.message}`)
    return { data: result.data, errors, warnings, filename: file.name, format: 'gedcom', preview: buildImportPreview(result.data, warnings, errors) }
  }
  return validateImportText(await file.text(), file.name)
}
