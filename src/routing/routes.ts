export const appRoutes = {
  home: '/',
  login: '/login',
  workspaces: '/workspaces',
  workspace: (workspaceId: string, section: 'tree' | 'calendar' | 'analytics' | 'members' | 'settings' = 'tree') => `/workspaces/${encodeURIComponent(workspaceId)}/${section}`,
  join: (code: string) => `/join/${encodeURIComponent(code)}`,
} as const

export type WorkspaceSection = keyof typeof workspaceSections
export const workspaceSections = {
  tree: 'tree', calendar: 'calendar', analytics: 'analytics', members: 'members', settings: 'settings',
} as const

