import { PublicHomepage } from './components/public/PublicHomepage'
import { FamilyTreePage } from './pages/FamilyTreePage'
import { useGoogleAuth } from './hooks/useGoogleAuth'

export default function App() {
  const auth = useGoogleAuth()
  const useMockData = import.meta.env.DEV && import.meta.env.VITE_USE_MOCK_DATA === 'true'

  if (useMockData) return <FamilyTreePage />
  if (auth.status === 'authorized') return <FamilyTreePage user={auth.user} onSignOut={auth.signOut} />

  return <><PublicHomepage onSignIn={() => void (auth.status === 'reconnect' ? auth.reconnect() : auth.signIn())} />{auth.error && <p className="form-error auth-error">{auth.error}</p>}</>
}
