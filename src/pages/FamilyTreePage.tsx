import { AlertTriangle, CakeSlice, Flower2, Plus, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { getUpcomingFamilyEvents } from '../calendar/familyCalendar'
import { FamilyCalendar } from '../components/calendar/FamilyCalendar'
import { CreateProfileModal } from '../components/data/CreateProfileModal'
import { DataManagement } from '../components/data/DataManagement'
import { StartFamilyTree } from '../components/data/StartFamilyTree'
import { PersonDetails } from '../components/family/PersonDetails'
import { FamilyTree } from '../components/family/FamilyTree'
import { PersonModal } from '../components/family/PersonModal'
import { AppHeader, type MainView } from '../components/layout/AppHeader'
import { buildFamilyGraph } from '../graph/familyGraph'
import { useFamilyData } from '../hooks/useFamilyData'
import { downloadFamilyDataTemplate } from '../import/exportFamilyData'
import { getAllKinships } from '../kinship/kinshipEngine'
import type { FamilyEventType, FriendlyRelationship, GoogleUser } from '../types/family'

interface Props { user?: GoogleUser; onSignOut?: () => void }
type ModalState = { type: 'add' } | { type: 'relative'; kind: FriendlyRelationship } | { type: 'edit' } | undefined
type TreeFilter = FamilyEventType | 'all'

export function FamilyTreePage({ user, onSignOut }: Props) {
  const data = useFamilyData()
  const [view, setView] = useState<MainView>('tree')
  const [selectedId, setSelectedId] = useState<string>()
  const [treeFilter, setTreeFilter] = useState<TreeFilter>('all')
  const [modal, setModal] = useState<ModalState>()
  const [showCreateProfile, setShowCreateProfile] = useState(false)
  const [openImportOnMount, setOpenImportOnMount] = useState(false)
  const graph = useMemo(() => buildFamilyGraph(data.persons, data.relationships), [data.persons, data.relationships])
  const subjectId = data.activeProfile?.subjectPersonId ?? undefined
  const kinships = useMemo(() => getAllKinships(subjectId ?? undefined, graph), [graph, subjectId])
  const selected = selectedId ? graph.personsById.get(selectedId) : undefined
  const subject = subjectId ? graph.personsById.get(subjectId) : undefined
  const upcomingEvents = useMemo(() => getUpcomingFamilyEvents(data.persons, 30, treeFilter), [data.persons, treeFilter])
  const highlightedIds = useMemo(() => new Set(upcomingEvents.map((event) => event.personId)), [upcomingEvents])
  const eventTypes = useMemo(() => new Map(upcomingEvents.map((event) => [event.personId, event.type])), [upcomingEvents])
  const canEdit = data.useMockData || Boolean(data.workspace?.canEdit)

  useEffect(() => { setSelectedId(undefined); setModal(undefined) }, [data.activeProfileId])

  const changeView = (nextView: MainView) => { setView(nextView); setSelectedId(undefined) }
  const openTreePerson = (id: string) => { setView('tree'); setSelectedId(id) }
  const openCalendarPerson = (id: string) => { setView('calendar'); setSelectedId(id) }
  const openImport = () => { setOpenImportOnMount(true); setView('data') }

  return <main className="app-shell">
    <AppHeader persons={data.persons} profiles={data.profiles} activeProfileId={data.activeProfileId} workspaces={data.workspaces} activeWorkspaceId={data.activeWorkspaceId} canEdit={canEdit} user={user} mock={data.useMockData} view={view} subject={subject} kinships={kinships} refreshing={data.loading} onProfileChange={data.setActiveProfileId} onWorkspaceChange={data.switchWorkspace} onViewChange={changeView} onSearch={openTreePerson} onAdd={() => setModal({ type: 'add' })} onRefresh={() => void data.refresh()} onSignOut={onSignOut} />
    <div className={`tree-stage view-${view}`}>
      {data.loading ? <div className="center-state"><span className="archive-loader" /><h2>Đang mở gia phả</h2><p>Đang tìm workspace và đọc family.json…</p></div>
        : data.error && !data.familyData.updatedAt ? <div className="center-state error-state"><AlertTriangle /><h2>Không thể tải gia phả</h2><p>{data.error}</p><button className="secondary-button" onClick={() => void data.refresh()}><RefreshCw size={16} /> Thử lại</button></div>
          : view === 'data' ? <DataManagement data={data.familyData} workspace={data.workspace} mock={data.useMockData} busy={data.busy} saveStatus={data.saveStatus} openImportOnMount={openImportOnMount} onImportOpened={() => setOpenImportOnMount(false)} onCreateProfile={() => setShowCreateProfile(true)} onImport={(replacement) => data.replaceAllData(replacement)} onBackup={() => data.backupNow()} onListBackups={data.listBackups} onRestore={data.restoreBackup} members={data.members} onRefreshMembers={data.refreshMembers} onAddMember={data.addMember} onUpdateMember={data.updateMember} onRemoveMember={data.removeMember} />
            : data.profiles.length === 0 ? canEdit ? <StartFamilyTree onCreate={() => setShowCreateProfile(true)} onImport={openImport} onDownloadTemplate={downloadFamilyDataTemplate} /> : <div className="center-state empty-state"><h2>Workspace chưa có dữ liệu</h2><p>Bạn có quyền xem. Hãy nhờ owner hoặc editor thêm gia đình.</p></div>
              : data.persons.length ? view === 'tree' ? <>
                <div className="tree-filter-bar"><span>Đánh dấu trong 30 ngày:</span><button className={treeFilter === 'all' ? 'active' : ''} onClick={() => setTreeFilter('all')}>Tất cả</button><button className={treeFilter === 'birthday' ? 'active' : ''} onClick={() => setTreeFilter('birthday')}><CakeSlice size={14} /> Sinh nhật</button><button className={treeFilter === 'death_anniversary' ? 'active' : ''} onClick={() => setTreeFilter('death_anniversary')}><Flower2 size={14} /> Ngày giỗ</button></div>
                <FamilyTree graph={graph} workspaceId={data.workspace?.id} selectedId={selectedId} subjectId={subjectId ?? undefined} kinships={kinships} highlightedIds={highlightedIds} eventTypes={eventTypes} filterActive={treeFilter !== 'all'} onSelect={setSelectedId} />
              </> : <FamilyCalendar persons={data.persons} onOpenPerson={setSelectedId} />
                : <div className="center-state empty-state"><span className="seed-mark">+</span><span className="eyebrow">{data.activeProfile?.name}</span><h2>Gia đình này chưa có thành viên</h2><p>Thêm người đầu tiên hoặc import một family.json hoàn chỉnh.</p><div className="empty-actions"><button className="primary-button" onClick={() => setModal({ type: 'add' })}><Plus size={17} /> Thêm người đầu tiên</button><button className="secondary-button" onClick={openImport}>Import JSON</button></div></div>}

      {view !== 'data' && data.issues.length > 0 && <div className="data-warning"><AlertTriangle size={16} /><span>Dữ liệu có {data.issues.length} cảnh báo. Xem chi tiết trong mục Dữ liệu.</span></div>}
      {data.error && data.familyData.updatedAt && <div className="toast error-toast">{data.error}</div>}{data.busy && <div className="toast busy-toast"><span className="mini-spinner" />{data.busy}</div>}
      {view === 'tree' && data.activeProfileId && canEdit && <button className="mobile-add" aria-label="Thêm người" onClick={() => setModal({ type: 'add' })}><Plus size={24} /></button>}

      {selected && <PersonDetails person={selected} persons={data.persons} relationships={data.relationships} workspaceId={data.workspace?.id} readOnly={!canEdit} busy={Boolean(data.busy)} subjectId={subjectId ?? undefined} kinship={kinships.get(selected.id)} context={view === 'calendar' ? 'calendar' : 'tree'} onClose={() => setSelectedId(undefined)} onSelect={setSelectedId} onSetSubject={(id) => { void data.setSubject(id) }} onViewCalendar={openCalendarPerson} onViewTree={openTreePerson} onAddRelative={() => setModal({ type: 'relative', kind: 'child' })} onEdit={() => setModal({ type: 'edit' })} onAddRelationship={data.addRelationship} onUpdateRelationship={data.updateRelationship} onDeleteRelationship={data.deleteRelationship} onDeletePerson={async () => { await data.deletePerson(selected.id); setSelectedId(undefined) }} />}
    </div>

    {showCreateProfile && <CreateProfileModal busy={data.busy} onClose={() => setShowCreateProfile(false)} onCreate={async (name, description) => { await data.createProfile(name, description); setView('tree') }} />}
    {modal?.type === 'add' && <PersonModal mode="add" persons={data.persons} relationships={data.relationships} busy={data.busy} onClose={() => setModal(undefined)} onCreate={data.addPerson} />}
    {modal?.type === 'relative' && selected && <PersonModal mode="relative" person={selected} initialKind={modal.kind} persons={data.persons} relationships={data.relationships} busy={data.busy} onClose={() => setModal(undefined)} onCreate={data.addPerson} />}
    {modal?.type === 'edit' && selected && <PersonModal mode="edit" person={selected} persons={data.persons} relationships={data.relationships} busy={data.busy} onClose={() => setModal(undefined)} onUpdate={(draft, removePhoto) => data.updatePerson(selected.id, draft, removePhoto)} />}
  </main>
}
