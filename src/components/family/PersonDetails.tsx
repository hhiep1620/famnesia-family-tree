import { CakeSlice, CalendarDays, Compass, Edit3, Flower2, MapPin, Network, NotebookText, Phone, Plus, Trash2, UserRoundCheck, X } from 'lucide-react'
import { useMemo } from 'react'
import { calculateAge, formatFamilyDate, todayInFamilyTimezone } from '../../calendar/dateUtils'
import { getUpcomingFamilyEvents } from '../../calendar/familyCalendar'
import { buildFamilyGraph } from '../../graph/familyGraph'
import { getChildren, getParents, getSiblings, getSpouses } from '../../graph/familySelectors'
import { useDriveImage } from '../../hooks/useDriveImage'
import { explainKinshipPath } from '../../kinship/kinshipEngine'
import { SPOUSE_STATUS_LABELS } from '../../kinship/kinshipRules'
import { getPrimaryMedia, getPersonMedia } from '../../media/mediaSelectors'
import type { FactConfidence, KinshipResult, Person, PersonMedia, Relationship } from '../../types/family'
import { getInitials } from '../../utils/initials'
import { ManageRelationships } from './ManageRelationships'
import { PhotoGallery } from './PhotoGallery'

interface Props {
  person: Person
  persons: Person[]
  relationships: Relationship[]
  media: PersonMedia[]
  workspaceId?: string
  readOnly?: boolean
  busy?: boolean
  subjectId?: string
  kinship?: KinshipResult
  context?: 'tree' | 'calendar'
  onClose: () => void
  onSelect: (id: string) => void
  onSetSubject: (id: string) => void
  onViewCalendar: (personId: string) => void
  onViewTree: (personId: string) => void
  onExploreRelatives: (personId: string) => void
  onAddRelative: () => void
  onEdit: () => void
  onAddRelationship: (input: Omit<Relationship, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  onUpdateRelationship: (relationship: Relationship) => Promise<void>
  onDeleteRelationship: (id: string) => Promise<void>
  onDeletePerson: () => Promise<void>
  onAddMedia: (personId: string, files: File[]) => Promise<void>
  onSetPrimaryMedia: (mediaId: string) => Promise<void>
  onUpdateMediaCaption: (mediaId: string, caption: string) => Promise<void>
  onDeleteMedia: (mediaId: string) => Promise<void>
}

const genderLabels = { male: 'Nam', female: 'Nữ', other: 'Khác', unknown: 'Không xác định' }
const confidenceLabels: Record<FactConfidence, string> = { confirmed: 'đã xác nhận', likely: 'có khả năng đúng', estimated: 'ước tính', unknown: 'chưa rõ' }

export function PersonDetails(props: Props) {
  const { person, persons, relationships, workspaceId } = props
  const graph = useMemo(() => buildFamilyGraph(persons, relationships), [persons, relationships])
  const groups = [['Cha mẹ', getParents(graph, person.id)], ['Bạn đời / bạn đời cũ', getSpouses(graph, person.id)], ['Con', getChildren(graph, person.id)], ['Anh chị em', getSiblings(graph, person.id)]] as const
  const references = relationships.filter((relationship) => relationship.person1Id === person.id || relationship.person2Id === person.id)
  const parentCount = relationships.filter((relationship) => relationship.type === 'parent' && relationship.person2Id === person.id).length
  const spouseCount = relationships.filter((relationship) => relationship.type === 'spouse' && (relationship.person1Id === person.id || relationship.person2Id === person.id)).length
  const childCount = relationships.filter((relationship) => relationship.type === 'parent' && relationship.person1Id === person.id).length
  const today = todayInFamilyTimezone()
  const events = getUpcomingFamilyEvents([person], 183, 'all', today).slice(0, 2)
  const age = person.isDeceased ? undefined : calculateAge(person.birthDate ?? undefined, today)
  const personMedia = getPersonMedia(props.media, person.id)
  const primaryMedia = getPrimaryMedia(props.media, person.id)
  const { url } = useDriveImage(workspaceId, primaryMedia?.driveFileId)

  const relationshipSuffix = (member: Person) => {
    const relationship = relationships.find((item) => item.type === 'spouse' && ((item.person1Id === person.id && item.person2Id === member.id) || (item.person2Id === person.id && item.person1Id === member.id)))
    return relationship ? SPOUSE_STATUS_LABELS[relationship.status ?? 'unknown'] : undefined
  }

  return <aside className="person-details" aria-label={`Chi tiết ${person.name}`}>
    <div className="sheet-handle" /><button className="details-close icon-button" onClick={props.onClose} aria-label="Đóng chi tiết"><X size={18} /></button>
    <div className="details-identity"><div className={`details-portrait ${person.isDeceased ? 'is-deceased' : ''}`}>{url ? <img src={url} alt="" /> : <span>{getInitials(person.name)}</span>}</div><span className="eyebrow">{person.id}</span><h2>{person.name}</h2>{person.nickname && <p className="details-nickname">“{person.nickname}”</p>}{props.kinship && <span className={`details-kinship ${props.kinship.confidence}`}>{props.kinship.label}</span>}</div>
    {!props.readOnly && <div className="details-actions"><button className="primary-button" disabled={props.busy} onClick={props.onAddRelative}><Plus size={16} /> Thêm người thân</button><button className="secondary-button" disabled={props.busy} onClick={props.onEdit}><Edit3 size={15} /> Sửa</button></div>}
    <div className="context-actions">{props.subjectId === person.id ? <span className="current-subject"><UserRoundCheck size={15} /> Chủ thể hồ sơ</span> : !props.readOnly && <button disabled={props.busy} onClick={() => props.onSetSubject(person.id)}><UserRoundCheck size={15} /> Đặt làm tôi</button>}{props.context === 'calendar' ? <button onClick={() => props.onViewTree(person.id)}><Network size={15} /> Xem trên cây</button> : <><button onClick={() => props.onViewTree(person.id)}><Network size={15} /> Mở nhánh gia đình</button>{events.length > 0 && <button onClick={() => props.onViewCalendar(person.id)}><CalendarDays size={15} /> Xem lịch</button>}</>}<button onClick={() => props.onExploreRelatives(person.id)}><Compass size={15} /> Khám phá họ hàng</button></div>

    <section className="profile-facts"><span className="section-label">Hồ sơ</span><dl><div><dt>Giới tính</dt><dd>{genderLabels[person.gender ?? 'unknown']}</dd></div>{person.birthDate && <div><dt>Ngày sinh</dt><dd>{formatFamilyDate(person.birthDate)}{age !== undefined && ` · ${age} tuổi`}{person.confidence?.birthDate ? <small className="fact-confidence">{confidenceLabels[person.confidence.birthDate]}</small> : null}</dd></div>}{person.isDeceased && person.deathDate && <div><dt>Ngày mất</dt><dd>{formatFamilyDate(person.deathDate)}{person.confidence?.deathDate ? <small className="fact-confidence">{confidenceLabels[person.confidence.deathDate]}</small> : null}</dd></div>}{person.isDeceased && person.deathLunar && <div><dt>Ngày giỗ</dt><dd>{person.deathLunar.day}/{person.deathLunar.month} Âm lịch{person.deathLunar.leapMonth ? ' · tháng nhuận' : ''}</dd></div>}{person.ancestralRole === 'founding_ancestor' && <div><dt>Vai trò gia phả</dt><dd>Thủy tổ</dd></div>}</dl></section>

    {(person.phone1 || person.phone2 || person.address || person.note) && <section className="contact-facts"><span className="section-label">Liên hệ & ghi chú</span><div className="contact-list">{[person.phone1, person.phone2].filter(Boolean).map((phone, index) => <a key={`${phone}-${index}`} href={`tel:${phone!.replace(/[^+\d]/g, '')}`}><Phone size={14} /><span>{phone}</span></a>)}{person.address && <p><MapPin size={14} /><span>{person.address}</span></p>}{person.note && <p><NotebookText size={14} /><span>{person.note}</span></p>}</div></section>}

    <PhotoGallery personName={person.name} media={personMedia} workspaceId={workspaceId} readOnly={props.readOnly} busy={props.busy} onAdd={(files) => props.onAddMedia(person.id, files)} onSetPrimary={props.onSetPrimaryMedia} onUpdateCaption={props.onUpdateMediaCaption} onDelete={props.onDeleteMedia} />

    {props.kinship && <section className="kinship-explanation"><span className="section-label">Quan hệ với chủ thể</span><strong>{props.kinship.label}</strong><p>{explainKinshipPath(props.kinship)}</p>{props.kinship.confidence === 'generic' && <small>Nhãn khái quát do còn thiếu giới tính hoặc thứ tự sinh.</small>}</section>}

    {events.length > 0 && <section className="person-upcoming"><span className="section-label">Sự kiện sắp tới</span>{events.map((event) => <button key={event.id} onClick={() => props.onViewCalendar(person.id)}>{event.type === 'birthday' ? <CakeSlice size={15} /> : <Flower2 size={15} />}<span>{event.type === 'birthday' ? 'Sinh nhật' : `Giỗ ${event.lunarDate?.day}/${event.lunarDate?.month} Âm lịch`}</span><time>{formatFamilyDate(event.date)}</time></button>)}</section>}

    <div className="relationship-summary">{groups.map(([label, members]) => <section key={label}><span className="section-label">{label}</span>{members.length ? <div className="people-chips">{members.map((member) => <button key={member.id} onClick={() => props.onSelect(member.id)}>{member.name}{relationshipSuffix(member) && <small>{relationshipSuffix(member)}</small>}</button>)}</div> : <p>Chưa ghi nhận</p>}</section>)}</div>
    {!props.readOnly && <ManageRelationships person={person} persons={persons} relationships={relationships} onAdd={props.onAddRelationship} onUpdate={props.onUpdateRelationship} onDelete={props.onDeleteRelationship} busy={props.busy} />}
    {!props.readOnly && <div className="danger-zone"><button className="danger-button" disabled={props.busy} onClick={() => { if (window.confirm(`Xóa ${person.name}, ${references.length} quan hệ và ${personMedia.length} ảnh trong hồ sơ? Không thể hoàn tác.`)) void props.onDeletePerson() }}><Trash2 size={15} /> Xóa thành viên</button>{references.length > 0 && <p>Thao tác này sẽ tự xóa {parentCount} quan hệ cha/mẹ, {spouseCount} quan hệ bạn đời và {childCount} quan hệ với con.</p>}</div>}
  </aside>
}
