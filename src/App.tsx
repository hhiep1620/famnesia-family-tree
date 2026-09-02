import { lazy, Suspense } from 'react'
import { PublicHomepage } from './components/public/PublicHomepage'
import { JoinRequestPage } from './components/public/JoinRequestPage'
import { EncryptedWorkspaceGate } from './components/public/EncryptedWorkspaceGate'
import { useGoogleAuth } from './hooks/useGoogleAuth'

const FamilyTreePage = lazy(() => import('./pages/FamilyTreePage').then((module) => ({ default: module.FamilyTreePage })))
const familyPage = (props?: Parameters<typeof FamilyTreePage>[0]) => <Suspense fallback={<main className="app-shell"><div className="center-state"><span className="archive-loader" /><h2>Đang tải ứng dụng</h2></div></main>}><FamilyTreePage {...props} /></Suspense>

export default function App() {
  const auth = useGoogleAuth()
  const useMockData = import.meta.env.DEV && import.meta.env.VITE_USE_MOCK_DATA === 'true'

  if (useMockData) return familyPage()
  if (auth.status === 'authorized') {
    const joinMatch = /^\/join\/([A-Za-z0-9]{8})\/?$/u.exec(window.location.pathname)
    if (joinMatch) return <JoinRequestPage code={joinMatch[1]} onSignOut={auth.signOut} />
    if (auth.backend === 'supabase') return <EncryptedWorkspaceGate user={auth.user!} onSignOut={auth.signOut} renderFamily={(runtimeRepository) => familyPage({ user: auth.user, onSignOut: auth.signOut, runtimeRepository })} />
    return familyPage({ user: auth.user, onSignOut: auth.signOut })
  }

  return <><PublicHomepage onSignIn={() => void (auth.status === 'reconnect' ? auth.reconnect() : auth.signIn())} />{auth.error && <p className="form-error auth-error">{auth.error}</p>}</>
}
