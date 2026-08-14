import { Check, ExternalLink, ImagePlus, RotateCw, Star, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useMediaImage } from '../../hooks/useMediaImage'
import { mediaReferenceId } from '../../services/mediaReference'
import type { PersonMedia } from '../../types/family'

interface GalleryItemProps {
  item: PersonMedia
  workspaceId?: string
  readOnly?: boolean
  busy?: boolean
  onSetPrimary: (mediaId: string) => Promise<void>
  onUpdateCaption: (mediaId: string, caption: string) => Promise<void>
  onDelete: (mediaId: string) => Promise<void>
}

function GalleryItem({ item, workspaceId, readOnly, busy, onSetPrimary, onUpdateCaption, onDelete }: GalleryItemProps) {
  const { url, loading } = useMediaImage(workspaceId, mediaReferenceId(item), 'original')
  const [caption, setCaption] = useState(item.caption ?? '')

  return <article className={`gallery-item ${item.isPrimary ? 'is-primary' : ''}`}>
    <div className="gallery-image">
      {url ? <img src={url} alt={item.caption || 'Ảnh gia đình'} /> : <span>{loading ? 'Đang tải…' : 'Không có ảnh xem trước'}</span>}
      {item.isPrimary && <i><Star size={11} fill="currentColor" /> Đại diện</i>}
    </div>
    {readOnly ? item.caption && <p>{item.caption}</p> : <>
      <label><span className="sr-only">Chú thích ảnh</span><input value={caption} onChange={(event) => setCaption(event.target.value)} onBlur={() => { if (caption.trim() !== (item.caption ?? '')) void onUpdateCaption(item.id, caption) }} placeholder="Thêm chú thích…" /></label>
      <div className="gallery-actions">
        {!item.isPrimary && <button type="button" disabled={busy} onClick={() => void onSetPrimary(item.id)}><Check size={13} /> Đặt đại diện</button>}
        {url && <a href={url} target="_blank" rel="noreferrer" aria-label="Mở ảnh gốc"><ExternalLink size={13} /></a>}
        <button className="gallery-delete" type="button" disabled={busy} onClick={() => { if (window.confirm('Đánh dấu xóa ảnh này trong Draft? File Drive chỉ bị xóa sau khi Lưu tất cả.')) void onDelete(item.id) }} aria-label="Xóa ảnh"><Trash2 size={13} /></button>
      </div>
    </>}
  </article>
}

interface Props {
  personName: string
  media: PersonMedia[]
  workspaceId?: string
  readOnly?: boolean
  busy?: boolean
  onAdd: (files: File[]) => Promise<void>
  onSetPrimary: (mediaId: string) => Promise<void>
  onUpdateCaption: (mediaId: string, caption: string) => Promise<void>
  onDelete: (mediaId: string) => Promise<void>
}

export function PhotoGallery({ personName, media, workspaceId, readOnly, busy, onAdd, onSetPrimary, onUpdateCaption, onDelete }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [failedFiles, setFailedFiles] = useState<File[]>([])
  const [uploadError, setUploadError] = useState<string>()
  const sorted = [...media].sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary) || (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
  const upload = async (files: File[]) => {
    try { await onAdd(files); setFailedFiles([]); setUploadError(undefined) }
    catch (caught) { setFailedFiles(files); setUploadError(caught instanceof Error ? caught.message : 'Tải ảnh thất bại.') }
  }

  return <section className="photo-gallery">
    <div className="gallery-heading"><span className="section-label">Thư viện ảnh · {sorted.length}</span>{!readOnly && <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}><ImagePlus size={14} /> Thêm ảnh</button>}</div>
    {!readOnly && <input ref={inputRef} className="sr-only" type="file" accept="image/*" multiple onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length) void upload(files) }} />}
    {uploadError && <div className="photo-upload-error"><span>{uploadError}</span><button type="button" disabled={busy} onClick={() => void upload(failedFiles)}><RotateCw size={13} /> Thử lại</button></div>}
    {sorted.length ? <div className="gallery-grid">{sorted.map((item) => <GalleryItem key={item.id} item={item} workspaceId={workspaceId} readOnly={readOnly} busy={busy} onSetPrimary={onSetPrimary} onUpdateCaption={onUpdateCaption} onDelete={onDelete} />)}</div> : <p className="gallery-empty">Chưa có ảnh của {personName}.</p>}
  </section>
}
