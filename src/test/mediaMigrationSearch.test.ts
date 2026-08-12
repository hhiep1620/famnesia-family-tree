import { describe, expect, it } from 'vitest'
import { createFamilyDataTemplate } from '../import/exportFamilyData'
import { PersonSearchIndex } from '../search/personSearchIndex'
import { requireValidFamilyData, validateFamilyData } from '../schema/familyDataSchema'
import type { Person } from '../types/family'

describe('schema v2 contact and media migration', () => {
  it('moves a legacy photo into media without losing the Drive ID', () => {
    const migrated = requireValidFamilyData({
      schemaVersion: 1,
      profiles: [{ id: 'F0001', name: 'Gia đình', subjectPersonId: 'P0001', requiresSecret: false, isActive: true }],
      persons: [{ id: 'P0001', profileId: 'F0001', name: 'Nguyễn Văn A', photoFileId: 'drive_file-1' }],
      relationships: [],
      settings: { timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN' },
    })
    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.persons[0]).toMatchObject({ phone1: '', phone2: '', address: '', note: '' })
    expect(migrated.persons[0]).not.toHaveProperty('photoFileId')
    expect(migrated.media[0]).toMatchObject({ personId: 'P0001', driveFileId: 'drive_file-1', isPrimary: true })
  })

  it('rejects more than one primary photo for the same person', () => {
    const data = createFamilyDataTemplate()
    data.media = [
      { id: 'M0001', profileId: 'F0001', personId: 'P0001', driveFileId: 'file_one', type: 'photo', isPrimary: true },
      { id: 'M0002', profileId: 'F0001', personId: 'P0001', driveFileId: 'file_two', type: 'photo', isPrimary: true },
    ]
    expect(validateFamilyData(data).errors.some((message) => message.includes('nhiều hơn một ảnh đại diện'))).toBe(true)
  })
})

describe('detailed Vietnamese search', () => {
  const persons: Person[] = [
    { id: 'P1', name: 'Hoàng Trung Hiếu', nickname: 'Hiệp', phone1: '+84 912 345 678', address: 'Thanh Xuân, Hà Nội', note: 'Làm nghề giáo viên' },
    { id: 'P2', name: 'Nguyễn Văn Hùng', nickname: 'Hiếu', phone1: '0988000111', address: 'Đà Nẵng', note: '' },
  ]
  const index = new PersonSearchIndex(persons)

  it('matches Vietnamese names without accents and ranks names above note metadata', () => {
    expect(index.search('Hoang Trung Hieu')[0].person.id).toBe('P1')
    expect(index.search('Hieu').map((result) => result.person.id)).toEqual(['P2', 'P1'])
  })

  it('matches common +84 and local phone representations plus metadata', () => {
    expect(index.search('0912 345 678')[0].person.id).toBe('P1')
    expect(index.search('Thanh Xuan')[0].matchField).toBe('address')
    expect(index.search('giao vien')[0].matchField).toBe('note')
  })
})
