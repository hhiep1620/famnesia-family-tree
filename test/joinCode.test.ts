import { describe, expect, it } from 'vitest'
import { generateJoinCode, isValidJoinCode, normalizeJoinInput } from '../src/join/joinCode'

describe('CR-13 join code contract', () => {
  it('generates case-sensitive eight-character routing codes with rejection sampling', () => {
    const code = generateJoinCode(() => Uint8Array.from({ length: 32 }, (_, index) => index + 1))
    expect(code).toHaveLength(8)
    expect(isValidJoinCode(code)).toBe(true)
    expect(code).not.toBe(code.toLowerCase())
  })
  it('normalizes full URLs without changing case or granting access', () => {
    expect(normalizeJoinInput('  https://famnesia.example/join/aB3cD4eF?from=home  ')).toBe('aB3cD4eF')
    expect(normalizeJoinInput('Ab3cD4eF')).toBe('Ab3cD4eF')
    expect(isValidJoinCode('aB3cD4eF')).toBe(true)
    expect(isValidJoinCode('ab3cd4ef')).toBe(false)
  })
})
