import type { GoogleUser } from '../types/family'
import * as authApi from './authApi'

export interface AuthSessionInfo {
  authenticated: true
  user: GoogleUser
  expiresAt: string
}

export interface AuthRepositoryContract {
  getSession(): Promise<AuthSessionInfo>
  signIn(): void
  signOut(): Promise<void>
  reconnect(): Promise<void>
}

export const googleDriveAuthRepository: AuthRepositoryContract = {
  getSession: authApi.getSession,
  signIn: () => { window.location.assign('/api/auth/login') },
  async signOut() { await authApi.logout() },
  reconnect: authApi.reconnect,
}
