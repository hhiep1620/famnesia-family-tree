export type ExplorerView = 'list' | 'tree' | 'mindmap' | 'bubble'
export interface ExplorerState { view: ExplorerView; selectedPersonId?: string; focusPersonId?: string; search?: string; collapsedIds: string[] }
export function createExplorerState(focusPersonId?: string): ExplorerState { return { view: 'tree', focusPersonId, collapsedIds: [] } }
export function switchExplorerView(state: ExplorerState, view: ExplorerView): ExplorerState { return { ...state, view } }
export function serializeExplorerState(state: ExplorerState): string { return JSON.stringify({ view: state.view, selectedPersonId: state.selectedPersonId, focusPersonId: state.focusPersonId, collapsedIds: [...new Set(state.collapsedIds)].sort() }) }
export function deterministicBubbleSeed(personIds: string[]): number { return [...personIds].sort().reduce((seed, id) => { for (const char of id) seed = (seed * 31 + char.charCodeAt(0)) >>> 0; return seed }, 2166136261) }
