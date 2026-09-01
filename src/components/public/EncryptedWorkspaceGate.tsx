import { Check, Copy, KeyRound, LogOut, Plus, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { apiRequest, jsonBody } from '../../services/apiClient'
import type { WorkspaceInfo } from '../../types/family'
import { BrandLogo } from '../layout/BrandLogo'

interface JoinRequest {
  request_id: string
  requester_email: string
  requester_name?: string | null
  requested_role: 'editor' | 'viewer'
  requested_at: string
}

export function EncryptedWorkspaceGate({ onSignOut }: { onSignOut: () => void }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([])
  const [requests, setRequests] = useState<Record<string, JoinRequest[]>>({})
  const [name, setName] = useState('Gia đình của tôi')
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()

  const refresh = useCallback(async () => {
    setBusy('Đang tải workspace…'); setError(undefined)
    try {
      const result = await apiRequest<{ workspaces: WorkspaceInfo[] }>('/api/workspaces')
      setWorkspaces(result.workspaces)
      const owners = result.workspaces.filter((workspace) => workspace.ownedByMe)
      const entries = await Promise.all(owners.map(async (workspace) => {
        const value = await apiRequest<{ requests: JoinRequest[] }>(`/api/join?workspaceId=${encodeURIComponent(workspace.id)}`)
        return [workspace.id, value.requests] as const
      }))
      setRequests(Object.fromEntries(entries))
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải workspace.') }
    finally { setBusy(undefined) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  async function createWorkspace() {
    if (!name.trim()) return
    setBusy('Đang tạo workspace…'); setError(undefined)
    try {
      await apiRequest('/api/workspaces', { method: 'POST', ...jsonBody({ name: name.trim() }) })
      await refresh()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tạo workspace.') }
    finally { setBusy(undefined) }
  }

  async function resolve(workspaceId: string, requestId: string, approve: boolean, role: 'editor' | 'viewer') {
    setBusy(approve ? 'Đang duyệt yêu cầu…' : 'Đang từ chối yêu cầu…'); setError(undefined)
    try {
      await apiRequest(`/api/join?workspaceId=${encodeURIComponent(workspaceId)}`, { method: 'PATCH', ...jsonBody({ requestId, approve, role }) })
      await refresh()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể xử lý yêu cầu.') }
    finally { setBusy(undefined) }
  }

  return <main className="public-homepage"><header className="public-header"><BrandLogo /><nav aria-label="Tài khoản"><button className="text-action" disabled={Boolean(busy)} onClick={() => void refresh()}><RefreshCw size={15} /> Làm mới</button><button className="text-action" onClick={onSignOut}><LogOut size={15} /> Đăng xuất</button></nav></header><section className="public-hero"><div className="hero-copy"><span className="eyebrow">Encrypted Preview gate</span><h1>Workspace đã sẵn sàng; dữ liệu gia đình đang được khóa.</h1><p>Preview cho phép kiểm thử đăng nhập, tạo workspace, join code và owner approval. Đường đọc/ghi family, media, backup và Draft plaintext đã bị chặn ở server.</p>{error && <p className="form-error">{error}</p>}<div className="join-box"><label htmlFor="workspace-name">Tạo workspace mới</label><div><input id="workspace-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /><button className="secondary-button" disabled={Boolean(busy) || !name.trim()} onClick={() => void createWorkspace()}><Plus size={15} /> Tạo</button></div></div></div><div className="lineage-hero" aria-label="Trạng thái mã hóa"><KeyRound size={42} /><strong>Fail closed</strong><span>Không fallback về plaintext</span></div></section><section className="public-values"><span className="eyebrow">Workspace của bạn</span><div className="public-value-grid">{workspaces.length === 0 && !busy ? <article><h2>Chưa có workspace</h2><p>Tạo workspace hoặc mở link join do owner gửi.</p></article> : workspaces.map((workspace) => <article key={workspace.id}><h2>{workspace.name}</h2><p>Vai trò: {workspace.role}</p>{workspace.joinCode && <p><strong>Mã join: {workspace.joinCode}</strong> <button className="icon-button" aria-label="Sao chép mã join" onClick={() => void navigator.clipboard.writeText(workspace.joinCode!)}><Copy size={14} /></button></p>}{workspace.ownedByMe && (requests[workspace.id] ?? []).map((request) => <div className="join-box" key={request.request_id}><strong>{request.requester_name || request.requester_email}</strong><small>{request.requester_email} · xin quyền {request.requested_role}</small><div><button className="primary-button" disabled={Boolean(busy)} onClick={() => void resolve(workspace.id, request.request_id, true, request.requested_role)}><Check size={14} /> Duyệt</button><button className="secondary-button" disabled={Boolean(busy)} onClick={() => void resolve(workspace.id, request.request_id, false, request.requested_role)}><X size={14} /> Từ chối</button></div></div>)}</article>)}</div></section></main>
}
