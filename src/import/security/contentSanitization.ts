const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const FORMULA_PREFIX = /^[\s]*[=+\-@]/

export function findDangerousObjectKey(value: unknown, path = 'family.json'): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const result = findDangerousObjectKey(value[index], `${path}[${index}]`)
      if (result) return result
    }
    return undefined
  }
  for (const key of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(key)) return `${path}.${key}`
    const result = findDangerousObjectKey((value as Record<string, unknown>)[key], `${path}.${key}`)
    if (result) return result
  }
  return undefined
}
export function safeSpreadsheetText(value: string): string {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value
}

export function plainText(value: unknown, maxLength = 10_000): string {
  return String(value ?? '').replace(/\0/g, '').slice(0, maxLength).trim()
}
