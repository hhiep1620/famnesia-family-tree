const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const CODE = /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])[A-Za-z0-9]{8}$/u
export const JOIN_CODE_PATTERN = CODE

export function isValidJoinCode(value: string): boolean { return CODE.test(value) }

export function normalizeJoinInput(value: string): string {
  const trimmed = value.trim()
  const match = trimmed.match(/\/join\/([A-Za-z0-9]{8})(?:[/?#]|$)/u)
  return match?.[1] ?? trimmed
}

export function generateJoinCode(randomBytes: (length: number) => Uint8Array = (length) => crypto.getRandomValues(new Uint8Array(length))): string {
  let result = ''
  while (result.length < 8) {
    for (const byte of randomBytes(32)) {
      if (byte >= 252) continue
      result += ALPHABET[byte % ALPHABET.length]
      if (result.length === 8) break
    }
  }
  if (!/[A-Z]/u.test(result)) result = `A${result.slice(1)}`
  if (!/[a-z]/u.test(result)) result = `${result.slice(0, 1)}a${result.slice(2)}`
  if (!/[0-9]/u.test(result)) result = `${result.slice(0, 2)}0${result.slice(3)}`
  return result
}

export function genericJoinFailure(): Error { return new Error('JOIN_CODE_UNAVAILABLE') }
