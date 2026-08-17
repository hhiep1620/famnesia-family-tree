import { describe, expect, it } from 'vitest'
import { invitationDestination, invitationTokenFromInput } from '../services/workspaceInvitation'

const token = 'Abcdefghijklmnopqrstuvwxyz_1234567890-Invite'

describe('Supabase workspace invitation links', () => {
  it('accepts a raw token or a full Famnesia invite URL', () => {
    expect(invitationTokenFromInput(token)).toBe(token)
    expect(invitationTokenFromInput(`https://famnesia-family-tree.vercel.app/?invite=${token}`)).toBe(token)
    expect(invitationTokenFromInput(`/?invite=${token}`, 'https://famnesia-family-tree.vercel.app')).toBe(token)
  })

  it('rejects missing and malformed invitation values', () => {
    expect(invitationTokenFromInput('')).toBeUndefined()
    expect(invitationTokenFromInput('https://famnesia-family-tree.vercel.app/')).toBeUndefined()
    expect(invitationTokenFromInput('/?invite=too-short', 'https://famnesia-family-tree.vercel.app')).toBeUndefined()
  })

  it('always opens the invitation on the current app origin', () => {
    expect(invitationDestination(token, 'https://famnesia-family-tree.vercel.app')).toBe(`https://famnesia-family-tree.vercel.app/?invite=${token}`)
  })
})
