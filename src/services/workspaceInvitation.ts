const INVITATION_TOKEN = /^[A-Za-z0-9_-]{32,200}$/

export function invitationTokenFromInput(input: string, baseOrigin = 'https://famnesia.invalid'): string | undefined {
  const value = input.trim()
  if (INVITATION_TOKEN.test(value)) return value
  try {
    const token = new URL(value, baseOrigin).searchParams.get('invite')?.trim()
    return token && INVITATION_TOKEN.test(token) ? token : undefined
  } catch {
    return undefined
  }
}

export function invitationDestination(token: string, origin: string): string {
  if (!INVITATION_TOKEN.test(token)) throw new Error('Link mời Famnesia không hợp lệ hoặc đã bị thiếu nội dung.')
  const destination = new URL('/', origin)
  destination.searchParams.set('invite', token)
  return destination.toString()
}
