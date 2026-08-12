import { LockKeyhole } from 'lucide-react'
import { BrandLogo } from './components/layout/BrandLogo'
import { FamilyTreePage } from './pages/FamilyTreePage'
import { useGoogleAuth } from './hooks/useGoogleAuth'

export default function App() {
  const auth = useGoogleAuth()
  const useMockData = import.meta.env.DEV && import.meta.env.VITE_USE_MOCK_DATA === 'true'

  if (useMockData) return <FamilyTreePage />
  if (auth.status === 'authorized') return <FamilyTreePage user={auth.user} onSignOut={auth.signOut} />

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <BrandLogo />
        <span className="eyebrow">Kho gia phả riêng tư</span>
        <p className="brand-slogan"><em>Too many relatives. Not enough memory.</em></p>
        <p>Đăng nhập bằng tài khoản Google để mở workspace gia đình riêng trên Google Drive.</p>
        <button className="google-button" onClick={() => void (auth.status === 'reconnect' ? auth.reconnect() : auth.signIn())} disabled={auth.status === 'loading'}><LockKeyhole size={18} />{auth.status === 'loading' ? 'Đang kiểm tra phiên…' : auth.status === 'reconnect' ? 'Kết nối lại Google' : 'Tiếp tục với Google'}</button>
        {auth.error && <p className="form-error auth-error">{auth.error}</p>}
        <small>Không có cơ sở dữ liệu dùng chung. Dữ liệu nằm trong Google Drive của bạn.</small>
      </section>
      <div className="auth-branch" aria-hidden="true"><i /><i /><i /><i /></div>
    </main>
  )
}
