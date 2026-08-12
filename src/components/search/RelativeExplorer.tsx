import { ArrowLeft, ChevronDown, Network, UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { calculateAge } from '../../calendar/dateUtils'
import { useDriveImage } from '../../hooks/useDriveImage'
import { createPrimaryMediaMap } from '../../media/mediaSelectors'
import { getNearestRelatives, type NearestRelative } from '../../relatives/nearestRelatives'
import type { FamilyGraph, Person, PersonMedia } from '../../types/family'
import { getInitials } from '../../utils/initials'

function RelativeCard({ relative, workspaceId, photoId, onOpen }: { relative: NearestRelative; workspaceId?: string; photoId?: string; onOpen: () => void }) {
  const { url } = useDriveImage(workspaceId, photoId)
  const age = relative.person.isDeceased ? undefined : calculateAge(relative.person.birthDate ?? undefined)
  return <button className="explorer-person-card" type="button" onClick={onOpen}>
    <span className="explorer-avatar">{url ? <img src={url} alt="" /> : getInitials(relative.person.name)}</span>
    <span><strong>{relative.person.name}</strong><small>{relative.shortLabel}{age !== undefined ? ` · ${age} tuổi` : ''}</small></span>
  </button>
}

function TargetCard({ person, workspaceId, photoId }: { person: Person; workspaceId?: string; photoId?: string }) {
  const { url } = useDriveImage(workspaceId, photoId)
  return <div className="explorer-target"><span className="explorer-avatar large">{url ? <img src={url} alt="" /> : getInitials(person.name)}</span><span className="eyebrow">Người đang khám phá</span><h2>{person.name}</h2>{person.nickname && <p>“{person.nickname}”</p>}</div>
}

function RelativeGroup({ title, subtitle, relatives, workspaceId, photos, onOpen }: { title: string; subtitle?: string; relatives: NearestRelative[]; workspaceId?: string; photos: Map<string, string>; onOpen: (id: string) => void }) {
  return <section className="explorer-group"><div className="explorer-group-heading"><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}<span>{relatives.length}</span></div>{relatives.length ? <div className="explorer-person-list">{relatives.map((relative) => <RelativeCard key={relative.person.id} relative={relative} workspaceId={workspaceId} photoId={photos.get(relative.person.id)} onOpen={() => onOpen(relative.person.id)} />)}</div> : <p className="explorer-empty">Chưa ghi nhận người thân trong nhóm này.</p>}</section>
}

interface Props {
  targetId: string
  graph: FamilyGraph
  media: PersonMedia[]
  workspaceId?: string
  onClose: () => void
  onOpenPerson: (id: string) => void
  onViewFullTree: (id: string) => void
}

export function RelativeExplorer({ targetId, graph, media, workspaceId, onClose, onOpenPerson, onViewFullTree }: Props) {
  const [maxDistance, setMaxDistance] = useState(3)
  const target = graph.personsById.get(targetId)
  const groups = useMemo(() => getNearestRelatives(targetId, graph, { maxDistance, includeSpouse: true, includeAffinal: false }), [graph, maxDistance, targetId])
  const photos = useMemo(() => new Map([...createPrimaryMediaMap(media)].map(([personId, item]) => [personId, item.driveFileId])), [media])
  if (!target) return null

  return <div className="relative-explorer">
    <header className="explorer-toolbar"><button className="secondary-button" type="button" onClick={onClose}><ArrowLeft size={16} /> Quay lại</button><div><span className="eyebrow">Relative Explorer</span><strong>Người thân gần nhất</strong></div><button className="primary-button" type="button" onClick={() => onViewFullTree(targetId)}><Network size={16} /> Xem toàn bộ cây</button></header>
    <div className="explorer-content">
      <TargetCard person={target} workspaceId={workspaceId} photoId={photos.get(targetId)} />
      <div className="explorer-stem"><UsersRound size={16} /></div>
      <div className="explorer-direct-grid">
        <RelativeGroup title="Gia đình trực tiếp" subtitle="Cha mẹ và anh chị em" relatives={groups.direct} workspaceId={workspaceId} photos={photos} onOpen={onOpenPerson} />
        <RelativeGroup title="Vợ / chồng" relatives={groups.spouse} workspaceId={workspaceId} photos={photos} onOpen={onOpenPerson} />
        <RelativeGroup title="Hậu duệ" subtitle="Con, cháu" relatives={groups.descendants} workspaceId={workspaceId} photos={photos} onOpen={onOpenPerson} />
      </div>
      <div className="explorer-lineage-grid">
        <RelativeGroup title="HỌ NỘI" subtitle="Nhánh bên cha của người đang khám phá" relatives={groups.paternal} workspaceId={workspaceId} photos={photos} onOpen={onOpenPerson} />
        <RelativeGroup title="HỌ NGOẠI" subtitle="Nhánh bên mẹ của người đang khám phá" relatives={groups.maternal} workspaceId={workspaceId} photos={photos} onOpen={onOpenPerson} />
      </div>
      {maxDistance < 5 && <button className="explorer-expand-more secondary-button" type="button" onClick={() => setMaxDistance(5)}><ChevronDown size={16} /> Mở rộng thêm họ hàng</button>}
    </div>
  </div>
}
