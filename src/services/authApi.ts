import { apiRequest } from './apiClient'
import type { GoogleUser } from '../types/family'

export interface SessionInfo { authenticated: true; user: GoogleUser; expiresAt: string }
export const getSession = () => apiRequest<SessionInfo>('/api/auth/session')
export const logout = () => apiRequest<{ ok: true }>('/api/auth/logout', { method: 'POST' })
export async function reconnect(): Promise<void> {
  const result = await apiRequest<{ authorizationUrl: string }>('/api/auth/reconnect', { method: 'POST' })
  window.location.assign(result.authorizationUrl)
}
