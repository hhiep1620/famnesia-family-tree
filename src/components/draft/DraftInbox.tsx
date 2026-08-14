import { AlertTriangle, Check, ChevronDown, Clock3, ExternalLink, GitPullRequestArrow, HardDriveDownload, RotateCw, ShieldCheck, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { operationReviewClosure } from '../../draft/familyOperations'
import type { DraftReviewRequest, MirrorSyncResult, ReviewDraft } from '../../types/collaboration'
import type { FamilyData } from '../../types/family'
import type { FamilyOperation } from '../../types/familyOperations'

const labels: Record<FamilyOperation['type'], string> = {
  'profile.create': 'Tạo gia đình', 'profile.update': 'Cập nhật gia đình', 'subject.set': 'Đổi chủ thể',
  'person.create': 'Thêm thành viên', 'person.update': 'Cập nhật thành viên', 'person.delete': 'Xóa thành viên',
  'relationship.create': 'Thêm quan hệ', 'relationship.update': 'Cập nhật quan hệ', 'relationship.delete': 'Xóa quan hệ',
  'media.attach': 'Thêm ảnh', 'media.primary.set': 'Đổi ảnh đại diện', 'media.caption.update': 'Sửa chú thích ảnh', 'media.delete': 'Xóa ảnh',
  'settings.duplicate_suppression.add': 'Bỏ cảnh báo trùng',
}

function operationTitle(operation: FamilyOperation, data: FamilyData): string {
  const value = operation.value as { name?: string; personId?: string; person1Id?: string; person2Id?: string } | undefined
  if (value?.name) return value.name
  const person = data.persons.find((item) => item.id === operation.entityId || item.id === value?.personId)
  if (person) return person.name
  if (value?.person1Id && value.person2Id) {
    return `${data.persons.find((item) => item.id === value.person1Id)?.name ?? value.person1Id} ↔ ${data.persons.find((item) => item.id === value.person2Id)?.name ?? value.person2Id}`
  }
  return operation.entityId ?? 'Dữ liệu gia đình'
}

function changeDetail(operation: FamilyOperation): string {
  const fields = Object.keys(operation.changes ?? {})
  if (fields.length) return fields.join(' · ')
  if (operation.type.endsWith('.create')) return 'Bản ghi mới'
  if (operation.type.endsWith('.delete')) return 'Xóa cùng dữ liệu liên quan'
  return 'Thay đổi cấu trúc'
}

function DraftReviewDialog({ draft, data, workspaceId, onClose, onReview }: { draft: ReviewDraft; data: FamilyData; workspaceId: string; onClose: () => void; onReview: (request: DraftReviewRequest) => Promise<unknown> }) {
  const [selected, setSelected] = useState(() => new Set(draft.operations.map((operation) => operation.id)))
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const effectiveIds = useMemo(() => operationReviewClosure(draft.operations, [...selected], decision), [decision, draft.operations, selected])
  const automatic = effectiveIds.filter((id) => !selected.has(id))
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const submit = async () => {
    if (!effectiveIds.length || (decision === 'reject' && !note.trim())) return
    setSaving(true)
    try { await onReview({ draftId: draft.id, draftRevision: draft.revision, decision, operationIds: [...selected], note: note.trim() || undefined }); onClose() }
    finally { setSaving(false) }
  }
  return <div className="modal-backdrop draft-modal-backdrop" role="presentation">
    <section className="draft-inbox-dialog" role="dialog" aria-modal="true" aria-labelledby="draft-inbox-review-title">
      <header><div><span className="eyebrow"><GitPullRequestArrow size={14} /> Revision {draft.revision}</span><h2 id="draft-inbox-review-title">Đề xuất của {draft.author.name}</h2><p>{draft.author.email} · {new Date(draft.updatedAt).toLocaleString('vi-VN')}</p></div><button className="icon-button" onClick={onClose} aria-label="Đóng"><X size={18} /></button></header>
      <div className="draft-review-toolbar"><button className={decision === 'approve' ? 'selected' : ''} onClick={() => setDecision('approve')}><Check size={16} /> Duyệt phần đã chọn</button><button className={decision === 'reject' ? 'selected reject' : ''} onClick={() => setDecision('reject')}><X size={16} /> Từ chối phần đã chọn</button><button onClick={() => setSelected(new Set(draft.operations.map((operation) => operation.id)))}>Chọn tất cả</button><button onClick={() => setSelected(new Set())}>Bỏ chọn</button></div>
      <div className="draft-review-stream">{draft.operations.map((operation) => {
        const checked = selected.has(operation.id); const included = effectiveIds.includes(operation.id)
        const photoValue = operation.value as { fileId?: string; driveFileId?: string } | undefined
        const photoId = operation.type === 'media.attach' ? photoValue?.fileId ?? photoValue?.driveFileId : undefined
        return <label className={`${checked ? 'selected' : ''} ${included && !checked ? 'dependency' : ''}`} key={operation.id}><input type="checkbox" checked={checked} onChange={() => toggle(operation.id)} /><span className="draft-change-line" /><span className="draft-change-main">{photoId ? <img className="draft-review-photo" src={`/api/workspaces/${encodeURIComponent(workspaceId)}/photos/${encodeURIComponent(photoId)}`} alt="Ảnh chờ duyệt" /> : null}<span className="draft-change-copy"><small>{labels[operation.type]}</small><strong>{operationTitle(operation, data)}</strong><em>{changeDetail(operation)} · {new Date(operation.createdAt).toLocaleString('vi-VN')}</em></span></span>{included && !checked ? <b>Tự kèm</b> : null}</label>
      })}</div>
      <footer><div className="review-dependency-note">{automatic.length ? <><AlertTriangle size={15} /> Famnesia tự kèm {automatic.length} thay đổi phụ thuộc để cây vẫn hợp lệ.</> : <><ShieldCheck size={15} /> {effectiveIds.length} thay đổi sẽ được xử lý.</>}</div><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={decision === 'reject' ? 'Lý do từ chối (bắt buộc)' : 'Ghi chú cho editor (không bắt buộc)'} /><button className={decision === 'reject' ? 'danger-button' : 'primary-button'} disabled={saving || !effectiveIds.length || (decision === 'reject' && !note.trim())} onClick={() => void submit()}>{saving ? 'Đang xử lý…' : decision === 'approve' ? `Duyệt ${effectiveIds.length} thay đổi` : `Từ chối ${effectiveIds.length} thay đổi`}</button></footer>
    </section>
  </div>
}

export function DraftInbox({ drafts, data, workspaceId, onReview }: { drafts: ReviewDraft[]; data: FamilyData; workspaceId: string; onReview: (request: DraftReviewRequest) => Promise<unknown> }) {
  const [reviewing, setReviewing] = useState<ReviewDraft>()
  const active = drafts.filter((draft) => !['approved', 'rejected', 'invalid'].includes(draft.status))
  return <section className="draft-inbox-panel"><header><div><span className="section-label">Approval flow</span><h3><GitPullRequestArrow size={19} /> Hộp thư Draft</h3><p>Đề xuất chỉ trở thành dữ liệu chính thức sau khi owner duyệt.</p></div><span className="draft-inbox-count">{active.length}</span></header>
    <div className="draft-inbox-list">{drafts.length ? drafts.map((draft) => <article key={draft.id}><div className="draft-author-seal">{draft.author.name.slice(0, 1).toUpperCase()}</div><div><strong>{draft.author.name}</strong><span>{draft.operationCount} thay đổi · revision {draft.revision}</span><small><Clock3 size={12} /> {new Date(draft.updatedAt).toLocaleString('vi-VN')}</small></div><span className={`draft-status ${draft.status}`}>{draft.status.replace('_', ' ')}</span>{!['approved', 'rejected', 'invalid'].includes(draft.status) ? <button className="secondary-button" onClick={() => setReviewing(draft)}>Mở hồ sơ <ChevronDown size={14} /></button> : null}</article>) : <div className="draft-inbox-empty"><ShieldCheck /><strong>Không có Draft đang chờ</strong><span>Đề xuất mới từ editor sẽ xuất hiện tại đây.</span></div>}</div>
    {reviewing ? <DraftReviewDialog draft={reviewing} data={data} workspaceId={workspaceId} onClose={() => setReviewing(undefined)} onReview={onReview} /> : null}
  </section>
}

export function MirrorStatusCard({ status, mirror, onRetry }: { status?: { status: string; syncedGeneration: number; generation: number; lastSyncedAt?: string; mirrorFolderUrl?: string; error?: string }; mirror?: MirrorSyncResult; onRetry: () => Promise<unknown> }) {
  if (!status && !mirror) return null
  const current = mirror?.status ?? status?.status ?? 'pending'
  return <section className="mirror-status-card"><HardDriveDownload /><div><span className="section-label">Drive mirror</span><h3>{current === 'synced' ? 'Bản sao đã đồng bộ' : current === 'failed' ? 'Mirror cần thử lại' : 'Đang chờ đồng bộ'}</h3><p>{status?.error ?? (status?.lastSyncedAt ? `Lần cuối ${new Date(status.lastSyncedAt).toLocaleString('vi-VN')}` : 'Famnesia lưu bản chính thức và ảnh vào Drive riêng của bạn.')}</p></div>{status?.mirrorFolderUrl ? <a className="icon-button" href={status.mirrorFolderUrl} target="_blank" rel="noreferrer" aria-label="Mở Drive mirror"><ExternalLink size={16} /></a> : null}<button className="secondary-button" onClick={() => void onRetry()}><RotateCw size={15} /> Đồng bộ</button></section>
}
