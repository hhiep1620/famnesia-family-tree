import { Link2, Save, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { SPOUSE_STATUS_LABELS } from '../../kinship/kinshipRules'
import type { FactConfidence, FriendlyRelationship, Person, Relationship, SpouseStatus } from '../../types/family'

const confidenceLabels: Record<FactConfidence, string> = { confirmed: 'Đã xác nhận', likely: 'Có khả năng đúng', estimated: 'Ước tính', unknown: 'Chưa rõ' }

interface Props {
  person: Person
  persons: Person[]
  relationships: Relationship[]
  onAdd: (input: Omit<Relationship, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  onUpdate: (relationship: Relationship) => Promise<void>
  onDelete: (id: string) => Promise<void>
  busy?: boolean
}

interface RelationshipEditorProps { relationship: Relationship; otherName: string; onUpdate: Props['onUpdate']; onDelete: Props['onDelete']; busy?: boolean }

function RelationshipEditor({ relationship, otherName, onUpdate, onDelete, busy }: RelationshipEditorProps) {
  const [status, setStatus] = useState<SpouseStatus>(relationship.status ?? 'unknown')
  const [startDate, setStartDate] = useState(relationship.startDate ?? '')
  const [endDate, setEndDate] = useState(relationship.endDate ?? '')
  const [confidence, setConfidence] = useState<FactConfidence>(relationship.confidence ?? 'unknown')
  const spouse = relationship.type === 'spouse'
  return <div className={`relationship-record ${spouse ? `status-${status}` : ''}`}>
    <div className="relationship-row"><span>{otherName}</span>{spouse && <span className="relationship-status">{SPOUSE_STATUS_LABELS[relationship.status ?? 'unknown']}</span>}<button type="button" disabled={busy} aria-label={`Xóa quan hệ với ${otherName}`} onClick={() => { if (window.confirm('Xóa mối quan hệ này? Không ai bị xóa khỏi gia phả.')) void onDelete(relationship.id) }}><Trash2 size={14} /></button></div>
    <details className="relationship-edit"><summary>{spouse ? 'Chỉnh trạng thái và độ tin cậy' : 'Chỉnh độ tin cậy'}</summary><div className="relationship-edit-grid">{spouse ? <><label>Trạng thái<select disabled={busy} value={status} onChange={(event) => setStatus(event.target.value as SpouseStatus)}>{Object.entries(SPOUSE_STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Bắt đầu<input disabled={busy} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>Kết thúc<input disabled={busy} type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></> : null}<label>Độ tin cậy<select disabled={busy} value={confidence} onChange={(event) => setConfidence(event.target.value as FactConfidence)}>{Object.entries(confidenceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><button type="button" className="mini-save" disabled={busy} onClick={() => void onUpdate({ ...relationship, status: spouse ? status : undefined, startDate: spouse ? startDate || undefined : undefined, endDate: spouse ? endDate || undefined : undefined, confidence })}><Save size={13} /> Lưu</button></div></details>
  </div>
}

export function ManageRelationships({ person, persons, relationships, onAdd, onUpdate, onDelete, busy }: Props) {
  const [kind, setKind] = useState<FriendlyRelationship>('parent')
  const [otherId, setOtherId] = useState('')
  const [status, setStatus] = useState<SpouseStatus>('unknown')
  const [confidence, setConfidence] = useState<FactConfidence>('unknown')
  const [error, setError] = useState<string>()
  const groups = useMemo(() => ({
    'Cha mẹ': relationships.filter((item) => item.type === 'parent' && item.person2Id === person.id),
    'Bạn đời / bạn đời cũ': relationships.filter((item) => item.type === 'spouse' && (item.person1Id === person.id || item.person2Id === person.id)),
    'Con': relationships.filter((item) => item.type === 'parent' && item.person1Id === person.id),
  }), [person.id, relationships])
  const otherPerson = (relationship: Relationship) => persons.find((candidate) => candidate.id === (relationship.person1Id === person.id ? relationship.person2Id : relationship.person1Id))

  async function add(event: FormEvent) {
    event.preventDefault(); if (!otherId) return
    const input: Omit<Relationship, 'id' | 'createdAt' | 'updatedAt'> = kind === 'spouse'
      ? { person1Id: person.id, person2Id: otherId, type: 'spouse', status, confidence }
      : kind === 'parent' ? { person1Id: otherId, person2Id: person.id, type: 'parent', confidence } : { person1Id: person.id, person2Id: otherId, type: 'parent', confidence }
    try { await onAdd(input); setOtherId(''); setError(undefined) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể lưu mối quan hệ.') }
  }

  return <div className="relationship-manager">
    <span className="section-label">Quản lý quan hệ</span>
    {Object.entries(groups).map(([label, items]) => <div className="relationship-group" key={label}><h4>{label}</h4>{items.length ? items.map((relationship) => <RelationshipEditor key={relationship.id} relationship={relationship} otherName={otherPerson(relationship)?.name ?? 'Không tìm thấy'} onUpdate={onUpdate} onDelete={onDelete} busy={busy} />) : <p>Chưa ghi nhận</p>}</div>)}
    <form className="add-relationship" onSubmit={add}><div><Link2 size={16} /><strong>Thêm người đã có</strong></div><select disabled={busy} value={kind} onChange={(event) => setKind(event.target.value as FriendlyRelationship)}><option value="parent">làm cha/mẹ</option><option value="spouse">làm bạn đời</option><option value="child">làm con</option></select>{kind === 'spouse' && <select disabled={busy} value={status} onChange={(event) => setStatus(event.target.value as SpouseStatus)}>{Object.entries(SPOUSE_STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>}<select disabled={busy} value={confidence} onChange={(event) => setConfidence(event.target.value as FactConfidence)}>{Object.entries(confidenceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><select disabled={busy} required value={otherId} onChange={(event) => setOtherId(event.target.value)}><option value="">Chọn thành viên</option>{persons.filter((candidate) => candidate.id !== person.id).map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}</select><button className="secondary-button" type="submit" disabled={busy}>Thêm quan hệ</button>{error && <p className="form-error">{error}</p>}</form>
  </div>
}
