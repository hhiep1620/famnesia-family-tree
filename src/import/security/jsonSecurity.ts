import { findDangerousObjectKey } from './contentSanitization'
import { IMPORT_LIMITS } from './importLimits'

export function validateJsonSecurity(text: string): string[] {
  const errors: string[] = []
  if (new TextEncoder().encode(text).byteLength > IMPORT_LIMITS.jsonBytes) errors.push('Import file exceeds allowed size.')
  if (text.includes('\0')) errors.push('Invalid JSON structure.')
  if (errors.length) return errors
  try {
    const value: unknown = JSON.parse(text)
    const dangerousPath = findDangerousObjectKey(value)
    if (dangerousPath) errors.push(`Import has been blocked: unsafe object key at ${dangerousPath}.`)
  } catch {
    // The schema parser returns the user-facing malformed JSON detail.
  }
  return errors
}
