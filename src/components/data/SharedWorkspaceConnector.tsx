import { FolderHeart } from 'lucide-react'
import { useState } from 'react'
import { chooseSharedFamnesiaWorkspace } from '../../services/googleWorkspacePicker'

interface Props {
  onConnect: (workspaceId: string) => Promise<void>
  compact?: boolean
}

export function SharedWorkspaceConnector({ onConnect, compact = false }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function connect() {
    setBusy(true); setError(undefined)
    try {
      const workspaceId = await chooseSharedFamnesiaWorkspace()
      if (workspaceId) await onConnect(workspaceId)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể kết nối gia đình được chia sẻ.')
    } finally { setBusy(false) }
  }

  return <div className={compact ? 'shared-workspace-connector is-compact' : 'shared-workspace-connector'}>
    {!compact && <div className="shared-workspace-copy"><FolderHeart size={22} /><div><strong>Bạn đã được mời vào một gia đình?</strong><span>Chọn thư mục Famnesia được chia sẻ một lần. Lần sau ứng dụng sẽ tự mở đúng gia đình này.</span></div></div>}
    <button className={compact ? 'secondary-button' : 'primary-button'} onClick={() => void connect()} disabled={busy}>
      {busy ? <span className="mini-spinner" /> : <FolderHeart size={16} />}
      {busy ? 'Đang kết nối…' : 'Kết nối gia đình được chia sẻ'}
    </button>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>
}
