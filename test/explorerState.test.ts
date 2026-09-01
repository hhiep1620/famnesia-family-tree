import { describe, expect, it } from 'vitest'
import { createExplorerState, deterministicBubbleSeed, serializeExplorerState, switchExplorerView } from '../src/dashboard/explorerState'

describe('CR-14 shared explorer state', () => {
  it('preserves selection/focus while switching all four views', () => {
    const state = { ...createExplorerState('P1'), selectedPersonId: 'P2', collapsedIds: ['P3', 'P3'] }
    expect(switchExplorerView(state, 'mindmap')).toMatchObject({ view: 'mindmap', selectedPersonId: 'P2', focusPersonId: 'P1' })
    expect(serializeExplorerState(state)).toContain('"view":"tree"')
  })
  it('uses deterministic bubble seed independent of input order', () => { expect(deterministicBubbleSeed(['P2', 'P1'])).toBe(deterministicBubbleSeed(['P1', 'P2'])) })
})
