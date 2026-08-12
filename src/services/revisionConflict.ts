import type { FamilyData } from '../types/family'

export function canRetryRevisionDrift(attempted: FamilyData, latest: FamilyData): boolean {
  return Boolean(attempted.updatedAt && latest.updatedAt && attempted.updatedAt === latest.updatedAt)
}
