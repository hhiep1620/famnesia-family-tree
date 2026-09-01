import { AlertTriangle, Check, CloudOff, Eye, RotateCcw, Save, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FamilyData } from '../../types/family'
import type { FamilyCommitConflictDetails, FamilyOperation, FamilyOperationConflict, StoredFamilyDraft } from '../../types/familyOperations'

interface Props {
  operations: FamilyOperation[]
  data: FamilyData
  saving: boolean
  offline: boolean
  conflict?: FamilyCommitConflictDetails
  recovery?: { draft: StoredFamilyDraft; reason: string }
  onSave: () => Promise<boolean>
  onDiscard: () => Promise<void>
  onUndo: (operationId: string) => Promise<void>
  onResolve: (resolutions: Record<string, 'remote' | 'local'>) => Promise<boolean>
  onDownloadRecovery: () => void
  onDeleteRecovery: () => Promise<void>
}

const operationLabels: Record<FamilyOperation['type'], string> = {
  'profile.create': 'Tạo gia đình', 'profile.update': 'Cập nhật gia đình', 'subject.set': 'Đổi chủ thể',
  'person.create': 'Thêm thành viên', 'person.update': 'Cập nhật thành viên', 'person.delete': 'Xóa thành viên',
  'relationship.create': 'Thêm quan hệ', 'relationship.update': 'Cập nhật quan hệ', 'relationship.delete': 'Xóa quan hệ',
  'media.attach': 'Thêm ảnh', 'media.primary.set': 'Đổi ảnh đại diện', 'media.caption.update': 'Sửa chú thích ảnh', 'media.delete': 'Xóa ảnh',
  'settings.duplicate_suppression.add': 'Bỏ qua cảnh báo trùng',
}

function entityName(operation: FamilyOperation, data: FamilyData): string {
  const value = operation.value as { name?: string; personId?: string; person1Id?: string; person2Id?: string } | undefined
  if (value?.name) return value.name
  const person = data.persons.find((item) => item.id === operation.entityId || item.id === value?.personId)
  if (person) return person.name
  const relationship = data.relationships.find((item) => item.id === operation.entityId) ?? value
  if (relationship?.person1Id && relationship?.person2Id) {
    const left = data.persons.find((item) => item.id === relationship.person1Id)?.name ?? relationship.person1Id
    const right = data.persons.find((item) => item.id === relationship.person2Id)?.name ?? relationship.person2Id
    return `${left} ↔ ${right}`
  }
  return operation.entityId ?? ''
}

function conflictKey(conflict: FamilyOperationConflict): string { return `${conflict.operationId}:${conflict.field}` }
function displayValue(value: unknown): string {
  if (value === undefined) return 'Không có'
  if (value === null || value === '') return 'Để trống'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value, null, 2)
}

function ReviewDialog({ operations, data, onClose, onUndo }: Pick<Props, 'operations' | 'data' | 'onUndo'> & { onClose: () => void }) {
  return <div className="modal-backdrop draft-modal-backdrop" role="presentation">
    <section className="draft-dialog" role="dialog" aria-modal="true" aria-labelledby="draft-review-title">
      <header><div><span className="eyebrow">Draft cục bộ</span><h2 id="draft-review-title">Các thay đổi chưa lưu</h2><p>{operations.length} thay đổi sẽ được ghi cùng lúc vào dữ liệu gia đình.</p></div><button className="icon-button" onClick={onClose} aria-label="Đóng"><X size={18} /></button></header>
      <ol className="draft-operation-list">{operations.map((operation) => <li key={operation.id}><span className="draft-operation-index">{operationLabels[operation.type]}</span><div><strong>{entityName(operation, data)}</strong><small>{new Date(operation.createdAt).toLocaleString('vi-VN')}</small></div><button className="draft-undo" onClick={() => void onUndo(operation.id)}><RotateCcw size={14} /> Hoàn tác</button></li>)}</ol>
      <footer><button className="primary-button" onClick={onClose}>Xong</button></footer>
    </section>
  </div>
}

function ConflictDialog({ details, onResolve }: { details: FamilyCommitConflictDetails; onResolve: Props['onResolve'] }) {
  const [choices, setChoices] = useState<Record<string, 'remote' | 'local'>>(() => Object.fromEntries(details.conflicts.map((item) => [conflictKey(item), 'remote'])))
  const [saving, setSaving] = useState(false)
  const apply = async () => { setSaving(true); try { await onResolve(choices) } finally { setSaving(false) } }
  return <div className="modal-backdrop draft-modal-backdrop" role="presentation"><section className="draft-dialog conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
    <header><div><span className="eyebrow conflict-eyebrow"><AlertTriangle size={14} /> Cần bạn quyết định</span><h2 id="conflict-title">Xử lý {details.conflicts.length} xung đột</h2><p>Famnesia giữ nguyên Draft. Chọn dữ liệu mới nhất hoặc thay đổi của bạn cho từng mục.</p></div></header>
    <div className="conflict-list">{details.conflicts.map((item) => {
      const key = conflictKey(item); const localAllowed = item.reason === 'field_changed'
      return <article key={key}><h3>{operationLabels[item.operationType]} · {item.field.replace('$entity', 'toàn bộ bản ghi')}</h3><div className="conflict-choices"><label className={choices[key] === 'remote' ? 'selected' : ''}><input type="radio" name={key} checked={choices[key] === 'remote'} onChange={() => setChoices((current) => ({ ...current, [key]: 'remote' }))} /><span><small>Phiên bản mới nhất</small><strong>{displayValue(item.remoteValue)}</strong></span>{choices[key] === 'remote' && <Check size={16} />}</label><label className={`${choices[key] === 'local' ? 'selected' : ''} ${!localAllowed ? 'disabled' : ''}`}><input type="radio" name={key} disabled={!localAllowed} checked={choices[key] === 'local'} onChange={() => setChoices((current) => ({ ...current, [key]: 'local' }))} /><span><small>Thay đổi của bạn</small><strong>{displayValue(item.localValue)}</strong>{!localAllowed && <em>Không thể ghi đè an toàn cho xung đột này.</em>}</span>{choices[key] === 'local' && <Check size={16} />}</label></div></article>
    })}</div>
    <footer><button className="primary-button" disabled={saving} onClick={() => void apply()}>{saving ? 'Đang áp dụng…' : 'Áp dụng lựa chọn và lưu lại'}</button></footer>
  </section></div>
}

function RecoveryDialog({ recovery, onDownload, onDelete }: { recovery: NonNullable<Props['recovery']>; onDownload: () => void; onDelete: () => Promise<void> }) {
  return <div className="modal-backdrop draft-modal-backdrop" role="presentation"><section className="draft-dialog recovery-dialog" role="dialog" aria-modal="true"><header><div><span className="eyebrow"><AlertTriangle size={14} /> Khôi phục Draft</span><h2>Draft cần được kiểm tra</h2><p>{recovery.reason}</p></div></header><div className="recovery-summary"><strong>{recovery.draft.operations?.length ?? 0} thao tác</strong><span>Cập nhật lần cuối {new Date(recovery.draft.updatedAt).toLocaleString('vi-VN')}</span></div><footer><button className="secondary-button" onClick={onDownload}>Tải Draft khôi phục</button><button className="danger-button" onClick={() => void onDelete()}><Trash2 size={15} /> Xóa Draft</button></footer></section></div>
}

export function DraftWorkspaceControls(props: Props) {
  const [reviewing, setReviewing] = useState(false)
  const countText = useMemo(() => `${props.operations.length} thay đổi chưa lưu`, [props.operations.length])
  const discard = async () => { if (window.confirm('Hủy toàn bộ thay đổi trong Draft? family.json trên Drive sẽ không bị thay đổi.')) await props.onDiscard() }
  return <>
    {props.operations.length > 0 && <aside className="draft-save-bar" aria-live="polite"><div className="draft-save-state">{props.offline ? <CloudOff size={18} /> : <i />}<span><strong>{countText}</strong><small>{props.offline ? 'Ngoại tuyến · Draft đã lưu trên thiết bị' : props.saving ? 'Đang ghi một transaction…' : 'Chưa ghi vào dữ liệu chính thức'}</small></span></div><div className="draft-save-actions"><button onClick={() => setReviewing(true)}><Eye size={15} /> Xem thay đổi</button><button onClick={() => void discard()} disabled={props.saving}><RotateCcw size={15} /> Hủy Draft</button><button className="save-all-button" onClick={() => void props.onSave()} disabled={props.saving || props.offline}><Save size={16} /> {props.saving ? 'Đang gửi…' : 'Lưu tất cả'}</button></div></aside>}
    {reviewing && <ReviewDialog operations={props.operations} data={props.data} onUndo={props.onUndo} onClose={() => setReviewing(false)} />}
    {props.conflict && <ConflictDialog details={props.conflict} onResolve={async (resolutions) => { const done = await props.onResolve(resolutions); if (!done) return props.onSave(); return done }} />}
    {props.recovery && <RecoveryDialog recovery={props.recovery} onDownload={props.onDownloadRecovery} onDelete={props.onDeleteRecovery} />}
  </>
}
