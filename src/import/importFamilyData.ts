import type { FamilyData } from '../types/family'
import { validateImportText, type ImportValidationResult } from './validateImport'

export interface PreparedFamilyImport extends ImportValidationResult {
  mode: 'replace'
}

export function prepareFamilyImport(text: string, filename?: string): PreparedFamilyImport {
  return { ...validateImportText(text, filename), mode: 'replace' }
}

export function requireImportableData(result: ImportValidationResult): FamilyData {
  if (!result.data || result.errors.length) throw new Error(result.errors.join('\n') || 'Tệp chưa sẵn sàng để import.')
  return result.data
}
