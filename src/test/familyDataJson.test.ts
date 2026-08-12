import { describe, expect, it } from 'vitest'
import { createFamilyDataTemplate, serializeFamilyData } from '../import/exportFamilyData'
import { validateImportText } from '../import/validateImport'
import { validateFamilyData } from '../schema/familyDataSchema'

describe('family.json import contract', () => {
  it('accepts the official template and reports its summary', () => {
    const result = validateImportText(serializeFamilyData(createFamilyDataTemplate()), 'famnesia-template-v1.json')
    expect(result.errors).toEqual([])
    expect(result.preview).toMatchObject({ profiles: 1, people: 3, relationships: 3, living: 3, deceased: 0 })
  })

  it('blocks a relationship that references a missing person', () => {
    const data = createFamilyDataTemplate()
    data.relationships[0] = { ...data.relationships[0], person2Id: 'P9999' }
    const result = validateImportText(JSON.stringify(data))
    expect(result.data).toBeUndefined()
    expect(result.preview).toMatchObject({ profiles: 1, people: 3, relationships: 3 })
    expect(result.errors.some((message) => message.includes("Không tìm thấy người 'P9999'"))).toBe(true)
  })

  it('blocks an ancestry cycle', () => {
    const data = createFamilyDataTemplate()
    data.relationships.push({
      id: 'R0004', profileId: 'F0001', person1Id: 'P0003', person2Id: 'P0001', type: 'parent',
    })
    const result = validateImportText(JSON.stringify(data))
    expect(result.data).toBeUndefined()
    expect(result.errors.some((message) => message.includes('vòng lặp tổ tiên'))).toBe(true)
  })

  it('exports data that can be re-imported without transformation loss', () => {
    const first = validateImportText(serializeFamilyData(createFamilyDataTemplate()))
    expect(first.data).toBeDefined()
    const second = validateImportText(serializeFamilyData(first.data!))
    expect(second.errors).toEqual([])
    expect(second.data).toEqual(first.data)
  })

  it('does not treat an optional subject selection as a data warning', () => {
    const data = createFamilyDataTemplate()
    data.profiles[0].subjectPersonId = null
    expect(validateFamilyData(data).warnings).toEqual([])
  })
})
