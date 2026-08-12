import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Database,
  Download,
  FileJson,
  FileUp,
  FolderOpen,
  Image,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { downloadFamilyData, downloadFamilyDataTemplate } from '../../import/exportFamilyData'
import { validateImportFile, type ImportValidationResult } from '../../import/validateImport'
import { validateFamilyData } from '../../schema/familyDataSchema'
import type { FamilyBackup, FamilyData, SaveStatus, WorkspaceInfo, WorkspaceMember } from '../../types/family'

interface Props {
  data: FamilyData
  workspace?: WorkspaceInfo
  mock: boolean
  busy?: string
  saveStatus: SaveStatus
  openImportOnMount?: boolean
  onImportOpened?: () => void
  onCreateProfile: () => void
  onImport: (data: FamilyData) => Promise<void>
  onBackup: () => Promise<FamilyBackup>
  onListBackups: () => Promise<FamilyBackup[]>
  onRestore: (backupId: string) => Promise<void>
  members?: WorkspaceMember[]
  onRefreshMembers?: () => Promise<WorkspaceMember[]>
  onAddMember?: (email: string, role: 'editor' | 'viewer') => Promise<void>
  onUpdateMember?: (id: string, role: 'editor' | 'viewer') => Promise<void>
  onRemoveMember?: (id: string) => Promise<void>
}

const saveLabels: Record<SaveStatus, string> = {
  saved: 'Đã lưu', saving: 'Đang lưu…', unsaved: 'Có thay đổi chưa lưu', failed: 'Lưu thất bại',
}

function formatBackupTime(value?: string): string {
  if (!value) return 'Không rõ thời gian'
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function ImportDialog({ result, busy, onChoose, onClose, onConfirm }: {
  result?: ImportValidationResult
  busy?: string
  onChoose: (event: ChangeEvent<HTMLInputElement>) => void
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const input = useRef<HTMLInputElement>(null)
  const summary = result?.preview
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="modal-card import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <div className="modal-heading"><div><span className="eyebrow">Thay thế có kiểm soát</span><h2 id="import-title">Import dữ liệu JSON</h2></div><button className="icon-button" onClick={onClose} aria-label="Đóng"><X size={19} /></button></div>
      <div className="import-safety-note"><ShieldCheck size={19} /><div><strong>Dữ liệu hiện tại chưa bị thay đổi</strong><p>Ứng dụng chỉ ghi family.json sau khi tệp hợp lệ và bạn xác nhận. Một bản backup sẽ được tạo trước khi thay thế.</p></div></div>
      <input ref={input} className="sr-only" type="file" accept="application/json,.json" onChange={onChoose} />
      {!result ? <button className="json-dropzone" onClick={() => input.current?.click()}><FileUp size={26} /><strong>Chọn tệp JSON</strong><span>Tối đa một family.json hoặc tệp export từ ứng dụng</span></button> : <>
        <div className="selected-import"><FileJson size={20} /><div><strong>{result.filename}</strong><span>{result.errors.length ? 'Cần sửa lỗi trước khi import' : 'Đã đọc và kiểm tra cấu trúc'}</span></div><button className="secondary-button" onClick={() => input.current?.click()}>Chọn tệp khác</button></div>
        {summary && <div className="import-summary" aria-label="Tóm tắt import">
          <div><strong>{summary.profiles}</strong><span>Gia đình</span></div><div><strong>{summary.people}</strong><span>Thành viên</span></div><div><strong>{summary.relationships}</strong><span>Quan hệ</span></div><div><strong>{summary.living}</strong><span>Còn sống</span></div><div><strong>{summary.deceased}</strong><span>Đã mất</span></div>
        </div>}
        {(result.errors.length > 0 || result.warnings.length > 0) && <div className="validation-report">
          {result.errors.length > 0 && <section className="validation-errors"><h3><AlertTriangle size={16} /> {result.errors.length} lỗi — không thể import</h3><ul>{result.errors.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}</ul></section>}
          {result.warnings.length > 0 && <section className="validation-warnings"><h3><AlertTriangle size={16} /> {result.warnings.length} cảnh báo</h3><ul>{result.warnings.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}</ul></section>}
        </div>}
        {result.errors.length === 0 && <div className="validation-ready"><CheckCircle2 size={18} /><span>Tệp hợp lệ và có thể thay thế dữ liệu hiện tại.</span></div>}
      </>}
      <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Hủy</button><button className="primary-button" disabled={!result?.data || result.errors.length > 0 || Boolean(busy)} onClick={() => void onConfirm()}>{busy ?? 'Backup và import'}</button></div>
    </section>
  </div>
}

export function DataManagement(props: Props) {
  const { onListBackups, openImportOnMount, onImportOpened, onRefreshMembers } = props
  const canManageMembers = props.workspace?.canManageMembers
  const [showImport, setShowImport] = useState(false)
  const [importResult, setImportResult] = useState<ImportValidationResult>()
  const [readingFile, setReadingFile] = useState(false)
  const [backups, setBackups] = useState<FamilyBackup[]>([])
  const [backupError, setBackupError] = useState<string>()
  const [memberEmail, setMemberEmail] = useState('')
  const [memberRole, setMemberRole] = useState<'editor' | 'viewer'>('viewer')
  const [memberError, setMemberError] = useState<string>()
  const validation = validateFamilyData(props.data)

  const refreshBackups = useCallback(async () => {
    try { setBackups(await onListBackups()); setBackupError(undefined) }
    catch (caught) { setBackupError(caught instanceof Error ? caught.message : 'Không thể đọc danh sách backup.') }
  }, [onListBackups])

  useEffect(() => { void refreshBackups() }, [refreshBackups])
  useEffect(() => { if (canManageMembers) void onRefreshMembers?.().catch((caught) => setMemberError(caught instanceof Error ? caught.message : 'Không thể tải thành viên.')) }, [canManageMembers, onRefreshMembers])
  useEffect(() => {
    if (openImportOnMount) {
      setShowImport(true)
      onImportOpened?.()
    }
  }, [openImportOnMount, onImportOpened])

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setReadingFile(true)
    try { setImportResult(await validateImportFile(file)) }
    finally { setReadingFile(false) }
  }

  async function confirmImport() {
    if (!importResult?.data || importResult.errors.length) return
    await props.onImport(importResult.data)
    setShowImport(false)
    setImportResult(undefined)
    await refreshBackups()
  }

  async function createBackup() {
    await props.onBackup()
    await refreshBackups()
  }

  async function restore(backup: FamilyBackup) {
    if (!window.confirm(`Khôi phục ${backup.name}? Dữ liệu hiện tại sẽ được backup trước.`)) return
    await props.onRestore(backup.id)
    await refreshBackups()
  }

  const openImport = () => { setImportResult(undefined); setShowImport(true) }

  async function inviteMember() {
    if (!memberEmail.trim() || !props.onAddMember) return
    try { await props.onAddMember(memberEmail.trim(), memberRole); setMemberEmail(''); setMemberError(undefined) }
    catch (caught) { setMemberError(caught instanceof Error ? caught.message : 'Không thể mời thành viên.') }
  }

  return <div className="data-page">
    <header className="data-page-heading"><div><span className="eyebrow">Cài đặt / Dữ liệu</span><h2>Kho dữ liệu gia đình</h2><p>Một tệp JSON có thể đọc, tải xuống và mang theo — nằm trong Drive của chính bạn.</p></div><span className={`save-state save-${props.saveStatus}`}><i />{saveLabels[props.saveStatus]}</span></header>

    <section className="workspace-ledger">
      <div className="workspace-ledger-title"><Database size={20} /><div><strong>{props.workspace?.name ?? 'Famnesia'}</strong><span>{props.mock ? 'Workspace mô phỏng khi phát triển' : `Workspace Google Drive · quyền ${props.workspace?.role ?? 'đang tải'}`}</span></div>{props.workspace?.rootFolderUrl && <a className="secondary-button" href={props.workspace.rootFolderUrl} target="_blank" rel="noreferrer"><FolderOpen size={15} /> Mở thư mục Drive</a>}</div>
      <div className="workspace-files"><div className="is-primary"><FileJson /><strong>family.json</strong><span>Nguồn dữ liệu chính</span></div><div><Archive /><strong>backups/</strong><span>Bản sao trước thay đổi lớn</span></div><div><Image /><strong>photos/</strong><span>Ảnh lưu riêng, JSON chỉ giữ ID</span></div></div>
    </section>

    <div className="data-actions-grid">
      <section className="data-action-panel primary-data-panel"><span className="section-label">Di chuyển dữ liệu</span><h3>Import và export</h3><p>Export tạo đúng định dạng mà Import chấp nhận. Import thay thế toàn bộ chỉ dành cho owner.</p><div className="data-button-stack">{(props.mock || props.workspace?.role === 'owner') && <button className="primary-button" onClick={openImport}><FileUp size={16} /> Import JSON</button>}<button className="secondary-button" onClick={() => downloadFamilyData(props.data)}><Download size={16} /> Export dữ liệu</button><button className="secondary-button" onClick={downloadFamilyDataTemplate}><FileJson size={16} /> Tải JSON mẫu</button></div></section>
      <section className="data-action-panel"><span className="section-label">Profile</span><h3>Gia đình trong tệp</h3><p>{props.data.profiles.length} gia đình · {props.data.persons.length} thành viên · {props.data.relationships.length} quan hệ.</p>{(props.mock || props.workspace?.canEdit) && <button className="secondary-button" onClick={props.onCreateProfile}><Plus size={16} /> Tạo thêm gia đình</button>}</section>
      <section className="data-action-panel"><span className="section-label">Kiểm tra</span><h3>Tính toàn vẹn</h3>{validation.errors.length === 0 ? <p className="data-valid"><CheckCircle2 size={16} /> Dữ liệu hiện tại hợp lệ theo schema v{props.data.schemaVersion}.</p> : <p className="data-invalid"><AlertTriangle size={16} /> Có {validation.errors.length} lỗi dữ liệu.</p>}{validation.warnings.length > 0 && <div className="data-integrity-warnings"><strong><AlertTriangle size={14} /> {validation.warnings.length} thông tin cần bổ sung</strong><ul>{validation.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}</section>
    </div>

    <section className="backup-section"><div className="backup-heading"><div><span className="section-label">An toàn dữ liệu</span><h3>Bản sao lưu</h3><p>Import và khôi phục luôn tạo backup tự động. Khôi phục chỉ dành cho owner.</p></div>{(props.mock || props.workspace?.canEdit) && <button className="secondary-button" onClick={() => void createBackup()} disabled={Boolean(props.busy)}><Archive size={16} /> Backup ngay</button>}</div>
      {backupError && <p className="form-error">{backupError}</p>}
      <div className="backup-list">{backups.length ? backups.map((backup) => <div className="backup-row" key={backup.id}><Archive size={16} /><div><strong>{backup.name}</strong><span>{formatBackupTime(backup.createdTime ?? backup.modifiedTime)}{backup.reason ? ` · ${backup.reason}` : ''}</span></div>{(props.mock || props.workspace?.role === 'owner') && <button className="secondary-button" onClick={() => void restore(backup)}><RotateCcw size={14} /> Khôi phục</button>}</div>) : <div className="backup-empty">Chưa có bản sao lưu nào.</div>}</div>
    </section>

    {props.workspace?.canManageMembers && <section className="backup-section collaboration-section"><div className="backup-heading"><div><span className="section-label">Cộng tác</span><h3><Users size={18} /> Thành viên workspace</h3><p>Owner quản lý quyền; editor được sửa dữ liệu và ảnh, viewer chỉ được xem.</p></div></div>
      <div className="member-invite"><input type="email" value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} placeholder="email@gmail.com" aria-label="Email thành viên" /><select value={memberRole} onChange={(event) => setMemberRole(event.target.value as 'editor' | 'viewer')}><option value="viewer">Viewer</option><option value="editor">Editor</option></select><button className="primary-button" onClick={() => void inviteMember()}><UserPlus size={16} /> Mời</button></div>
      {memberError && <p className="form-error">{memberError}</p>}
      <div className="backup-list">{props.members?.map((member) => <div className="backup-row member-row" key={member.id}><Users size={16} /><div><strong>{member.name ?? member.email ?? 'Tài khoản Google'}</strong><span>{member.email}{member.inherited ? ' · quyền kế thừa' : ''}</span></div>{member.role === 'owner' ? <span className="session-badge">owner</span> : <><select value={member.role} disabled={member.inherited} onChange={(event) => void props.onUpdateMember?.(member.id, event.target.value as 'editor' | 'viewer')}><option value="viewer">viewer</option><option value="editor">editor</option></select><button className="icon-button" disabled={member.inherited} onClick={() => { if (window.confirm(`Gỡ quyền của ${member.email ?? member.name}?`)) void props.onRemoveMember?.(member.id) }} aria-label="Gỡ thành viên"><Trash2 size={16} /></button></>}</div>)}</div>
    </section>}

    {showImport && <ImportDialog result={importResult} busy={readingFile ? 'Đang đọc tệp…' : props.busy} onChoose={(event) => void chooseFile(event)} onClose={() => { setShowImport(false); setImportResult(undefined) }} onConfirm={confirmImport} />}
  </div>
}
