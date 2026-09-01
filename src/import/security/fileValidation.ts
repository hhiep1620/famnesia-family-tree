import { IMPORT_LIMITS } from './importLimits'

export type ImportFormat = 'json' | 'xlsx' | 'gedcom'

export function detectImportFormat(file: File): ImportFormat | undefined {
  const name = file.name.toLocaleLowerCase('en')
  if (name.endsWith('.json')) return 'json'
  if (name.endsWith('.xlsx')) return 'xlsx'
  if (name.endsWith('.ged')) return 'gedcom'
  return undefined
}
export function validateImportFileEnvelope(file: File): { format?: ImportFormat; errors: string[] } {
  const format = detectImportFormat(file)
  if (!format) {
    const macro = /\.(xlsm|xlsb|xlam|xltm)$/i.test(file.name)
    return { errors: [macro ? 'Macro-enabled Excel files are not supported.' : 'Unsupported file type.'] }
  }
  const limit = format === 'json' || format === 'gedcom' ? IMPORT_LIMITS.jsonBytes : IMPORT_LIMITS.excelBytes
  if (file.size > limit) return { format, errors: ['Import file exceeds allowed size.'] }
  const allowedMime = format === 'json' || format === 'gedcom'
    ? ['', 'application/json', 'text/json', 'text/plain']
    : ['', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'application/octet-stream']
  if (!allowedMime.includes(file.type)) return { format, errors: ['File content type does not match its supported extension.'] }
  return { format, errors: [] }
}
