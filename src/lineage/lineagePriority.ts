import type { FamilyScope } from '../types/family'

export const LINEAGE_PRIORITY: FamilyScope[] = ['self', 'paternal', 'maternal', 'descendant', 'spouse', 'affinal', 'unclassified']

export function getLineagePriority(scope: FamilyScope): number {
  return LINEAGE_PRIORITY.indexOf(scope)
}
