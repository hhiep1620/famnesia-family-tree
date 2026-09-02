import { CheckCircle2, LogOut, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { isValidJoinCode } from '../../join/joinCode'
import { apiRequest, jsonBody } from '../../services/apiClient'
import { BrandLogo } from '../layout/BrandLogo'

export function JoinRequestPage({ code, onSignOut }: { code: string; onSignOut: () => void }) {
  const joinWorkflowAvailable = import.meta.env.VITE_JOIN_WORKFLOW_ENABLED === 'true'
  const [status, setStatus] = useState<'idle' | 'sending' | 'pending'>('idle')
  const [error, setError] = useState<string>()
  const valid = isValidJoinCode(code)

  async function requestJoin() {
    if (!joinWorkflowAvailable || !valid || status === 'sending') return
    setStatus('sending'); setError(undefined)
    try {
      await apiRequest('/api/join', { method: 'POST', ...jsonBody({ code, requestedRole: 'viewer' }) })
      setStatus('pending')
    } catch (caught) {
      setStatus('idle'); setError(caught instanceof Error ? caught.message : 'Không thể gửi yêu cầu tham gia.')
    }
  }

  return <main className="public-homepage"><header className="public-header"><BrandLogo /><button className="text-action" onClick={onSignOut}><LogOut size={15} /> Đăng xuất</button></header><section className="public-hero"><div className="hero-copy"><span className="eyebrow">Yêu cầu tham gia gia đình</span><h1>{status === 'pending' ? 'Yêu cầu đã được gửi.' : 'Xác nhận mã gia đình'}</h1>{status === 'pending' ? <><p>Owner cần duyệt yêu cầu và cấp khóa trước khi bạn có thể mở dữ liệu. Mã này không tự cấp quyền truy cập.</p><div className="hero-actions"><span className="primary-button"><CheckCircle2 size={17} /> Đang chờ owner duyệt</span></div></> : <><p>Bạn đang yêu cầu quyền viewer cho mã <strong>{valid ? code : 'không hợp lệ'}</strong>. Famnesia không hiển thị tên hay dữ liệu gia đình trước khi owner duyệt.</p><div className="hero-actions"><button className="primary-button" disabled={!joinWorkflowAvailable || !valid || status === 'sending'} onClick={() => void requestJoin()}><ShieldCheck size={17} /> {status === 'sending' ? 'Đang gửi…' : 'Gửi yêu cầu tham gia'}</button><Link className="secondary-button" to="/">Hủy</Link></div>{!joinWorkflowAvailable && <p className="form-error">Database Preview này chưa bật crypto/join migration; yêu cầu không được gửi.</p>}{!valid && <p className="form-error">Mã phải gồm 8 ký tự, có chữ hoa, chữ thường và chữ số.</p>}{error && <p className="form-error">{error}</p>}</>}</div></section></main>
}
