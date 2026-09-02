import { ArrowLeft, Check, ChevronRight, Copy, KeyRound, LogOut, Plus, RefreshCw, ShieldCheck, UsersRound, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiRequest, jsonBody } from '../../services/apiClient'
import { unlockFromAnotherTab, unlockWithRecovery, type RecoveryIdentity, type UnlockedWorkspaceRuntime } from '../../services/encryptedWorkspaceRuntime'
import type { EncryptedFamilyRuntimeAdapter } from '../../services/encryptedFamilyRuntimeAdapter'
import type { GoogleUser, WorkspaceInfo } from '../../types/family'
import { RecoveryVaultPanel } from '../data/RecoveryVaultPanel'
import { BrandLogo } from '../layout/BrandLogo'

interface JoinRequest { request_id: string; requester_email: string; requester_name?: string | null; requested_role: 'editor' | 'viewer'; requested_at: string }

function friendlyError(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : 'Không thể mở workspace.'
  const known: Record<string, string> = {
    WORKSPACE_LOCKED: 'Không có tab Famnesia nào đang giữ khóa cho workspace này. Hãy khôi phục từ Google Drive.',
    WORKSPACE_KEY_NOT_PROVISIONED: 'Workspace chưa có khóa mã hóa. Owner cần thiết lập recovery vault để bắt đầu.',
    OWNER_MUST_ENROLL_MEMBER_KEY: 'Owner chưa cấp khóa mã hóa cho tài khoản này.',
    OWNER_MUST_BOOTSTRAP_WORKSPACE: 'Owner cần mở workspace lần đầu để tạo dữ liệu mã hóa.',
    WORKSPACE_KEY_ENVELOPE_MISSING: 'Không tìm thấy khóa dành cho tài khoản này. Hãy liên hệ owner.',
    GOOGLE_DRIVE_ORIGIN_MISMATCH: `Google chưa cho phép origin này (${window.location.origin}). Hãy thêm chính xác origin đó vào Google Cloud Console → Google Auth Platform → Clients → Authorized JavaScript origins, rồi thử lại.`,
  }
  return known[message] ?? message
}

export function EncryptedWorkspaceGate({ user, onSignOut, workspaceId, renderFamily }: {
  user: GoogleUser
  onSignOut: () => void
  workspaceId?: string
  renderFamily: (repository: EncryptedFamilyRuntimeAdapter) => ReactNode
}) {
  const navigate = useNavigate()
  const joinWorkflowAvailable = import.meta.env.VITE_JOIN_WORKFLOW_ENABLED === 'true'
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([])
  const [requests, setRequests] = useState<Record<string, JoinRequest[]>>({})
  const [selected, setSelected] = useState<WorkspaceInfo>()
  const [runtime, setRuntime] = useState<UnlockedWorkspaceRuntime>()
  const runtimeRef = useRef<UnlockedWorkspaceRuntime | undefined>(undefined)
  const [name, setName] = useState('Gia đình của tôi')
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()

  const installRuntime = useCallback((next: UnlockedWorkspaceRuntime) => {
    runtimeRef.current?.close(); runtimeRef.current = next; setRuntime(next)
  }, [])
  useEffect(() => () => runtimeRef.current?.close(), [])

  const refresh = useCallback(async () => {
    setBusy('Đang tải workspace…'); setError(undefined)
    try {
      const result = await apiRequest<{ workspaces: WorkspaceInfo[] }>('/api/workspaces')
      setWorkspaces(result.workspaces)
      const owners = joinWorkflowAvailable ? result.workspaces.filter((workspace) => workspace.ownedByMe) : []
      const entries = await Promise.all(owners.map(async (workspace) => {
        const value = await apiRequest<{ requests: JoinRequest[] }>(`/api/join?workspaceId=${encodeURIComponent(workspace.id)}`)
        return [workspace.id, value.requests] as const
      }))
      setRequests(Object.fromEntries(entries))
    } catch (caught) { setError(friendlyError(caught)) }
    finally { setBusy(undefined) }
  }, [joinWorkflowAvailable])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!workspaceId || selected || !workspaces.length) return
    const match = workspaces.find((workspace) => workspace.id === workspaceId)
    if (match) setSelected(match)
    else setError('Không tìm thấy workspace này hoặc bạn không có quyền truy cập.')
  }, [selected, workspaceId, workspaces])

  async function createWorkspace() {
    if (!name.trim()) return
    setBusy('Đang tạo workspace…'); setError(undefined)
    try {
      const result = await apiRequest<{ workspace: WorkspaceInfo }>('/api/workspaces', { method: 'POST', ...jsonBody({ name: name.trim() }) })
      setWorkspaces((current) => [result.workspace, ...current.filter((item) => item.id !== result.workspace.id)])
      setSelected(result.workspace)
      navigate(`/workspaces/${encodeURIComponent(result.workspace.id)}/tree`)
    } catch (caught) { setError(friendlyError(caught)) }
    finally { setBusy(undefined) }
  }

  async function openWorkspace(workspace: WorkspaceInfo) {
    setSelected(workspace); navigate(`/workspaces/${encodeURIComponent(workspace.id)}/tree`); setBusy('Đang tìm khóa trên thiết bị này…'); setError(undefined)
    try { installRuntime(await unlockFromAnotherTab(workspace)) }
    catch { /* Recovery Center is the deliberate next step. */ }
    finally { setBusy(undefined) }
  }

  async function unlock(identity: RecoveryIdentity) {
    if (!selected) return
    setBusy(selected.ownedByMe ? 'Đang mở và chuẩn bị workspace…' : 'Đang khôi phục khóa workspace…'); setError(undefined)
    try { installRuntime(await unlockWithRecovery(selected, identity)) }
    catch (caught) { setError(friendlyError(caught)); throw caught }
    finally { setBusy(undefined) }
  }

  async function resolve(workspaceId: string, requestId: string, approve: boolean, role: 'editor' | 'viewer') {
    setBusy(approve ? 'Đang duyệt yêu cầu…' : 'Đang từ chối yêu cầu…'); setError(undefined)
    try {
      await apiRequest(`/api/join?workspaceId=${encodeURIComponent(workspaceId)}`, { method: 'PATCH', ...jsonBody({ requestId, approve, role }) })
      await refresh()
    } catch (caught) { setError(friendlyError(caught)) }
    finally { setBusy(undefined) }
  }

  if (runtime) return <>{renderFamily(runtime.repository)}</>

  return <main className="workspace-hub">
    <header className="workspace-header"><BrandLogo /><div className="workspace-account"><span><strong>{user.name}</strong><small>{user.email}</small></span><button className="icon-button" onClick={onSignOut} aria-label="Đăng xuất"><LogOut size={18} /></button></div></header>
    {selected ? <section className="unlock-layout">
      <button className="back-action" onClick={() => { setSelected(undefined); setError(undefined); navigate('/workspaces') }}><ArrowLeft size={17} /> Tất cả workspace</button>
      <div className="unlock-heading"><span className="eyebrow">Không gian gia đình được mã hóa</span><h1>Mở “{selected.name}”</h1><p>Khóa chỉ được dùng trong bộ nhớ của trình duyệt. Famnesia và Supabase không thể đọc dữ liệu gia đình của bạn.</p></div>
      <div className="unlock-grid"><section className="unlock-card unlock-status-card"><div className="unlock-icon"><KeyRound /></div><span className="section-label">Trạng thái hiện tại</span><h2>Cần mở khóa trên thiết bị này</h2><p>Tìm một tab Famnesia đang mở hoặc dùng recovery vault riêng của bạn trên Google Drive.</p><button className="secondary-button" disabled={Boolean(busy)} onClick={() => void openWorkspace(selected)}><RefreshCw className={busy ? 'spin' : ''} size={16} /> Thử nhận khóa từ tab khác</button><div className="security-note"><ShieldCheck size={17} /><span>Không lưu khóa trong localStorage hoặc database.</span></div></section><RecoveryVaultPanel onActive={unlock} /></div>
      {busy && <p className="inline-status"><span className="mini-spinner" />{busy}</p>}
      {error && <div className="recovery-error" role="alert"><strong>Chưa thể mở workspace</strong><p>{error}</p><button className="secondary-button" onClick={() => setError(undefined)}>Đóng thông báo</button></div>}
    </section> : <section className="workspace-content">
      <div className="workspace-intro"><span className="eyebrow">Kho lưu trữ của gia đình</span><h1>Chọn một workspace để tiếp tục.</h1><p>Mỗi workspace có khóa riêng. Mở một không gian hiện có hoặc bắt đầu kho lưu trữ mới cho gia đình bạn.</p></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="workspace-grid">
        {workspaces.map((workspace) => <article className="workspace-card" key={workspace.id}><div className="workspace-card-mark"><UsersRound /></div><div><span className="section-label">{workspace.ownedByMe ? 'Bạn là owner' : `Quyền ${workspace.role}`}</span><h2>{workspace.name}</h2><p>{workspace.ownedByMe ? 'Quản lý khóa, thành viên và dữ liệu gia đình.' : 'Workspace được một thành viên gia đình chia sẻ.'}</p></div><button className="workspace-open" onClick={() => void openWorkspace(workspace)}>Mở workspace <ChevronRight size={18} /></button>{workspace.joinCode && <button className="join-code" onClick={() => void navigator.clipboard.writeText(workspace.joinCode!)}><span>Mã tham gia</span><strong>{workspace.joinCode}</strong><Copy size={15} /></button>}{workspace.ownedByMe && (requests[workspace.id] ?? []).map((request) => <div className="join-request" key={request.request_id}><div><strong>{request.requester_name || request.requester_email}</strong><small>{request.requester_email} · xin quyền {request.requested_role}</small></div><div><button className="primary-button" disabled={Boolean(busy)} onClick={() => void resolve(workspace.id, request.request_id, true, request.requested_role)}><Check size={14} /> Duyệt</button><button className="secondary-button" disabled={Boolean(busy)} onClick={() => void resolve(workspace.id, request.request_id, false, request.requested_role)}><X size={14} /> Từ chối</button></div></div>)}</article>)}
        <article className="workspace-card workspace-create"><div className="workspace-card-mark"><Plus /></div><div><span className="section-label">Workspace mới</span><h2>Bắt đầu một gia đình</h2><p>Bạn sẽ là owner và thiết lập recovery vault trước khi thêm dữ liệu.</p></div><label htmlFor="workspace-name">Tên workspace</label><div className="workspace-create-row"><input id="workspace-name" value={name} maxLength={120} disabled={!joinWorkflowAvailable} onChange={(event) => setName(event.target.value)} /><button className="primary-button" disabled={!joinWorkflowAvailable || Boolean(busy) || !name.trim()} onClick={() => void createWorkspace()}><Plus size={16} /> Tạo</button></div></article>
      </div>
      {busy && <p className="inline-status"><span className="mini-spinner" />{busy}</p>}
    </section>}
  </main>
}
