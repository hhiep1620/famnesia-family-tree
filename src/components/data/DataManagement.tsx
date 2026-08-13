import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
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
import { downloadFamilyData, downloadFamilyDataExcel, downloadFamilyDataExcelTemplate, downloadFamilyDataTemplate } from '../../import/exportFamilyData'
import { validateImportFile, type ImportValidationResult } from '../../import/validateImport'
import { validateFamilyData } from '../../schema/familyDataSchema'
import type { ActivityEvent, FamilyBackup, FamilyData, SaveStatus, WorkspaceInfo, WorkspaceMember } from '../../types/family'
import { ActivityTimeline } from './ActivityTimeline'
import { DataQualityCenter } from './DataQualityCenter'

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
  activity?: ActivityEvent[]
  onOpenPerson?: (id: string) => void
  onSuppressDuplicate?: (leftId: string, rightId: string) => Promise<void>
  onMergePeople?: (canonicalId: string, duplicateId: string) => Promise<void>
}

const saveLabels: Record<SaveStatus, string> = {
  saved: 'Đã lưu', saving: 'Đang lưu…', unsaved: 'Có thay đổi chưa lưu', failed: 'Lưu thất bại',
  conflict: 'Cần xử lý xung đột', offline: 'Ngoại tuyến · Draft an toàn',
}

function formatBackupTime(value?: string): string {
  if (!value) return 'Không rõ thời gian'
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function ImportDialog({ result, busy, preferredFormat, onChoose, onClose, onConfirm }: {
  result?: ImportValidationResult
  busy?: string
  preferredFormat: 'json' | 'xlsx'
  onChoose: (event: ChangeEvent<HTMLInputElement>) => void
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const input = useRef<HTMLInputElement>(null)
  const summary = result?.preview
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="modal-card import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <div className="modal-heading"><div><span className="eyebrow">Thay thế có kiểm soát</span><h2 id="import-title">Import {preferredFormat === 'xlsx' ? 'Excel' : 'JSON'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Đóng"><X size={19} /></button></div>
      <div className="import-safety-note"><ShieldCheck size={19} /><div><strong>Dữ liệu hiện tại chưa bị thay đổi</strong><p>Ứng dụng chỉ ghi family.json sau khi tệp hợp lệ và bạn xác nhận. Một bản backup sẽ được tạo trước khi thay thế.</p></div></div>
      <input ref={input} className="sr-only" type="file" accept={preferredFormat === 'xlsx' ? '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : '.json,application/json'} onChange={onChoose} />
      {!result ? <button className="json-dropzone" onClick={() => input.current?.click()}><FileUp size={26} /><strong>Chọn tệp {preferredFormat === 'xlsx' ? '.xlsx' : '.json'}</strong><span>{preferredFormat === 'xlsx' ? 'Chỉ Open XML thuần; macro, công thức và external link sẽ bị chặn' : 'Tối đa 10 MB; cấu trúc và khoá nguy hiểm sẽ được kiểm tra'}</span></button> : <>
        <div className="selected-import">{result.format === 'xlsx' ? <FileSpreadsheet size={20} /> : <FileJson size={20} />}<div><strong>{result.filename}</strong><span>{result.errors.length ? 'Cần sửa lỗi trước khi import' : 'Đã đọc, kiểm tra bảo mật và cấu trúc'}</span></div><button className="secondary-button" onClick={() => input.current?.click()}>Chọn tệp khác</button></div>
        {summary && <div className="import-summary" aria-label="Tóm tắt import">
          <div><strong>{summary.profiles}</strong><span>Gia đình</span></div><div><strong>{summary.people}</strong><span>Thành viên</span></div><div><strong>{summary.relationships}</strong><span>Quan hệ</span></div><div><strong>{summary.media}</strong><span>Ảnh tham chiếu</span></div><div><strong>{summary.living}</strong><span>Còn sống</span></div><div><strong>{summary.deceased}</strong><span>Đã mất</span></div>
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
  const [preferredFormat, setPreferredFormat] = useState<'json' | 'xlsx'>('json')
  const [tab, setTab] = useState<'overview' | 'quality' | 'issues' | 'duplicates' | 'activity' | 'import_export'>('overview')
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
      setPreferredFormat('json')
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

  const openImport = (format: 'json' | 'xlsx') => { setPreferredFormat(format); setImportResult(undefined); setShowImport(true) }

  async function inviteMember() {
    if (!memberEmail.trim() || !props.onAddMember) return
    try { await props.onAddMember(memberEmail.trim(), memberRole); setMemberEmail(''); setMemberError(undefined) }
    catch (caught) { setMemberError(caught instanceof Error ? caught.message : 'Không thể mời thành viên.') }
  }

  return <div className="data-page">
    <header className="data-page-heading"><div><span className="eyebrow">Cài đặt / Dữ liệu</span><h2>Kho dữ liệu gia đình</h2><p>Một tệp JSON có thể đọc, tải xuống và mang theo — nằm trong Drive của chính bạn.</p></div><span className={`save-state save-${props.saveStatus}`}><i />{saveLabels[props.saveStatus]}</span></header>

    <nav className="data-tabs" aria-label="Các mục quản lý dữ liệu">{([['overview', 'Tổng quan'], ['quality', 'Chất lượng'], ['issues', 'Vấn đề'], ['duplicates', 'Trùng lặp'], ['activity', 'Hoạt động'], ['import_export', 'Import / Export']] as const).map(([value, label]) => <button className={tab === value ? 'active' : ''} onClick={() => setTab(value)} key={value}>{label}</button>)}</nav>

    {tab === 'overview' ? <>
    <section className="workspace-ledger">
      <div className="workspace-ledger-title"><Database size={20} /><div><strong>{props.workspace?.name ?? 'Famnesia'}</strong><span>{props.mock ? 'Workspace mô phỏng khi phát triển' : `Workspace Google Drive · quyền ${props.workspace?.role ?? 'đang tải'}`}</span></div>{props.workspace?.rootFolderUrl && <a className="secondary-button" href={props.workspace.rootFolderUrl} target="_blank" rel="noreferrer"><FolderOpen size={15} /> Mở thư mục Drive</a>}</div>
      <div className="workspace-files"><div className="is-primary"><FileJson /><strong>family.json</strong><span>Nguồn dữ liệu chính</span></div><div><Archive /><strong>backups/</strong><span>Bản sao trước thay đổi lớn</span></div><div><Image /><strong>photos/</strong><span>Ảnh lưu riêng, JSON chỉ giữ ID</span></div></div>
    </section>

    <div className="data-actions-grid">
      <section className="data-action-panel primary-data-panel"><span className="section-label">Di chuyển dữ liệu</span><h3>JSON và Excel</h3><p>Mọi định dạng đều đi qua cùng pipeline bảo mật, schema và kiểm tra gia phả.</p><button className="secondary-button" onClick={() => setTab('import_export')}><FileUp size={16} /> Mở Import / Export</button></section>
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
    </> : null}

    {tab === 'import_export' ? <section className="portability-center"><header><span className="eyebrow">Data portability</span><h3>Mang dữ liệu theo cách phù hợp</h3><p>JSON giữ toàn bộ mô hình Famnesia. Excel dành cho nhập liệu và chỉnh sửa hàng loạt; ảnh vẫn nằm riêng trong Google Drive.</p></header><div className="portability-grid"><article><FileJson /><h4>JSON chuẩn Famnesia</h4><p>Backup/migration đầy đủ schema, profile, thành viên, quan hệ, cài đặt và tham chiếu ảnh.</p><div>{(props.mock || props.workspace?.role === 'owner') ? <button className="primary-button" onClick={() => openImport('json')}><FileUp size={15} /> Import JSON</button> : null}<button className="secondary-button" onClick={() => downloadFamilyData(props.data)}><Download size={15} /> Export JSON</button><button className="secondary-button" onClick={downloadFamilyDataTemplate}>Tải JSON mẫu</button></div></article><article><FileSpreadsheet /><h4>Excel cho chỉnh sửa hàng loạt</h4><p>Workbook `.xlsx` gồm README, profiles, persons, relationships và media; không nhận macro hoặc công thức.</p><div>{(props.mock || props.workspace?.role === 'owner') ? <button className="primary-button" onClick={() => openImport('xlsx')}><FileUp size={15} /> Import Excel</button> : null}<button className="secondary-button" onClick={() => downloadFamilyDataExcel(props.data)}><Download size={15} /> Export Excel</button><button className="secondary-button" onClick={downloadFamilyDataExcelTemplate}>Tải Excel mẫu</button></div></article></div><div className="import-security-contract"><ShieldCheck /><div><strong>File bên ngoài luôn được coi là không tin cậy</strong><p>Kiểm tra loại file, chữ ký ZIP, kích thước, độ phức tạp, macro/OLE/external link, công thức, schema, ID và vòng lặp tổ tiên. Import lỗi không ghi đè family.json.</p></div></div></section> : null}
    {(tab === 'quality' || tab === 'issues' || tab === 'duplicates') ? <DataQualityCenter data={props.data} mode={tab} canEdit={props.mock || Boolean(props.workspace?.canEdit)} onOpenPerson={props.onOpenPerson} onSuppressDuplicate={props.onSuppressDuplicate} onMerge={props.onMergePeople} /> : null}
    {tab === 'activity' ? <ActivityTimeline events={props.activity ?? []} /> : null}

    {showImport && <ImportDialog result={importResult} busy={readingFile ? 'Đang đọc tệp…' : props.busy} preferredFormat={preferredFormat} onChoose={(event) => void chooseFile(event)} onClose={() => { setShowImport(false); setImportResult(undefined) }} onConfirm={confirmImport} />}
  </div>
}
