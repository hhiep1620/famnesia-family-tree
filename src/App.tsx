import { lazy, Suspense } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { PublicHomepage } from './components/public/PublicHomepage'
import { JoinRequestPage } from './components/public/JoinRequestPage'
import { EncryptedWorkspaceGate } from './components/public/EncryptedWorkspaceGate'
import { useGoogleAuth } from './hooks/useGoogleAuth'

const FamilyTreePage = lazy(() => import('./pages/FamilyTreePage').then((module) => ({ default: module.FamilyTreePage })))
const familyPage = (props?: Parameters<typeof FamilyTreePage>[0]) => <Suspense fallback={<main className="app-shell"><div className="center-state"><span className="archive-loader" /><h2>Đang tải ứng dụng</h2></div></main>}><FamilyTreePage {...props} /></Suspense>

function WorkspaceRoute({ user, onSignOut }: { user: NonNullable<ReturnType<typeof useGoogleAuth>['user']>; onSignOut: () => void }) {
  const { workspaceId } = useParams()
  return <EncryptedWorkspaceGate user={user} onSignOut={onSignOut} workspaceId={workspaceId} renderFamily={(runtimeRepository) => familyPage({ user, onSignOut, runtimeRepository })} />
}

function AuthenticatedRoutes({ auth }: { auth: ReturnType<typeof useGoogleAuth> }) {
  const location = useLocation()
  if (!auth.user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (auth.backend !== 'supabase') return familyPage({ user: auth.user, onSignOut: auth.signOut })
  return <Routes>
    <Route path="/" element={<Navigate to="/workspaces" replace />} />
    <Route path="/login" element={<Navigate to="/workspaces" replace />} />
    <Route path="/join/:code" element={<JoinRoute onSignOut={auth.signOut} />} />
    <Route path="/workspaces" element={<EncryptedWorkspaceGate user={auth.user} onSignOut={auth.signOut} renderFamily={(runtimeRepository) => familyPage({ user: auth.user, onSignOut: auth.signOut, runtimeRepository })} />} />
    <Route path="/workspaces/:workspaceId" element={<WorkspaceIndexRedirect />} />
    <Route path="/workspaces/:workspaceId/tree" element={<WorkspaceRoute user={auth.user} onSignOut={auth.signOut} />} />
    <Route path="/workspaces/:workspaceId/calendar" element={<WorkspaceRoute user={auth.user} onSignOut={auth.signOut} />} />
    <Route path="/workspaces/:workspaceId/analytics" element={<WorkspaceRoute user={auth.user} onSignOut={auth.signOut} />} />
    <Route path="/workspaces/:workspaceId/members" element={<WorkspaceRoute user={auth.user} onSignOut={auth.signOut} />} />
    <Route path="/workspaces/:workspaceId/settings" element={<WorkspaceRoute user={auth.user} onSignOut={auth.signOut} />} />
    <Route path="*" element={<RouteNotFound />} />
  </Routes>
}

function WorkspaceIndexRedirect() {
  const { workspaceId } = useParams()
  return <Navigate to={`/workspaces/${encodeURIComponent(workspaceId ?? '')}/tree`} replace />
}

function JoinRoute({ onSignOut }: { onSignOut: () => void }) {
  const { code } = useParams()
  return <JoinRequestPage code={code ?? ''} onSignOut={onSignOut} />
}

function PublicRoutes({ onSignIn, error }: { onSignIn: () => void; error?: string }) {
  return <Routes>
    <Route path="/" element={<><PublicHomepage onSignIn={onSignIn} />{error && <p className="form-error auth-error">{error}</p>}</>} />
    <Route path="/login" element={<><PublicHomepage onSignIn={onSignIn} />{error && <p className="form-error auth-error">{error}</p>}</>} />
    <Route path="/join/:code" element={<Navigate to="/login" replace />} />
    <Route path="/workspaces/*" element={<Navigate to="/login" replace />} />
    <Route path="*" element={<RouteNotFound />} />
  </Routes>
}

function RouteNotFound() {
  return <main className="route-error"><h1>Không tìm thấy trang</h1><p>Đường dẫn này không tồn tại hoặc đã được di chuyển.</p><Link className="secondary-button" to="/">Về trang chủ</Link></main>
}

export default function App() {
  const auth = useGoogleAuth()
  const useMockData = import.meta.env.DEV && import.meta.env.VITE_USE_MOCK_DATA === 'true'

  const onSignIn = () => void (auth.status === 'reconnect' ? auth.reconnect() : auth.signIn())
  return <BrowserRouter>{useMockData ? familyPage() : auth.status === 'authorized' ? <AuthenticatedRoutes auth={auth} /> : auth.status === 'loading' ? <main className="route-loading"><span className="archive-loader" /><h2>Đang kiểm tra phiên đăng nhập</h2></main> : <PublicRoutes onSignIn={onSignIn} error={auth.error} />}</BrowserRouter>
}
