import { CalendarSync, Camera, Check, X } from 'lucide-react'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { convertSolarToLunar } from '../../calendar/lunarCalendar'
import { buildFamilyGraph } from '../../graph/familyGraph'
import { getCurrentSpouses } from '../../graph/familySelectors'
import type { NewPersonConnection } from '../../hooks/useFamilyData'
import type { FriendlyRelationship, Gender, Person, PersonDraft, Relationship, SpouseStatus } from '../../types/family'

interface Props {
  mode: 'add' | 'relative' | 'edit'
  persons: Person[]
  relationships: Relationship[]
  person?: Person
  initialKind?: FriendlyRelationship
  busy?: string
  onClose: () => void
  onCreate?: (draft: PersonDraft, connection?: NewPersonConnection) => Promise<unknown>
  onUpdate?: (draft: PersonDraft) => Promise<unknown>
}

const relationshipLabels: Record<FriendlyRelationship, string> = { child: 'Con của', parent: 'Cha/mẹ của', spouse: 'Bạn đời của' }

export function PersonModal({ mode, persons, relationships, person, initialKind = 'child', busy, onClose, onCreate, onUpdate }: Props) {
  const graph = useMemo(() => buildFamilyGraph(persons, relationships), [persons, relationships])
  const spouses = person ? getCurrentSpouses(graph, person.id) : []
  const [name, setName] = useState(mode === 'edit' ? person?.name ?? '' : '')
  const [nickname, setNickname] = useState(mode === 'edit' ? person?.nickname ?? '' : '')
  const [gender, setGender] = useState<Gender>(mode === 'edit' ? person?.gender ?? 'unknown' : 'unknown')
  const [birthDate, setBirthDate] = useState(mode === 'edit' ? person?.birthDate ?? '' : '')
  const [isDeceased, setIsDeceased] = useState(mode === 'edit' ? person?.isDeceased ?? false : false)
  const [deathDate, setDeathDate] = useState(mode === 'edit' ? person?.deathDate ?? '' : '')
  const [lunarDay, setLunarDay] = useState(mode === 'edit' ? person?.deathLunar?.day.toString() ?? '' : '')
  const [lunarMonth, setLunarMonth] = useState(mode === 'edit' ? person?.deathLunar?.month.toString() ?? '' : '')
  const [lunarLeap, setLunarLeap] = useState(mode === 'edit' ? person?.deathLunar?.leapMonth ?? false : false)
  const [foundingAncestor, setFoundingAncestor] = useState(mode === 'edit' ? person?.ancestralRole === 'founding_ancestor' : false)
  const [sortOrder, setSortOrder] = useState(mode === 'edit' ? person?.sortOrder?.toString() ?? '' : '')
  const [phone1, setPhone1] = useState(mode === 'edit' ? person?.phone1 ?? '' : '')
  const [phone2, setPhone2] = useState(mode === 'edit' ? person?.phone2 ?? '' : '')
  const [address, setAddress] = useState(mode === 'edit' ? person?.address ?? '' : '')
  const [note, setNote] = useState(mode === 'edit' ? person?.note ?? '' : '')
  const [photos, setPhotos] = useState<File[]>([])
  const [kind, setKind] = useState<FriendlyRelationship | 'none'>(mode === 'add' ? 'none' : initialKind)
  const [spouseStatus, setSpouseStatus] = useState<SpouseStatus>('unknown')
  const [relatedId, setRelatedId] = useState(mode === 'relative' ? person?.id ?? '' : '')
  const [extraParents, setExtraParents] = useState<string[]>(mode === 'relative' && initialKind === 'child' ? spouses.map((spouse) => spouse.id) : [])
  const [localError, setLocalError] = useState<string>()
  const submittingRef = useRef(false)
  const [submitting, setSubmitting] = useState(false)

  function calculateLunarDate() {
    const lunar = convertSolarToLunar(deathDate)
    if (!lunar) return setLocalError('Ngày mất dương lịch chưa hợp lệ.')
    setLunarDay(String(lunar.day)); setLunarMonth(String(lunar.month)); setLunarLeap(lunar.leapMonth); setLocalError(undefined)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submittingRef.current || busy) return
    if (!name.trim()) return setLocalError('Hãy nhập họ tên.')
    if ((lunarDay && !lunarMonth) || (!lunarDay && lunarMonth)) return setLocalError('Ngày và tháng âm lịch cần được nhập cùng nhau.')
    const draft: PersonDraft = {
      name: name.trim(), nickname: nickname.trim() || undefined, gender,
      birthDate: birthDate || undefined, isDeceased,
      deathDate: isDeceased && deathDate ? deathDate : undefined,
      deathLunarDay: isDeceased && lunarDay ? Number(lunarDay) : undefined,
      deathLunarMonth: isDeceased && lunarMonth ? Number(lunarMonth) : undefined,
      deathLunarLeapMonth: isDeceased && lunarLeap,
      ancestralRole: foundingAncestor ? 'founding_ancestor' : 'none',
      sortOrder: sortOrder ? Number(sortOrder) : undefined,
      phone1: phone1.trim() || undefined,
      phone2: phone2.trim() || undefined,
      address: address.trim() || undefined,
      note: note.trim() || undefined,
      photos,
    }
    setLocalError(undefined)
    submittingRef.current = true
    setSubmitting(true)
    try {
      if (mode === 'edit') await onUpdate?.(draft)
      else {
        const ids = mode === 'relative' && kind === 'child' ? [person!.id, ...extraParents] : relatedId ? [relatedId] : []
        const connection = kind === 'none' || !ids.length ? undefined : { kind, relatedPersonIds: ids, spouseStatus } as NewPersonConnection
        await onCreate?.(draft, connection)
      }
      onClose()
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : 'Không thể lưu thành viên này.')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const title = mode === 'edit' ? 'Chỉnh sửa hồ sơ' : mode === 'relative' ? `Thêm người thân của ${person?.name}` : 'Thêm thành viên'

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="modal-card profile-modal" role="dialog" aria-modal="true" aria-labelledby="person-modal-title">
        <div className="modal-heading"><div><span className="eyebrow">Hồ sơ gia đình</span><h2 id="person-modal-title">{title}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Đóng"><X size={19} /></button></div>
        <form onSubmit={submit}>
          <fieldset className="form-section"><legend>Thông tin cơ bản</legend>
            <div className="form-grid two-columns">
              <label className="field field-wide"><span>Họ và tên <b>*</b></span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Nguyễn Văn Minh" /></label>
              <label className="field"><span>Biệt danh</span><input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Bé Minh, Ông Ba…" /></label>
              <label className="field"><span>Giới tính</span><select value={gender} onChange={(event) => setGender(event.target.value as Gender)}><option value="unknown">Không xác định</option><option value="male">Nam</option><option value="female">Nữ</option><option value="other">Khác</option></select></label>
              <label className="field"><span>Ngày sinh dương lịch</span><input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} /></label>
              <label className="field"><span>Thứ tự trong anh chị em</span><input type="number" min="0" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} placeholder="Ví dụ: 1" /></label>
            </div>
          </fieldset>

          <fieldset className="form-section"><legend>Liên hệ</legend>
            <div className="form-grid two-columns">
              <label className="field"><span>Số điện thoại chính</span><input type="tel" inputMode="tel" value={phone1} onChange={(event) => setPhone1(event.target.value)} placeholder="090 123 4567" /></label>
              <label className="field"><span>Số điện thoại khác</span><input type="tel" inputMode="tel" value={phone2} onChange={(event) => setPhone2(event.target.value)} placeholder="Số nhà, cơ quan…" /></label>
              <label className="field field-wide"><span>Địa chỉ</span><textarea rows={2} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Nơi ở hiện tại hoặc quê quán" /></label>
              <label className="field field-wide"><span>Ghi chú</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Thông tin giúp gia đình dễ nhớ về người này" /></label>
            </div>
          </fieldset>

          <fieldset className="form-section"><legend>Thông tin gia phả</legend>
            <label className="toggle-row"><input type="checkbox" checked={isDeceased} onChange={(event) => setIsDeceased(event.target.checked)} /><span><strong>Đã mất</strong><small>Mở phần ngày mất và ngày giỗ</small></span></label>
            {isDeceased && <div className="deceased-fields">
              <label className="field"><span>Ngày mất dương lịch</span><input type="date" value={deathDate} onChange={(event) => setDeathDate(event.target.value)} /></label>
              <div className="lunar-group"><div className="lunar-heading"><span>Ngày giỗ âm lịch</span><button type="button" onClick={calculateLunarDate} disabled={!deathDate}><CalendarSync size={15} /> Tính từ ngày dương</button></div><div className="lunar-inputs"><label className="field"><span>Ngày</span><input type="number" min="1" max="30" value={lunarDay} onChange={(event) => setLunarDay(event.target.value)} /></label><label className="field"><span>Tháng</span><input type="number" min="1" max="12" value={lunarMonth} onChange={(event) => setLunarMonth(event.target.value)} /></label><label className="check-row lunar-leap"><input type="checkbox" checked={lunarLeap} onChange={(event) => setLunarLeap(event.target.checked)} /> Tháng nhuận</label></div></div>
            </div>}
            <label className="toggle-row compact"><input type="checkbox" checked={foundingAncestor} onChange={(event) => setFoundingAncestor(event.target.checked)} /><span><strong>Thủy tổ</strong><small>Người khai sinh dòng họ theo gia phả</small></span></label>
          </fieldset>

          <fieldset className="form-section"><legend>Thư viện ảnh</legend>
            <label className="field photo-field"><div className="file-control"><Camera size={18} /><span>{photos.length ? `Đã chọn ${photos.length} ảnh` : 'Chọn một hoặc nhiều ảnh'}</span><input type="file" accept="image/*" multiple onChange={(event) => setPhotos(Array.from(event.target.files ?? []))} /></div></label>
            <small className="field-help">Ảnh đầu tiên sẽ là ảnh đại diện nếu người này chưa có ảnh. Bạn có thể đổi ảnh đại diện, chú thích hoặc xóa ảnh trong hồ sơ chi tiết.</small>
          </fieldset>

          {mode !== 'edit' && <fieldset className="form-section"><legend>Kết nối gia đình</legend><div className="connection-fields">
            <label className="field"><span>Quan hệ</span><select value={kind} onChange={(event) => setKind(event.target.value as FriendlyRelationship | 'none')}>{mode === 'add' && <option value="none">Chưa kết nối</option>}{Object.entries(relationshipLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            {mode === 'add' && kind !== 'none' && <label className="field"><span>Người liên quan</span><select value={relatedId} onChange={(event) => setRelatedId(event.target.value)} required><option value="">Chọn một người</option>{persons.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>}
            {kind === 'spouse' && <label className="field"><span>Trạng thái</span><select value={spouseStatus} onChange={(event) => setSpouseStatus(event.target.value as SpouseStatus)}><option value="unknown">Chưa xác định</option><option value="married">Đã kết hôn</option><option value="partner">Bạn đời</option><option value="separated">Ly thân</option><option value="divorced">Đã ly hôn</option><option value="widowed">Góa</option></select></label>}
            {mode === 'relative' && kind === 'child' && spouses.length > 0 && <fieldset className="parent-choice"><legend>Cha mẹ</legend><label className="parent-pill is-locked"><Check size={15} />{person?.name}</label>{spouses.map((spouse) => <label className="parent-pill" key={spouse.id}><input type="checkbox" checked={extraParents.includes(spouse.id)} onChange={(event) => setExtraParents((current) => event.target.checked ? [...current, spouse.id] : current.filter((id) => id !== spouse.id))} />{spouse.name}</label>)}</fieldset>}
          </div></fieldset>}

          {localError && <p className="form-error">{localError}</p>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>Hủy</button><button type="submit" className="primary-button" disabled={submitting || Boolean(busy)}>{busy ?? (submitting ? 'Đang lưu hồ sơ…' : 'Lưu hồ sơ')}</button></div>
        </form>
      </section>
    </div>
  )
}
