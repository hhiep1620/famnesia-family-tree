import { FolderHeart, Tags, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { normalizeLineageSurname } from '../../family/profileLineage'
import type { FamilyProfile } from '../../types/family'

interface Props {
  busy?: string
  mode?: 'create' | 'edit'
  profile?: FamilyProfile
  suggestedSurnames?: string[]
  onClose: () => void
  onSubmit: (name: string, description: string, lineageSurname: string) => Promise<unknown>
}

export function CreateProfileModal({ busy, mode = 'create', profile, suggestedSurnames = [], onClose, onSubmit }: Props) {
  const [name, setName] = useState(profile?.name ?? '')
  const [description, setDescription] = useState(profile?.description ?? '')
  const [lineageSurname, setLineageSurname] = useState(profile?.lineageSurname ?? '')
  const [error, setError] = useState<string>()
  const editing = mode === 'edit'

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return setError('Hãy nhập tên gia đình.')
    try {
      await onSubmit(name, description, normalizeLineageSurname(lineageSurname))
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : editing ? 'Không thể cập nhật gia đình.' : 'Không thể tạo gia đình.')
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="modal-card create-family-modal" role="dialog" aria-modal="true" aria-labelledby="family-profile-title">
      <div className="modal-heading"><div><span className="eyebrow">{editing ? 'Thông tin gia đình' : 'Hồ sơ mới'}</span><h2 id="family-profile-title">{editing ? 'Chỉnh sửa gia đình' : 'Tạo gia đình'}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Đóng"><X size={19} /></button></div>
      <div className="create-family-intro"><FolderHeart size={24} /><p>{editing ? 'Tên và nhóm gia tộc sẽ được cập nhật trong family.json.' : <>Mỗi gia đình là một profile riêng trong cùng tệp <strong>family.json</strong>.</>}</p></div>
      <form onSubmit={submit}>
        <label className="field"><span>Tên gia đình <b>*</b></span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Gia đình bác Hải" /></label>
        <label className="field"><span>Họ gia tộc</span><div className="lineage-surname-input"><Tags size={16} /><input value={lineageSurname} onChange={(event) => setLineageSurname(event.target.value)} placeholder="Ví dụ: Hoàng" /></div><small className="field-help">Dùng để nhóm nhiều gia đình dưới tên “Gia tộc họ Hoàng”.</small></label>
        {suggestedSurnames.length > 0 && <div className="surname-suggestions"><span>Gợi ý từ thành viên nam:</span>{suggestedSurnames.map((surname) => <button type="button" key={surname} onClick={() => setLineageSurname(surname)}>Họ {surname}</button>)}</div>}
        <label className="field"><span>Mô tả</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Nhánh họ, quê quán hoặc ghi chú ngắn" rows={3} /></label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Hủy</button><button type="submit" className="primary-button" disabled={Boolean(busy)}>{busy ?? (editing ? 'Cập nhật Draft' : 'Thêm vào Draft')}</button></div>
      </form>
    </section>
  </div>
}
