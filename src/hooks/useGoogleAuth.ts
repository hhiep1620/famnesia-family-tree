import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../services/apiClient'
import { googleDriveAuthRepository } from '../services/authRepository'
import type { GoogleUser } from '../types/family'

export function useGoogleAuth() {
  const [user, setUser] = useState<GoogleUser>()
  const [status, setStatus] = useState<'loading' | 'anonymous' | 'authorized' | 'reconnect'>('loading')
  const [error, setError] = useState<string>()

  const refresh = useCallback(async () => {
    setStatus('loading'); setError(undefined)
    try { const session = await googleDriveAuthRepository.getSession(); setUser(session.user); setStatus('authorized') }
    catch (caught) {
      if (caught instanceof ApiError && caught.code === 'GOOGLE_RECONNECT_REQUIRED') { setStatus('reconnect'); setError('Quyền Google Drive đã hết hạn hoặc bị thu hồi. Hãy kết nối lại.') }
      else if (caught instanceof ApiError && (caught.status === 401 || caught.code === 'AUTH_REQUIRED')) setStatus('anonymous')
      else { setStatus('anonymous'); setError(caught instanceof Error ? caught.message : 'Không thể kiểm tra phiên đăng nhập.') }
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  const signIn = useCallback(() => { googleDriveAuthRepository.signIn() }, [])
  const reconnect = useCallback(() => googleDriveAuthRepository.reconnect(), [])
  const signOut = useCallback(async () => { await googleDriveAuthRepository.signOut(); setUser(undefined); setStatus('anonymous') }, [])
  return { user, status, error, signIn, signOut, reconnect, refresh }
}
