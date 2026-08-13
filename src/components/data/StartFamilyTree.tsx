import { Download, FileUp, FolderHeart } from 'lucide-react'
import { SharedWorkspaceConnector } from './SharedWorkspaceConnector'

interface Props {
  onCreate: () => void
  onImport: () => void
  onDownloadTemplate: () => void
  onConnectSharedWorkspace?: (workspaceId: string) => Promise<void>
}

export function StartFamilyTree({ onCreate, onImport, onDownloadTemplate, onConnectSharedWorkspace }: Props) {
  return <div className="start-family-state">
    <div className="start-family-mark"><FolderHeart size={30} /></div>
    <span className="eyebrow">Famnesia đã sẵn sàng trong Google Drive</span>
    <h2>Bắt đầu cây gia đình</h2>
    <p>Tạo gia đình đầu tiên trong ứng dụng, hoặc chuẩn bị toàn bộ dữ liệu bằng mẫu JSON chính thức rồi import.</p>
    <div className="start-family-actions">
      <button className="primary-button" onClick={onCreate}><FolderHeart size={17} /> Tạo gia đình</button>
      <button className="secondary-button" onClick={onImport}><FileUp size={17} /> Import JSON</button>
      <button className="text-action" onClick={onDownloadTemplate}><Download size={15} /> Tải JSON mẫu</button>
    </div>
    {onConnectSharedWorkspace && <SharedWorkspaceConnector onConnect={onConnectSharedWorkspace} />}
  </div>
}
