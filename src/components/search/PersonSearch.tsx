import { Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { calculateAge } from '../../calendar/dateUtils'
import { useDriveImage } from '../../hooks/useDriveImage'
import { createPrimaryMediaMap } from '../../media/mediaSelectors'
import { PersonSearchIndex, type PersonSearchResult } from '../../search/personSearchIndex'
import type { FamilyScope, KinshipResult, Person, PersonMedia } from '../../types/family'
import { getInitials } from '../../utils/initials'

interface Props {
  persons: Person[]
  media: PersonMedia[]
  workspaceId?: string
  onSelect: (id: string) => void
  kinships?: Map<string, KinshipResult>
  scopes?: Map<string, FamilyScope>
}

const scopeLabels: Record<FamilyScope, string> = {
  self: 'Chủ thể', paternal: 'Họ Nội', maternal: 'Họ Ngoại', descendant: 'Hậu duệ', spouse: 'Phối ngẫu · Dâu rể', affinal: 'Thông gia', unclassified: 'Gia đình',
}

function SearchResultCard({ result, workspaceId, photoId, onSelect }: { result: PersonSearchResult; workspaceId?: string; photoId?: string; onSelect: () => void }) {
  const { url } = useDriveImage(workspaceId, photoId)
  const age = result.person.isDeceased ? undefined : calculateAge(result.person.birthDate ?? undefined)
  const life = result.person.isDeceased ? `${result.person.birthDate?.slice(0, 4) ?? '?'}–${result.person.deathDate?.slice(0, 4) ?? '?'}` : age === undefined ? undefined : `${age} tuổi`
  return <button type="button" className="search-result-card" onClick={onSelect}>
    <span className="search-avatar">{url ? <img src={url} alt="" /> : getInitials(result.person.name)}</span>
    <span className="search-result-copy"><strong>{result.person.name}</strong>{result.person.nickname && <em>“{result.person.nickname}”</em>}<span>{[result.kinship?.shortLabel, result.scope ? scopeLabels[result.scope] : undefined].filter(Boolean).join(' · ')}</span>{result.person.address && <small>{result.person.address}</small>}</span>
    {life && <time>{life}</time>}
  </button>
}

export function PersonSearch({ persons, media, workspaceId, onSelect, kinships, scopes }: Props) {
  const [query, setQuery] = useState('')
  const index = useMemo(() => new PersonSearchIndex(persons), [persons])
  const primary = useMemo(() => createPrimaryMediaMap(media), [media])
  const results = useMemo(() => index.search(query, { kinships, scopes }), [index, kinships, query, scopes])

  return <div className="person-search">
    <Search size={17} aria-hidden="true" />
    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm người thân theo tên, SĐT, địa chỉ…" aria-label="Tìm thành viên" />
    {query && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setQuery('')}><X size={15} /></button>}
    {query.trim() && <div className="search-results" role="listbox">{results.length ? results.map((result) => <SearchResultCard key={result.person.id} result={result} workspaceId={workspaceId} photoId={primary.get(result.person.id)?.driveFileId} onSelect={() => { onSelect(result.person.id); setQuery('') }} />) : <p className="search-empty">Không tìm thấy thành viên phù hợp.</p>}</div>}
  </div>
}
