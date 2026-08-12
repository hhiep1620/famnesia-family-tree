import { describe, expect, it } from 'vitest'
import { canRetryRevisionDrift } from '../services/revisionConflict'
import type { FamilyData } from '../types/family'

const data = (updatedAt?: string): FamilyData => ({
  schemaVersion: 1,
  updatedAt,
  profiles: [],
  persons: [],
  relationships: [],
  media: [],
  settings: { timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN' },
})

describe('revision-only conflict recovery', () => {
  it('retries only when the remote document content is still the same base version', () => {
    expect(canRetryRevisionDrift(data('2026-08-12T10:00:00Z'), data('2026-08-12T10:00:00Z'))).toBe(true)
    expect(canRetryRevisionDrift(data('2026-08-12T10:00:00Z'), data('2026-08-12T10:00:01Z'))).toBe(false)
    expect(canRetryRevisionDrift(data(), data())).toBe(false)
  })
})
