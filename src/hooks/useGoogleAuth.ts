import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../services/apiClient'
import { resolveAuthRepository, type AuthRepositoryContract } from '../services/authRepository'
import type { GoogleUser } from '../types/family'

export function useGoogleAuth() {
  const [user, setUser] = useState<GoogleUser>()
  const [status, setStatus] = useState<'loading' | 'anonymous' | 'authorized' | 'reconnect'>('loading')
  const [error, setError] = useState<string>()
  const [repository, setRepository] = useState<AuthRepositoryContract>()
  const refreshVersion = useRef(0)

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current
    setStatus((current) => current === 'authorized' ? current : 'loading'); setError(undefined)
    try {
      const selected = repository ?? await resolveAuthRepository()
      if (!repository) setRepository(selected)
      const session = await selected.getSession()
      if (version !== refreshVersion.current) return
      setUser(session.user); setStatus('authorized')
    }
    catch (caught) {
      if (version !== refreshVersion.current) return
      setUser(undefined)
      if (caught instanceof ApiError && caught.code === 'GOOGLE_RECONNECT_REQUIRED') { setStatus('reconnect'); setError('Quyền Google Drive đã hết hạn hoặc bị thu hồi. Hãy kết nối lại.') }
      else if (caught instanceof ApiError && (caught.status === 401 || caught.code === 'AUTH_REQUIRED')) setStatus('anonymous')
      else { setStatus('anonymous'); setError(caught instanceof Error ? caught.message : 'Không thể kiểm tra phiên đăng nhập.') }
    }
  }, [repository])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => repository?.onAuthStateChange(() => { void refresh() }), [repository, refresh])
  const run = useCallback(async (action: (selected: AuthRepositoryContract) => Promise<void>) => {
    setError(undefined)
    try { await action(repository ?? await resolveAuthRepository()) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể hoàn tất thao tác đăng nhập.') }
  }, [repository])
  const signIn = useCallback(() => run((selected) => selected.signIn()), [run])
  const reconnect = useCallback(() => run((selected) => selected.reconnect()), [run])
  const signOut = useCallback(async () => {
    await run(async (selected) => { await selected.signOut(); setUser(undefined); setStatus('anonymous') })
  }, [run])
  return { user, status, error, backend: repository?.backend, signIn, signOut, reconnect, refresh }
}
