import { describe, expect, it } from 'vitest'
import { createDriveRequestBackend } from '../api/_server/driveBackend.js'
import { parseBackendSelection, requireDrivePersistenceBackends, requireGoogleDriveAuthBackend } from '../api/_server/backendSelectors.js'
import type { AuthContext } from '../api/_server/auth.js'

const driveSelection = { data: 'drive', auth: 'google-drive-oauth', media: 'drive' } as const

describe('backend selection and repository boundary', () => {
  it('defaults to the existing Drive stack', () => {
    expect(parseBackendSelection({})).toEqual(driveSelection)
  })

  it.each([
    ['DATA_BACKEND', { DATA_BACKEND: 'filesystem' }],
    ['AUTH_BACKEND', { AUTH_BACKEND: 'google' }],
    ['MEDIA_BACKEND', { MEDIA_BACKEND: 'public' }],
  ])('rejects an invalid %s value instead of silently falling back', (_name, environment) => {
    expect(() => parseBackendSelection(environment)).toThrow(/Invalid .*_BACKEND/)
  })

  it('accepts the complete Supabase stack but keeps Drive-only adapters isolated', () => {
    const selected = parseBackendSelection({ DATA_BACKEND: 'supabase', AUTH_BACKEND: 'supabase', MEDIA_BACKEND: 'supabase' })
    expect(selected).toEqual({ data: 'supabase', auth: 'supabase', media: 'supabase' })
    expect(() => requireGoogleDriveAuthBackend(selected)).toThrow(/rollback Google Drive OAuth flow/)
    expect(() => requireDrivePersistenceBackends(selected)).toThrow(/Supabase data repository phase/)
  })

  it('rejects mixed provider stacks that would lose required credentials', () => {
    expect(() => parseBackendSelection({ AUTH_BACKEND: 'supabase' })).toThrow(/complete Drive stack or the complete Supabase stack/)
    expect(() => parseBackendSelection({ DATA_BACKEND: 'supabase', AUTH_BACKEND: 'google-drive-oauth', MEDIA_BACKEND: 'supabase' })).toThrow(/Mixed auth\/data\/media/)
  })

  it('exposes all neutral repository capabilities through the Drive adapter', () => {
    const auth = {
      backend: 'google-drive-oauth', accessToken: 'drive-token',
      user: { id: 'google-user', email: 'owner@example.com', name: 'Owner' },
      expiresAt: new Date(Date.now() + 60_000).toISOString(), providerSubject: 'google-user',
    } satisfies AuthContext
    const backend = createDriveRequestBackend(auth, driveSelection)
    expect(Object.keys(backend.workspaces).sort()).toEqual(['acceptInvitation', 'connect', 'create', 'get', 'list'])
    expect(Object.keys(backend.family).sort()).toEqual(['commit', 'commitStatus', 'listActivity', 'load', 'recordActivity', 'save'])
    expect(Object.keys(backend.media).sort()).toEqual(['delete', 'read', 'upload'])
    expect(Object.keys(backend.members).sort()).toEqual(['add', 'list', 'remove', 'update'])
    expect(Object.keys(backend.drafts).sort()).toEqual(['list', 'markCanonicalChanged', 'review', 'status', 'submit', 'syncMirror', 'workspaceInfo'])
    expect(Object.keys(backend.backups).sort()).toEqual(['create', 'list', 'load'])
  })
})
