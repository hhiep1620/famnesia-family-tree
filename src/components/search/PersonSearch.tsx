import { Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { KinshipResult, Person } from '../../types/family'

interface Props {
  persons: Person[]
  onSelect: (id: string) => void
  kinships?: Map<string, KinshipResult>
}

export function PersonSearch({ persons, onSelect, kinships }: Props) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('vi')
    if (!normalized) return []
    return persons.filter((person) => person.name.toLocaleLowerCase('vi').includes(normalized)).slice(0, 6)
  }, [persons, query])

  return (
    <div className="person-search">
      <Search size={17} aria-hidden="true" />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Tìm thành viên"
        aria-label="Tìm thành viên"
      />
      {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={15} /></button>}
      {results.length > 0 && (
        <div className="search-results" role="listbox">
          {results.map((person) => (
            <button key={person.id} type="button" onClick={() => { onSelect(person.id); setQuery('') }}>
              <span>{person.name}{person.nickname && <em>“{person.nickname}”</em>}</span><small>{kinships?.get(person.id)?.shortLabel ?? person.id}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
