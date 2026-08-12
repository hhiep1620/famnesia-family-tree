import { CalendarDays, Database, LogOut, Network, Plus, RefreshCw } from 'lucide-react'
import type { FamilyProfile, GoogleUser, KinshipResult, Person, WorkspaceInfo } from '../../types/family'
import { PersonSearch } from '../search/PersonSearch'
import { BrandLogo } from './BrandLogo'

export type MainView = 'tree' | 'calendar' | 'data'

interface Props {
  persons: Person[]
  profiles: FamilyProfile[]
  activeProfileId?: string
  workspaces?: WorkspaceInfo[]
  activeWorkspaceId?: string
  canEdit?: boolean
  user?: GoogleUser
  mock: boolean
  view: MainView
  subject?: Person
  kinships?: Map<string, KinshipResult>
  refreshing?: boolean
  onProfileChange: (profileId: string) => void
  onWorkspaceChange?: (workspaceId: string) => void
  onViewChange: (view: MainView) => void
  onSearch: (id: string) => void
  onAdd: () => void
  onRefresh: () => void
  onSignOut?: () => void
}

function Navigation({ view, onViewChange, mobile = false }: { view: MainView; onViewChange: Props['onViewChange']; mobile?: boolean }) {
  return <nav className={mobile ? 'mobile-bottom-nav' : 'primary-nav'} aria-label="Điều hướng chính">
    <button className={view === 'tree' ? 'active' : ''} onClick={() => onViewChange('tree')}><Network size={17} /> Cây gia đình</button>
    <button className={view === 'calendar' ? 'active' : ''} onClick={() => onViewChange('calendar')}><CalendarDays size={17} /> Lịch</button>
    <button className={view === 'data' ? 'active' : ''} onClick={() => onViewChange('data')}><Database size={17} /> Dữ liệu</button>
  </nav>
}

export function AppHeader({ persons, profiles, activeProfileId, workspaces, activeWorkspaceId, canEdit = true, user, mock, view, subject, kinships, refreshing, onProfileChange, onWorkspaceChange, onViewChange, onSearch, onAdd, onRefresh, onSignOut }: Props) {
  return <>
    <header className="app-header">
      <div className="archive-mark"><BrandLogo compact /></div><div className="header-divider" /><h1>Too many relatives. Not enough memory.</h1>
      <Navigation view={view} onViewChange={onViewChange} />
      <div className="header-actions">
        {!mock && workspaces && workspaces.length > 0 && <label className="family-switcher workspace-switcher"><span className="sr-only">Chọn workspace</span><select value={activeWorkspaceId ?? ''} onChange={(event) => onWorkspaceChange?.(event.target.value)}>{workspaces.map((workspace) => <option value={workspace.id} key={workspace.id}>{workspace.name} · {workspace.role}</option>)}</select></label>}
        {profiles.length > 0 && <label className="family-switcher"><span className="sr-only">Chọn gia đình</span><select value={activeProfileId ?? ''} onChange={(event) => onProfileChange(event.target.value)}>{profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select></label>}
        {view !== 'data' && <PersonSearch persons={persons} onSelect={onSearch} kinships={kinships} />}
        {view !== 'data' && subject && <span className="subject-badge">Chủ thể: {subject.name}</span>}
        <button className="icon-button refresh-button" type="button" onClick={onRefresh} aria-label="Làm mới dữ liệu"><RefreshCw size={17} className={refreshing ? 'spin' : ''} /></button>
        {view !== 'data' && activeProfileId && canEdit && <button className="primary-button desktop-add" type="button" onClick={onAdd}><Plus size={17} /> Thêm người</button>}
        <span className="session-badge">{mock ? 'Dữ liệu mẫu' : user?.email}</span>
        {!mock && onSignOut && <button className="icon-button" type="button" onClick={onSignOut} aria-label="Đăng xuất"><LogOut size={17} /></button>}
      </div>
    </header>
    <Navigation view={view} onViewChange={onViewChange} mobile />
  </>
}
