import { describe, expect, it } from 'vitest'
import { appRoutes, workspaceSections } from '../src/routing/routes'

describe('client-side route map', () => {
  it('builds bookmarkable resource URLs without hash or state', () => {
    expect(appRoutes.workspace('family/one', 'tree')).toBe('/workspaces/family%2Fone/tree')
    expect(appRoutes.workspace('abc', 'members')).toBe('/workspaces/abc/members')
    expect(appRoutes.join('aB3cD4eF')).toBe('/join/aB3cD4eF')
  })

  it('keeps the approved workspace sections explicit', () => {
    expect(Object.values(workspaceSections)).toEqual(['tree', 'calendar', 'analytics', 'members', 'settings'])
  })
})
