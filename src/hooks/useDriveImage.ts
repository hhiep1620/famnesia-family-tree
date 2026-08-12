export function useDriveImage(workspaceId?: string, fileId?: string) {
  return {
    url: workspaceId && fileId ? `/api/workspaces/${encodeURIComponent(workspaceId)}/photos/${encodeURIComponent(fileId)}` : undefined,
    loading: false,
  }
}
