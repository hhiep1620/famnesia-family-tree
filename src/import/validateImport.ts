import { CURRENT_SCHEMA_VERSION, migrateFamilyData, validateFamilyData } from '../schema/familyDataSchema'
import type { FamilyData } from '../types/family'
import { buildImportPreview, type ImportPreview } from './importPreview'

export interface ImportValidationResult {
  data?: FamilyData
  warnings: string[]
  errors: string[]
  preview: ImportPreview
  filename?: string
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
      preview: buildImportPreview(validation.data ?? previewRawImport(raw), validation.warnings, validation.errors),
    }
  } catch (error) {
    const errors = [error instanceof Error ? error.message : 'Không thể nâng cấp dữ liệu import.']
    return { errors, warnings: [], preview: buildImportPreview(undefined, [], errors), filename }
  }
}

export async function validateImportFile(file: File): Promise<ImportValidationResult> {
  return validateImportText(await file.text(), file.name)
}
