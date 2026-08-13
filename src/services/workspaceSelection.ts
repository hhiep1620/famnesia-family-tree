import type { FamilyData, WorkspaceInfo } from '../types/family'

function isEmptyWorkspaceData(data: FamilyData): boolean {
  return data.profiles.length === 0
    && data.persons.length === 0
    && data.relationships.length === 0
    && data.media.length === 0
}

export function sharedWorkspaceForEmptyOwner(
  active: WorkspaceInfo,
  workspaces: WorkspaceInfo[],
  data: FamilyData,
  hasStoredDraft: boolean,
): WorkspaceInfo | undefined {
  if (!active.ownedByMe || hasStoredDraft || !isEmptyWorkspaceData(data)) return undefined
  const shared = workspaces.filter((workspace) => !workspace.ownedByMe)
  return shared.length === 1 ? shared[0] : undefined
}
