import { describe, expect, it } from 'vitest'
import { parseGedcomText, serializeGedcom } from '../src/import/gedcom'
import type { FamilyData } from '../src/types/family'

const fixture = `0 HEAD\n1 GEDC\n2 VERS 7.0\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Nguyễn /An/\n1 SEX M\n1 BIRT\n2 DATE 10 MAY 1950\n1 NOTE ghi chú\n1 OBJE\n2 FILE https://example.test/photo.jpg\n0 @I2@ INDI\n1 NAME Trần /Bình/\n1 SEX F\n0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@\n1 MARR\n2 DATE 2000-01-02\n0 TRLR\n`

describe('GEDCOM portability parser', () => {
  it('parses supported records without network/media and preserves Vietnamese Unicode', () => {
    const result = parseGedcomText(fixture)
    expect(result.version).toBe('7.0')
    expect(result.diagnostics).toEqual([])
    expect(result.ignoredMedia).toEqual({ count: 1, tags: ['OBJE'] })
    expect(result.data?.persons[0]).toMatchObject({ id: 'I1', name: 'Nguyễn /An/', gender: 'male', birthDate: '1950-05-10' })
    expect(result.data?.media).toEqual([])
  })

  it('rejects GDZ, malformed/deep/oversized input before creating data', () => {
    expect(parseGedcomText(fixture, 'family.gdz').diagnostics[0].code).toBe('GDZ_UNSUPPORTED')
    expect(parseGedcomText('0 HEAD\nnot a GEDCOM line\n0 TRLR').data).toBeUndefined()
    expect(parseGedcomText('0 HEAD\n40 X\n0 TRLR').diagnostics.some((item) => item.code === 'DEPTH_LIMIT')).toBe(true)
    expect(parseGedcomText('x'.repeat(10 * 1024 * 1024 + 1)).diagnostics[0].code).toBe('FILE_TOO_LARGE')
  })

  it('round-trips supported people and spouse relationships semantically', () => {
    const parsed = parseGedcomText(fixture).data!
    const reparsed = parseGedcomText(serializeGedcom(parsed)).data!
    expect(reparsed?.persons.map(({ id, name, gender, birthDate }) => ({ id, name, gender, birthDate }))).toEqual(
      parsed.persons.map(({ id, name, gender, birthDate }) => ({ id, name, gender, birthDate })),
    )
    expect(reparsed?.relationships.map(({ type, person1Id, person2Id }) => ({ type, person1Id, person2Id }))).toEqual([
      { type: 'spouse', person1Id: 'I1', person2Id: 'I2' },
    ])
  })

  it('maps export policy to one common redaction model', async () => {
    const module = await import('../src/privacy/portabilityExport')
    const data: FamilyData = { schemaVersion: 3, updatedAt: '2026-01-01T00:00:00.000Z', profiles: [{ id: 'F', name: 'Family', requiresSecret: false, isActive: true, subjectPersonId: 'P1' }],
      persons: [{ id: 'P1', profileId: 'F', name: 'Living', isDeceased: false, phone1: '0900', address: 'secret', note: 'private' }, { id: 'P2', profileId: 'F', name: 'Gone', isDeceased: true, phone1: '0911', address: 'old', note: 'memo' }], relationships: [], media: [{ id: 'M', profileId: 'F', personId: 'P1', fileId: 'opaque', type: 'photo', isPrimary: true }], settings: { timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN' } }
    const result = module.applyPortabilityPolicy(data, { format: 'gedcom', personIds: new Set(['P1', 'P2']), fields: new Set(['contact', 'private_note']), decryptableContactPersonIds: new Set(['P1', 'P2']) })
    expect(result.data.persons.find((person) => person.id === 'P1')).toMatchObject({ phone1: '', address: '', note: '' })
    expect(result.data.persons.find((person) => person.id === 'P2')).toMatchObject({ phone1: '0911', address: 'old', note: 'memo' })
    expect(result.data.media).toEqual([])
    expect(result.report.mediaOmitted).toBe(1)
  })
})
