import * as XLSX from '@e965/xlsx'
import { describe, expect, it } from 'vitest'
import { createFamilyWorkbook, validateExcelImportFile } from '../import/excelFamilyData'
import { createFamilyDataTemplate, serializeFamilyData } from '../import/exportFamilyData'
import { validateImportFileEnvelope } from '../import/security/fileValidation'
import { inspectXlsxContainer } from '../import/security/excelSecurity'
import { IMPORT_LIMITS } from '../import/security/importLimits'
import { validateImportText } from '../import/validateImport'
import { detectDuplicateCandidates } from '../integrity/duplicateDetection'
import { analyzeFamilyIntegrity } from '../integrity/integrityEngine'
import { mergePeople } from '../integrity/mergePerson'

function xlsxFile(bytes: Uint8Array, name = 'family.xlsx'): File {
  const copy = new Uint8Array(bytes.byteLength); copy.set(bytes)
  return new File([copy.buffer], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

describe('secure import pipeline', () => {
  it('accepts valid JSON and preserves script-like strings as plain data', () => {
    const data = createFamilyDataTemplate(); data.persons[0].note = '<script>alert(1)</script>'
    const result = validateImportText(serializeFamilyData(data), 'family.json')
    expect(result.errors).toEqual([])
    expect(result.data?.persons[0].note).toBe('<script>alert(1)</script>')
  })

  it('blocks malformed, oversized and prototype-polluting JSON', () => {
    expect(validateImportText('{nope', 'broken.json').errors[0]).toContain('JSON không hợp lệ')
    expect(validateImportText(`{"schemaVersion":3,"__proto__":{"polluted":true}}`, 'unsafe.json').errors[0]).toContain('unsafe object key')
    const oversized = new File([new Uint8Array(IMPORT_LIMITS.jsonBytes + 1)], 'large.json', { type: 'application/json' })
    expect(validateImportFileEnvelope(oversized).errors).toContain('Import file exceeds allowed size.')
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
  })

  it('rejects unsupported, renamed and macro-enabled files before parsing', async () => {
    expect(validateImportFileEnvelope(new File(['x'], 'family.xlsm')).errors).toContain('Macro-enabled Excel files are not supported.')
    const renamed = new File(['MZ executable'], 'family.xlsx', { type: 'application/octet-stream' })
    expect((await validateExcelImportFile(renamed)).errors[0]).toContain('not a valid XLSX')
  })

  it('round-trips a safe XLSX workbook through the shared FamilyData schema', async () => {
    const original = createFamilyDataTemplate()
    const result = await validateExcelImportFile(xlsxFile(createFamilyWorkbook(original)))
    expect(result.errors).toEqual([])
    expect(result.preview).toMatchObject({ profiles: 1, people: 3, relationships: 3, media: 0 })
    expect(result.data?.profiles[0].lineageSurname).toBe(original.profiles[0].lineageSurname)
    expect(result.data?.persons.map((person) => person.name)).toEqual(original.persons.map((person) => person.name))
  })

  it('blocks formula cells and external hyperlinks', async () => {
    const formulaWorkbook = XLSX.read(createFamilyWorkbook(createFamilyDataTemplate()), { type: 'array' })
    formulaWorkbook.Sheets.persons.C2 = { t: 'n', f: '1+1', v: 2 }
    const formulaBytes = XLSX.write(formulaWorkbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const formulaResult = await validateExcelImportFile(xlsxFile(new Uint8Array(formulaBytes)))
    expect(formulaResult.errors.some((error) => error.includes('Formula cells'))).toBe(true)

    const linkWorkbook = XLSX.read(createFamilyWorkbook(createFamilyDataTemplate()), { type: 'array' })
    linkWorkbook.Sheets.persons.O2 = { t: 's', v: 'remote', l: { Target: 'https://example.com/data' } }
    const linkBytes = XLSX.write(linkWorkbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const linkResult = await validateExcelImportFile(xlsxFile(new Uint8Array(linkBytes)))
    expect(linkResult.errors.some((error) => error.toLocaleLowerCase('en').includes('external link'))).toBe(true)
  })

  it('escapes formula-injection text on export', () => {
    const data = createFamilyDataTemplate(); data.persons[0].name = '=HYPERLINK("https://bad.example")'
    const workbook = XLSX.read(createFamilyWorkbook(data), { type: 'array' })
    expect(workbook.Sheets.persons.C2.v).toBe("'=HYPERLINK(\"https://bad.example\")")
    expect(workbook.Sheets.persons.C2.f).toBeUndefined()
  })

  it('rejects ZIP bomb-like declared expansion before workbook parsing', () => {
    const bytes = createFamilyWorkbook(createFamilyDataTemplate())
    const copy = new Uint8Array(bytes.byteLength); copy.set(bytes)
    const view = new DataView(copy.buffer)
    for (let offset = 0; offset < copy.length - 46; offset += 1) {
      if (view.getUint32(offset, true) === 0x02014b50) { view.setUint32(offset + 24, IMPORT_LIMITS.decompressedBytes + 1, true); break }
    }
    expect(inspectXlsxContainer(copy).errors).toContain('Workbook is too complex to process safely.')
  })

  it('rejects invalid IDs and ancestry cycles without mutating current data', () => {
    const current = createFamilyDataTemplate(); const snapshot = structuredClone(current)
    const candidate = structuredClone(current)
    candidate.relationships.push({ id: 'R9998', profileId: 'F0001', person1Id: 'missing', person2Id: 'P0001', type: 'parent' })
    candidate.relationships.push({ id: 'R9999', profileId: 'F0001', person1Id: 'P0003', person2Id: 'P0001', type: 'parent' })
    const result = validateImportText(JSON.stringify(candidate), 'invalid.json')
    expect(result.errors.some((error) => error.includes("missing"))).toBe(true)
    expect(result.errors.some((error) => error.includes('vòng lặp tổ tiên'))).toBe(true)
    expect(current).toEqual(snapshot)
  })
})

describe('data integrity and safe merge', () => {
  it('scores explainable duplicates and supports suppression markers', () => {
    const data = createFamilyDataTemplate()
    data.persons.push({ ...data.persons[0], id: 'P0099', phone1: '0988000000' })
    const candidates = detectDuplicateCandidates(data)
    expect(candidates[0]).toMatchObject({ personA: { id: 'P0001' }, personB: { id: 'P0099' } })
    expect(candidates[0].score).toBeGreaterThanOrEqual(0.65)
    data.settings.duplicateSuppressions = [candidates[0].id]
    expect(detectDuplicateCandidates(data)).toEqual([])
  })

  it('merges people, media and duplicate relationships into a valid graph', () => {
    const data = createFamilyDataTemplate()
    data.persons.push({ ...data.persons[0], id: 'P0099', phone1: '', phone2: '0999' })
    data.relationships.push({ id: 'R0099', profileId: 'F0001', person1Id: 'P0099', person2Id: 'P0003', type: 'parent' })
    data.media.push({ id: 'M0099', profileId: 'F0001', personId: 'P0099', driveFileId: 'safe_photo_id', type: 'photo', isPrimary: true })
    const merged = mergePeople(data, 'P0001', 'P0099')
    expect(merged.persons.some((person) => person.id === 'P0099')).toBe(false)
    expect(merged.persons.find((person) => person.id === 'P0001')?.phone2).toBe('0999')
    expect(merged.relationships.filter((relationship) => relationship.person1Id === 'P0001' && relationship.person2Id === 'P0003')).toHaveLength(1)
    expect(merged.media[0]).toMatchObject({ personId: 'P0001', driveFileId: 'safe_photo_id' })
    expect(analyzeFamilyIntegrity(merged).issues.filter((issue) => issue.severity === 'error')).toEqual([])
  })
})
