import type { FamilyData } from '../types/family.js'

export interface ImportPreview {
  profiles: number
  people: number
  relationships: number
  media: number
  living: number
  deceased: number
  warnings: number
  errors: number
}

export function buildImportPreview(data: FamilyData | undefined, warnings: string[], errors: string[]): ImportPreview {
  return {
    profiles: data?.profiles.length ?? 0,
    people: data?.persons.length ?? 0,
    relationships: data?.relationships.length ?? 0,
    media: data?.media.length ?? 0,
    living: data?.persons.filter((person) => !person.isDeceased).length ?? 0,
    deceased: data?.persons.filter((person) => person.isDeceased).length ?? 0,
    warnings: warnings.length,
    errors: errors.length,
  }
}
