import { describe, expect, it } from 'vitest'
import { calculateFamilyAnalytics } from '../src/analytics/familyAnalytics'
import { mergeAuthorizedContactFields } from '../src/privacy/contactPresentation'
import { PersonSearchIndex } from '../src/search/personSearchIndex'
import type { FamilyData, Person } from '../src/types/family'

const protectedPerson: Person = { id: 'P1', name: 'Nguyễn An', phone1: '0900000000', phone2: '0911111111',
  address: 'Địa chỉ bí mật, Hà Nội', note: 'Ghi chú bí mật' }

describe('CR-07 contact presentation boundary', () => {
  it('removes restricted contact before search, analytics, cards or accessibility consumers receive a Person', () => {
    const [redacted] = mergeAuthorizedContactFields([protectedPerson], new Map())
    expect(JSON.stringify(redacted)).not.toMatch(/0900000000|0911111111|Địa chỉ bí mật|Ghi chú bí mật/u)
    const index = new PersonSearchIndex([redacted])
    expect(index.search('0900000000')).toEqual([])
    expect(index.search('Dia chi bi mat')).toEqual([])
    const data: FamilyData = { schemaVersion: 3, profiles: [], persons: [redacted], relationships: [], media: [],
      settings: { timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN' } }
    expect(calculateFamilyAnalytics(data, undefined).locations).toEqual([{ label: 'Không rõ', count: 1 }])
  })

  it('merges only fields whose keys were successfully unwrapped for the current recipient', () => {
    const [authorized] = mergeAuthorizedContactFields([protectedPerson], new Map([['P1', { phone: ['0988000000'], address: 'Đà Nẵng' }]]))
    expect(authorized).toMatchObject({ phone1: '0988000000', phone2: '', address: 'Đà Nẵng', note: '' })
    expect(new PersonSearchIndex([authorized]).search('0988000000')[0].person.id).toBe('P1')
  })
})
