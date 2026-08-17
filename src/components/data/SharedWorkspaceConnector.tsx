import { FolderHeart } from 'lucide-react'
import { useState } from 'react'
import { chooseSharedFamnesiaWorkspace } from '../../services/googleWorkspacePicker'
import { invitationDestination, invitationTokenFromInput } from '../../services/workspaceInvitation'

export type SharedWorkspaceConnectionMode = 'drive' | 'invite'

interface Props {
  onConnect?: (workspaceId: string) => Promise<void>
  compact?: boolean
  mode?: SharedWorkspaceConnectionMode
}

export function SharedWorkspaceConnector({ onConnect, compact = false, mode = 'drive' }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [inviteLink, setInviteLink] = useState('')

  async function connect() {
    setBusy(true); setError(undefined)
    try {
      if (mode === 'invite') {
        const token = invitationTokenFromInput(inviteLink, window.location.origin)
        if (!token) throw new Error('Hãy dán đúng link mời Famnesia do owner gửi.')
        window.location.assign(invitationDestination(token, window.location.origin))
        return
      }
      if (!onConnect) throw new Error('Chức năng kết nối Google Drive chưa sẵn sàng.')
      const workspaceId = await chooseSharedFamnesiaWorkspace()
      if (workspaceId) await onConnect(workspaceId)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể kết nối gia đình được chia sẻ.')
    } finally { setBusy(false) }
  }

  const className = ['shared-workspace-connector', compact ? 'is-compact' : '', mode === 'invite' ? 'is-invite' : ''].filter(Boolean).join(' ')
  return <div className={className}>
    {!compact && <div className="shared-workspace-copy"><FolderHeart size={22} /><div><strong>Bạn đã được mời vào một gia đình?</strong><span>{mode === 'invite' ? 'Dán link mời do owner tạo. Nếu đã nhận lời trước đó, hãy chọn gia đình trên thanh phía trên.' : 'Chọn thư mục Famnesia được chia sẻ một lần. Lần sau ứng dụng sẽ tự mở đúng gia đình này.'}</span></div></div>}
    {mode === 'invite' && <input className="shared-workspace-invite-input" value={inviteLink} onChange={(event) => setInviteLink(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void connect() }} placeholder="Dán link mời Famnesia" aria-label="Link mời Famnesia" autoCapitalize="none" autoCorrect="off" spellCheck={false} />}
    <button className={compact ? 'secondary-button' : 'primary-button'} onClick={() => void connect()} disabled={busy}>
      {busy ? <span className="mini-spinner" /> : <FolderHeart size={16} />}
      {busy ? 'Đang kết nối…' : mode === 'invite' ? 'Kết nối bằng link mời' : 'Kết nối gia đình được chia sẻ'}
    </button>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>
}
