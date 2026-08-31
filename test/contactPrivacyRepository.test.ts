import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('CR-07 contact repository boundary', () => {
  it('exposes field-scoped ciphertext operations without importing FamilyData or contact UI models', () => {
    const source = readFileSync(new URL('../src/services/contactPrivacyRepository.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/FamilyData|PersonDraft|phone1|phone2|address|note/u)
    expect(source).toMatch(/begin_contact_key_rotation/u)
    expect(source).toMatch(/complete_contact_key_rotation/u)
    expect(source).toMatch(/commit_contact_field_write/u)
  })

  it('keeps policy verification on the authenticated server boundary and ciphertext writes direct to Supabase', () => {
    const source = readFileSync(new URL('../src/services/contactPrivacyRepository.ts', import.meta.url), 'utf8')
    expect(source).toMatch(/\/contact-policy/u)
    expect(source).toMatch(/\/contact-authorization/u)
    expect(source.match(/apiRequest\(/gu)).toHaveLength(2)
    expect(source.match(/this\.client\.rpc\(/gu)).toHaveLength(3)
  })
})
