export type WorkspaceRole = 'owner' | 'editor' | 'viewer'

export interface AuthSession {
  id: string
  googleSub: string
  email: string
  displayName?: string
  avatarUrl?: string
  encryptedRefreshToken: string
  encryptedAccessToken?: string
  accessTokenExpiresAt?: string
  createdAt: string
  expiresAt: string
  lastSeenAt?: string
}

export interface SafeUser {
  id: string
  email: string
  name: string
  avatarUrl?: string
}

export interface WorkspaceAccess {
  id: string
  name: string
  role: WorkspaceRole
  canRead: true
  canEdit: boolean
  canUpload: boolean
  canManageMembers: boolean
  ownedByMe: boolean
  webViewLink?: string
}
