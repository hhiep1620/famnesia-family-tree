import { ArrowLeft, ChevronDown, ChevronRight, Network, UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { calculateAge } from '../../calendar/dateUtils'
import { useMediaImage } from '../../hooks/useMediaImage'
import { createPrimaryMediaMap } from '../../media/mediaSelectors'
import { getNearestRelatives, type NearestRelative } from '../../relatives/nearestRelatives'
import { getAllKinships } from '../../kinship/kinshipEngine'
import { classifyRelativeScope } from '../../lineage/lineageClassifier'
import { mediaReferenceId } from '../../services/mediaReference'
import type { FamilyGraph, Person, PersonMedia } from '../../types/family'
import { getInitials } from '../../utils/initials'

function RelativeCard({ relative, workspaceId, photoId, onOpen }: { relative: NearestRelative; workspaceId?: string; photoId?: string; onOpen: () => void }) {
  const { url } = useMediaImage(workspaceId, photoId, 'thumb')
  const age = relative.person.isDeceased ? undefined : calculateAge(relative.person.birthDate ?? undefined)
  return <button className="explorer-person-card" type="button" onClick={onOpen}>
    <span className="explorer-avatar">{url ? <img src={url} alt="" /> : getInitials(relative.person.name)}</span>
    <span><strong>{relative.person.name}</strong><small>{relative.shortLabel}{age !== undefined ? ` · ${age} tuổi` : ''}</small></span>
  </button>
}

function TargetCard({ person, workspaceId, photoId }: { person: Person; workspaceId?: string; photoId?: string }) {
  const { url } = useMediaImage(workspaceId, photoId, 'thumb')
  return <div className="explorer-target"><span className="explorer-avatar large">{url ? <img src={url} alt="" /> : getInitials(person.name)}</span><span className="eyebrow">Người đang khám phá</span><h2>{person.name}</h2>{person.nickname && <p>“{person.nickname}”</p>}</div>
}

function RelativeGroup({ title, subtitle, relatives, workspaceId, photos, onOpen }: { title: string; subtitle?: string; relatives: NearestRelative[]; workspaceId?: string; photos: Map<string, string>; onOpen: (id: string) => void }) {
  return <section className="explorer-group"><div className="explorer-group-heading"><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}<span>{relatives.length}</span></div>{relatives.length ? <div className="explorer-person-list">{relatives.map((relative) => <RelativeCard key={relative.person.id} relative={relative} workspaceId={workspaceId} photoId={photos.get(relative.person.id)} onOpen={() => onOpen(relative.person.id)} />)}</div> : <p className="explorer-empty">Chưa ghi nhận người thân trong nhóm này.</p>}</section>
}

function generationTitle(generation: number, branch: 'paternal' | 'maternal'): string {
  if (generation >= 3) return `Đời trên +${generation}`
  if (generation === 2) return 'Ông bà'
  if (generation === 1) return branch === 'paternal' ? 'Cha mẹ / cô chú bác' : 'Cha mẹ / cậu dì'
  if (generation === 0) return 'Cùng thế hệ'
  if (generation === -1) return 'Con'
  if (generation === -2) return 'Cháu'
  return `Đời dưới ${generation}`
}

function LineagePanel({ branch, relatives, collapsed, onToggle, workspaceId, photos, onOpen }: {
  branch: 'paternal' | 'maternal'; relatives: NearestRelative[]; collapsed: Set<string>; onToggle: (id: string) => void
  workspaceId?: string; photos: Map<string, string>; onOpen: (id: string) => void
}) {
  const title = branch === 'paternal' ? 'HỌ NỘI' : 'HỌ NGOẠI'
  const grouped = new Map<number, NearestRelative[]>()
  for (const relative of relatives) grouped.set(relative.generationDelta, [...(grouped.get(relative.generationDelta) ?? []), relative])
  const groups = [...grouped].sort(([left], [right]) => right - left)
  return <section className={`explorer-lineage-panel ${branch}`}><header><div><span className="eyebrow">{branch === 'paternal' ? 'Nhánh bên cha' : 'Nhánh bên mẹ'}</span><h3>{title}</h3></div><strong>{relatives.length} người</strong></header>
    {groups.length ? <div className="explorer-generation-list">{groups.map(([generation, members]) => {
      const key = `${branch}:${generation}`; const isCollapsed = collapsed.has(key)
      return <section className="explorer-generation" key={key}><button type="button" onClick={() => onToggle(key)} aria-expanded={!isCollapsed}><span>{isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}<strong>{generationTitle(generation, branch)}</strong></span><small>{members.length} người</small></button>
        {!isCollapsed ? <div className="explorer-person-list">{members.map((relative) => <RelativeCard key={relative.person.id} relative={relative} workspaceId={workspaceId} photoId={photos.get(relative.person.id)} onOpen={() => onOpen(relative.person.id)} />)}</div> : null}
      </section>
    })}</div> : <p className="explorer-empty">Chưa đủ quan hệ cha/mẹ để xác định nhánh này.</p>}
  </section>
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const target = graph.personsById.get(targetId)
  const groups = useMemo(() => getNearestRelatives(targetId, graph, { maxDistance, includeSpouse: true, includeAffinal: false }), [graph, maxDistance, targetId])
  const lineage = useMemo(() => {
    const kinships = getAllKinships(targetId, graph)
    const result: Record<'paternal' | 'maternal', NearestRelative[]> = { paternal: [], maternal: [] }
    for (const [personId, kinship] of kinships) {
      if (personId === targetId || kinship.distance > maxDistance) continue
      const branch = classifyRelativeScope(targetId, personId, graph)
      const person = graph.personsById.get(personId)
      if (person && (branch === 'paternal' || branch === 'maternal')) result[branch].push({ ...kinship, person })
    }
    for (const members of Object.values(result)) members.sort((left, right) => right.generationDelta - left.generationDelta || left.distance - right.distance || left.person.name.localeCompare(right.person.name, 'vi'))
    return result
  }, [graph, maxDistance, targetId])
  const photos = useMemo(() => new Map([...createPrimaryMediaMap(media)].flatMap(([personId, item]) => {
    const reference = mediaReferenceId(item)
    return reference ? [[personId, reference] as const] : []
  })), [media])
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
      <div className="explorer-lineage-grid"><LineagePanel branch="paternal" relatives={lineage.paternal} collapsed={collapsed} onToggle={(key) => setCollapsed((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })} workspaceId={workspaceId} photos={photos} onOpen={onOpenPerson} /><LineagePanel branch="maternal" relatives={lineage.maternal} collapsed={collapsed} onToggle={(key) => setCollapsed((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })} workspaceId={workspaceId} photos={photos} onOpen={onOpenPerson} /></div>
      {maxDistance < 5 && <button className="explorer-expand-more secondary-button" type="button" onClick={() => setMaxDistance(5)}><ChevronDown size={16} /> Mở rộng thêm họ hàng</button>}
    </div>
  </div>
}
