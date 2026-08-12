import { FolderHeart, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'

interface Props {
  busy?: string
  onClose: () => void
  onCreate: (name: string, description: string) => Promise<unknown>
}

export function CreateProfileModal({ busy, onClose, onCreate }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string>()

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return setError('Hãy nhập tên gia đình.')
    try {
      await onCreate(name, description)
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể tạo gia đình.')
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="modal-card create-family-modal" role="dialog" aria-modal="true" aria-labelledby="create-family-title">
      <div className="modal-heading"><div><span className="eyebrow">Hồ sơ mới</span><h2 id="create-family-title">Tạo gia đình</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Đóng"><X size={19} /></button></div>
      <div className="create-family-intro"><FolderHeart size={24} /><p>Mỗi gia đình là một profile riêng trong cùng tệp <strong>family.json</strong>.</p></div>
      <form onSubmit={submit}>
        <label className="field"><span>Tên gia đình <b>*</b></span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Gia đình Nguyễn" /></label>
        <label className="field"><span>Mô tả</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Nhánh họ, quê quán hoặc ghi chú ngắn" rows={3} /></label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Hủy</button><button type="submit" className="primary-button" disabled={Boolean(busy)}>{busy ?? 'Tạo gia đình'}</button></div>
      </form>
    </section>
  </div>
}
