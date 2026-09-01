import { AlertTriangle, CakeSlice, Flower2, Plus, RefreshCw } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { getUpcomingFamilyEvents } from '../calendar/familyCalendar'
import { FamilyCalendar } from '../components/calendar/FamilyCalendar'
import { FamilyAnalytics } from '../components/analytics/FamilyAnalytics'
import { CreateProfileModal } from '../components/data/CreateProfileModal'
import { StartFamilyTree } from '../components/data/StartFamilyTree'
import { DraftWorkspaceControls } from '../components/draft/DraftWorkspaceControls'
import { PersonDetails } from '../components/family/PersonDetails'
import { FamilyTree } from '../components/family/FamilyTree'
import { PersonModal } from '../components/family/PersonModal'
import { AppHeader, type MainView } from '../components/layout/AppHeader'
import { RelativeExplorer } from '../components/search/RelativeExplorer'
import { buildFamilyGraph } from '../graph/familyGraph'
import { useFamilyData } from '../hooks/useFamilyData'
import { downloadFamilyDataTemplate } from '../import/exportFamilyData'
import { getAllKinships } from '../kinship/kinshipEngine'
import { classifyAllRelativeScopes } from '../lineage/lineageClassifier'
import { getMaleSurnameSuggestions } from '../family/profileLineage'
import type { FamilyEventType, FriendlyRelationship, GoogleUser } from '../types/family'

const DataManagement = lazy(() => import('../components/data/DataManagement').then((module) => ({ default: module.DataManagement })))

interface Props { user?: GoogleUser; onSignOut?: () => void }
type ModalState = { type: 'add' } | { type: 'relative'; kind: FriendlyRelationship } | { type: 'edit' } | undefined
type TreeFilter = FamilyEventType | 'all'
interface PendingLeave { title: string; run: () => void | Promise<void> }

export function FamilyTreePage({ user, onSignOut }: Props) {
  const data = useFamilyData(user?.id ?? user?.email ?? 'mock-user')
  const [view, setView] = useState<MainView>('tree')
  const [selectedId, setSelectedId] = useState<string>()
  const [treeFilter, setTreeFilter] = useState<TreeFilter>('all')
  const [modal, setModal] = useState<ModalState>()
  const [viewSubjectStack, setViewSubjectStack] = useState<string[]>([])
  const [explorerId, setExplorerId] = useState<string>()
  const [profileModal, setProfileModal] = useState<'create' | 'edit'>()
  const [openImportOnMount, setOpenImportOnMount] = useState(false)
  const [pendingLeave, setPendingLeave] = useState<PendingLeave>()
  const [workspaceName, setWorkspaceName] = useState('Gia đình của tôi')
  const graph = useMemo(() => buildFamilyGraph(data.persons, data.relationships), [data.persons, data.relationships])
  const persistedSubjectId = data.activeProfile?.subjectPersonId ?? undefined
  const viewSubjectId = viewSubjectStack.at(-1) ?? persistedSubjectId
  const kinships = useMemo(() => getAllKinships(viewSubjectId ?? undefined, graph), [graph, viewSubjectId])
  const scopes = useMemo(() => viewSubjectId ? classifyAllRelativeScopes(viewSubjectId, graph) : new Map(), [graph, viewSubjectId])
  const selected = selectedId ? graph.personsById.get(selectedId) : undefined
  const subject = viewSubjectId ? graph.personsById.get(viewSubjectId) : undefined
  const upcomingEvents = useMemo(() => getUpcomingFamilyEvents(data.persons, 30, treeFilter), [data.persons, treeFilter])
  const highlightedIds = useMemo(() => new Set(upcomingEvents.map((event) => event.personId)), [upcomingEvents])
  const eventTypes = useMemo(() => new Map(upcomingEvents.map((event) => [event.personId, event.type])), [upcomingEvents])
  const canEdit = data.useMockData || Boolean(data.workspace?.canEdit)
  const canReplaceData = data.useMockData || Boolean(data.workspace?.canReplaceData)
  const suggestedSurnames = useMemo(() => getMaleSurnameSuggestions(data.persons).map((item) => item.surname).slice(0, 5), [data.persons])
  const activeFamilyData = useMemo(() => ({ ...data.familyData, profiles: data.activeProfile ? [data.activeProfile] : [], persons: data.persons, relationships: data.relationships, media: data.media }), [data.activeProfile, data.familyData, data.media, data.persons, data.relationships])

  useEffect(() => { setSelectedId(undefined); setModal(undefined); setExplorerId(undefined); setViewSubjectStack(persistedSubjectId ? [persistedSubjectId] : []) }, [data.activeProfileId, persistedSubjectId])

  const changeView = (nextView: MainView) => { setView(nextView); setSelectedId(undefined); setExplorerId(undefined) }
  const openCalendarPerson = (id: string) => { setView('calendar'); setSelectedId(id) }
  const openRelativeExplorer = (id: string) => { setView('tree'); setSelectedId(undefined); setExplorerId(id) }
  const openFamilyBranch = (id: string) => { setView('tree'); setSelectedId(undefined); setExplorerId(undefined); setViewSubjectStack((current) => current.at(-1) === id ? current : [...current, id]) }
  const goBackSubject = () => { setSelectedId(undefined); setViewSubjectStack((current) => current.length > 1 ? current.slice(0, -1) : current) }
  const openImport = () => { setOpenImportOnMount(true); setView('data') }
  const guardLeave = (title: string, run: PendingLeave['run']) => { if (data.pendingOperations.length) setPendingLeave({ title, run }); else void run() }
  const requestWorkspaceChange = (id: string) => guardLeave('Chuyển sang workspace khác?', () => data.switchWorkspace(id))
  const requestSignOut = onSignOut ? () => guardLeave('Đăng xuất khỏi Famnesia?', onSignOut) : undefined
  const continueLeave = async (mode: 'save' | 'discard') => {
    if (!pendingLeave) return
    if (mode === 'save' && !await data.saveAll()) return
    if (mode === 'discard') await data.discardDraft()
    const action = pendingLeave.run; setPendingLeave(undefined); await action()
  }

  return <main className="app-shell">
    <AppHeader persons={data.persons} profileMembers={data.familyData.persons} media={data.media} workspaceId={data.workspace?.id} profiles={data.profiles} activeProfileId={data.activeProfileId} workspaces={data.workspaces} activeWorkspaceId={data.activeWorkspaceId} canEdit={canEdit} user={user} mock={data.useMockData} view={view} subject={subject} kinships={kinships} scopes={scopes} refreshing={data.loading} onProfileChange={data.setActiveProfileId} onEditProfile={() => setProfileModal('edit')} onWorkspaceChange={requestWorkspaceChange} onViewChange={changeView} onSearch={openRelativeExplorer} onAdd={() => setModal({ type: 'add' })} onRefresh={() => void data.refresh()} onSignOut={requestSignOut} />
    <div className={`tree-stage view-${view}`}>
      {data.loading ? <div className="center-state"><span className="archive-loader" /><h2>Đang mở gia phả</h2><p>Đang tìm workspace và đọc dữ liệu gia đình…</p></div>
        : data.needsWorkspace ? <div className="center-state empty-state workspace-create-state"><span className="seed-mark">+</span><span className="eyebrow">Workspace Supabase</span><h2>Tạo gia đình đầu tiên</h2><p>Bạn chưa tham gia workspace nào. Tạo một workspace mới, hoặc mở đúng link mời do owner gửi.</p><label><span>Tên workspace</span><input value={workspaceName} maxLength={120} onChange={(event) => setWorkspaceName(event.target.value)} /></label><button className="primary-button" disabled={!workspaceName.trim() || Boolean(data.busy)} onClick={() => void data.createWorkspace(workspaceName)}><Plus size={17} /> Tạo workspace</button></div>
        : data.error && !data.familyData.updatedAt ? <div className="center-state error-state"><AlertTriangle /><h2>Không thể tải gia phả</h2><p>{data.error}</p><button className="secondary-button" onClick={() => void data.refresh()}><RefreshCw size={16} /> Thử lại</button></div>
          : explorerId ? <RelativeExplorer targetId={explorerId} graph={graph} media={data.media} workspaceId={data.workspace?.id} onClose={() => setExplorerId(undefined)} onOpenPerson={setExplorerId} onViewFullTree={openFamilyBranch} />
          : view === 'data' ? <Suspense fallback={<div className="center-state"><span className="archive-loader" /><h2>Đang tải quản lý dữ liệu</h2></div>}><DataManagement data={data.familyData} workspace={data.workspace} mock={data.useMockData} busy={data.busy} saveStatus={data.saveStatus} openImportOnMount={openImportOnMount} onImportOpened={() => setOpenImportOnMount(false)} onCreateProfile={() => setProfileModal('create')} onImport={(replacement) => data.replaceAllData(replacement)} onBackup={() => data.backupNow()} onListBackups={data.listBackups} onRestore={data.restoreBackup} members={data.members} activity={data.activity} onRefreshMembers={data.refreshMembers} onAddMember={data.addMember} onUpdateMember={data.updateMember} onRemoveMember={data.removeMember} onOpenPerson={setSelectedId} onSuppressDuplicate={data.suppressDuplicate} onMergePeople={data.mergeDuplicatePeople} onConnectSharedWorkspace={data.connectSharedWorkspace} /></Suspense>
            : data.profiles.length === 0 ? canEdit ? <StartFamilyTree onCreate={() => setProfileModal('create')} onImport={canReplaceData ? openImport : undefined} onDownloadTemplate={downloadFamilyDataTemplate} sharedWorkspaceMode={data.useMockData ? undefined : data.workspace?.rootFolderUrl ? 'drive' : 'invite'} onConnectSharedWorkspace={data.workspace?.rootFolderUrl ? data.connectSharedWorkspace : undefined} /> : <div className="center-state empty-state"><h2>Workspace chưa có dữ liệu</h2><p>Bạn có quyền xem. Hãy nhờ owner hoặc editor bổ sung gia đình.</p></div>
              : data.persons.length ? view === 'tree' ? <>
                <div className="tree-filter-bar"><span>Đánh dấu trong 30 ngày:</span><button className={treeFilter === 'all' ? 'active' : ''} onClick={() => setTreeFilter('all')}>Tất cả</button><button className={treeFilter === 'birthday' ? 'active' : ''} onClick={() => setTreeFilter('birthday')}><CakeSlice size={14} /> Sinh nhật</button><button className={treeFilter === 'death_anniversary' ? 'active' : ''} onClick={() => setTreeFilter('death_anniversary')}><Flower2 size={14} /> Ngày giỗ</button></div>
                <FamilyTree graph={graph} media={data.media} workspaceId={data.workspace?.id} selectedId={selectedId} subjectId={viewSubjectId ?? undefined} subjectName={subject?.name} kinships={kinships} highlightedIds={highlightedIds} eventTypes={eventTypes} filterActive={treeFilter !== 'all'} canGoBack={viewSubjectStack.length > 1} onBack={goBackSubject} onOpenBranch={openFamilyBranch} onSelect={setSelectedId} />
              </> : view === 'calendar' ? <FamilyCalendar persons={data.persons} onOpenPerson={setSelectedId} onViewTree={openFamilyBranch} /> : <FamilyAnalytics data={activeFamilyData} subject={subject} onOpenCalendar={() => setView('calendar')} />
                : <div className="center-state empty-state"><span className="seed-mark">+</span><span className="eyebrow">{data.activeProfile?.name}</span><h2>Gia đình này chưa có thành viên</h2><p>Thêm người đầu tiên{canReplaceData ? ' hoặc import một family.json hoàn chỉnh' : ''}.</p><div className="empty-actions"><button className="primary-button" onClick={() => setModal({ type: 'add' })}><Plus size={17} /> Thêm người đầu tiên</button>{canReplaceData && <button className="secondary-button" onClick={openImport}>Import JSON</button>}</div></div>}

      {data.error && data.familyData.updatedAt
        ? <div className="toast error-toast">{data.error}</div>
        : data.busy
          ? <div className="toast busy-toast"><span className="mini-spinner" />{data.busy}</div>
          : data.notice
            ? <div className="toast">{data.notice}</div>
            : null}
      {view === 'tree' && !explorerId && data.activeProfileId && canEdit && <button className="mobile-add" aria-label="Thêm người" onClick={() => setModal({ type: 'add' })}><Plus size={24} /></button>}

      {selected && <PersonDetails person={selected} persons={data.persons} relationships={data.relationships} media={data.media} workspaceId={data.workspace?.id} readOnly={!canEdit} busy={Boolean(data.busy)} subjectId={persistedSubjectId ?? undefined} kinship={kinships.get(selected.id)} context={view === 'calendar' ? 'calendar' : 'tree'} onClose={() => setSelectedId(undefined)} onSelect={setSelectedId} onSetSubject={(id) => { void data.setSubject(id) }} onViewCalendar={openCalendarPerson} onViewTree={openFamilyBranch} onExploreRelatives={openRelativeExplorer} onAddRelative={() => setModal({ type: 'relative', kind: 'child' })} onEdit={() => setModal({ type: 'edit' })} onAddRelationship={data.addRelationship} onUpdateRelationship={data.updateRelationship} onDeleteRelationship={data.deleteRelationship} onDeletePerson={async () => { await data.deletePerson(selected.id); setSelectedId(undefined) }} onAddMedia={data.addPersonMedia} onSetPrimaryMedia={data.setPrimaryMedia} onUpdateMediaCaption={data.updateMediaCaption} onDeleteMedia={data.deletePersonMedia} />}
    </div>

    {profileModal && <CreateProfileModal mode={profileModal} profile={profileModal === 'edit' ? data.activeProfile : undefined} suggestedSurnames={suggestedSurnames} busy={data.busy} onClose={() => setProfileModal(undefined)} onSubmit={async (name, description, lineageSurname) => { if (profileModal === 'edit' && data.activeProfile) await data.updateProfile(data.activeProfile.id, name, description, lineageSurname); else { await data.createProfile(name, description, lineageSurname); setView('tree') } }} />}
    {modal?.type === 'add' && <PersonModal mode="add" persons={data.persons} relationships={data.relationships} busy={data.busy} onClose={() => setModal(undefined)} onCreate={data.addPerson} />}
    {modal?.type === 'relative' && selected && <PersonModal mode="relative" person={selected} initialKind={modal.kind} persons={data.persons} relationships={data.relationships} busy={data.busy} onClose={() => setModal(undefined)} onCreate={data.addPerson} />}
    {modal?.type === 'edit' && selected && <PersonModal mode="edit" person={selected} persons={data.persons} relationships={data.relationships} busy={data.busy} onClose={() => setModal(undefined)} onUpdate={(draft) => data.updatePerson(selected.id, draft)} />}
    <DraftWorkspaceControls operations={data.pendingOperations} data={data.familyData} saving={data.saveStatus === 'saving'} offline={data.saveStatus === 'offline'} conflict={data.conflictDetails} recovery={data.draftRecovery} onSave={data.saveAll} onDiscard={data.discardDraft} onUndo={data.undoOperation} onResolve={data.resolveConflictsAndSave} onDownloadRecovery={data.downloadRecoveryDraft} onDeleteRecovery={data.deleteRecoveryDraft} />
    {pendingLeave && <div className="modal-backdrop draft-modal-backdrop" role="presentation"><section className="draft-dialog leave-draft-dialog" role="dialog" aria-modal="true"><header><div><span className="eyebrow">Draft chưa lưu</span><h2>{pendingLeave.title}</h2><p>Bạn có {data.pendingOperations.length} thay đổi chưa lưu. Hãy chọn cách xử lý trước khi tiếp tục.</p></div></header><footer><button className="secondary-button" onClick={() => setPendingLeave(undefined)}>Ở lại</button><button className="danger-button" onClick={() => void continueLeave('discard')}>Hủy Draft</button><button className="primary-button" onClick={() => void continueLeave('save')}>Lưu rồi tiếp tục</button></footer></section></div>}
  </main>
}
