import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sampleFamilyData } from '../data/sampleFamily'
import { FAMILY_DRAFT_SCHEMA_VERSION, deleteFamilyDraft, isExpiredFamilyDraft, loadFamilyDraft, saveFamilyDraft } from '../draft/draftStorage'
import { compactFamilyOperations, createOperation, isFamilyOperation, mergeFamilyOperations, operationReferencesNewPhoto, removeOperationWithDependencies, replayFamilyOperations } from '../draft/familyOperations'
import { validateRelationship } from '../graph/familyValidation'
import { createPhotoThumbnail, optimizePhoto } from '../media/imageOptimization'
import { generateNextMediaId } from '../media/mediaSelectors'
import { duplicatePairId } from '../integrity/duplicateDetection'
import { mergePeople } from '../integrity/mergePerson'
import { CURRENT_SCHEMA_VERSION, requireValidFamilyData } from '../schema/familyDataSchema'
import { ApiError } from '../services/apiClient'
import { CommitOutcomeUnknownError, FamilyRepository, type FamilyDataRevision } from '../services/familyRepository'
import { mediaReferenceId } from '../services/mediaReference'
import { sharedWorkspaceForEmptyOwner } from '../services/workspaceSelection'
import type { ActivityEvent, FamilyBackup, FamilyData, FamilyProfile, FriendlyRelationship, Person, PersonDraft, PersonMedia, Relationship, SaveStatus, SpouseStatus, WorkspaceInfo, WorkspaceMember } from '../types/family'
import type { FamilyCommitConflictDetails, FamilyOperation, FamilyOperationConflict, StoredFamilyDraft } from '../types/familyOperations'
import type { CollaborationStatus, DraftReviewRequest, DraftReviewResult, MirrorSyncResult, ReviewDraft } from '../types/collaboration'
import { generateNextPersonId } from '../utils/personId'
import { generateNextRelationshipId } from '../utils/relationshipId'

export interface NewPersonConnection {
  kind: FriendlyRelationship
  relatedPersonIds: string[]
  spouseStatus?: SpouseStatus
}

interface MockBackup extends FamilyBackup { data: FamilyData }
interface DraftRecovery { draft: StoredFamilyDraft; reason: string }

const emptyFamilyData = (): FamilyData => ({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  profiles: [], persons: [], relationships: [], media: [],
  settings: { timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN', duplicateSuppressions: [] },
})

function cloneData(data: FamilyData): FamilyData { return structuredClone(data) }
function equal(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right) }
function nextProfileId(ids: string[]): string {
  const max = ids.reduce((current, id) => { const match = /^F(\d+)$/i.exec(id.trim()); return match ? Math.max(current, Number(match[1])) : current }, 0)
  return `F${String(max + 1).padStart(4, '0')}`
}
function changedFields(before: object, after: object): { changes: Record<string, unknown>; baseValues: Record<string, unknown> } {
  const changes: Record<string, unknown> = {}
  const baseValues: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(after)) {
    if (key === 'createdAt' || key === 'updatedAt') continue
    const previous = (before as Record<string, unknown>)[key]
    if (!equal(previous, value)) { changes[key] = value; baseValues[key] = previous }
  }
  return { changes, baseValues }
}
function operationConflictKey(conflict: FamilyOperationConflict): string { return `${conflict.operationId}:${conflict.field}` }

export function useFamilyData(userId = 'mock-user') {
  const useMockData = import.meta.env.DEV && import.meta.env.VITE_USE_MOCK_DATA === 'true'
  const repository = useRef<FamilyRepository | undefined>(undefined)
  const revision = useRef<FamilyDataRevision | undefined>(undefined)
  const pendingRef = useRef<FamilyOperation[]>([])
  const draftReady = useRef(false)
  const commitId = useRef<string | undefined>(undefined)
  const commitOutcomeUnknown = useRef(false)
  const submittedDraftRevision = useRef<number | undefined>(undefined)
  const submittedOperationIds = useRef<Set<string>>(new Set())
  const collaborationRefreshing = useRef(false)
  const mockData = useRef<FamilyData>(cloneData(sampleFamilyData))
  const mockBackups = useRef<MockBackup[]>([])
  const [savedData, setSavedData] = useState<FamilyData>(emptyFamilyData)
  const [familyData, setFamilyData] = useState<FamilyData>(emptyFamilyData)
  const [pendingOperations, setPendingOperations] = useState<FamilyOperation[]>([])
  const [activeProfileId, setActiveProfileIdState] = useState<string>()
  const [workspace, setWorkspace] = useState<WorkspaceInfo>()
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>()
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [conflictDetails, setConflictDetails] = useState<FamilyCommitConflictDetails>()
  const [draftRecovery, setDraftRecovery] = useState<DraftRecovery>()
  const [collaborationState, setCollaborationState] = useState<CollaborationStatus>()
  const [reviewDrafts, setReviewDrafts] = useState<ReviewDraft[]>([])
  const [mirrorSync, setMirrorSync] = useState<MirrorSyncResult>()

  const setOperations = useCallback((operations: FamilyOperation[]) => {
    pendingRef.current = operations
    setPendingOperations(operations)
  }, [])

  const selectAvailableProfile = useCallback((next: FamilyData) => {
    setActiveProfileIdState((current) => next.profiles.some((profile) => profile.id === current)
      ? current : next.profiles.find((profile) => profile.isActive)?.id ?? next.profiles[0]?.id)
  }, [])

  const applyCommittedSnapshot = useCallback((next: FamilyData, nextRevision?: FamilyDataRevision) => {
    setSavedData(next); setFamilyData(next); revision.current = nextRevision; setOperations([]); selectAvailableProfile(next)
    setSaveStatus('saved'); setConflictDetails(undefined); commitId.current = undefined; commitOutcomeUnknown.current = false
  }, [selectAvailableProfile, setOperations])

  const restoreDraft = useCallback(async (next: FamilyData, nextRevision: FamilyDataRevision | undefined, workspaceId: string) => {
    setSavedData(next); revision.current = nextRevision; selectAvailableProfile(next); setDraftRecovery(undefined)
    const stored = await loadFamilyDraft(workspaceId, userId).catch(() => undefined)
    if (!stored) { setFamilyData(next); setOperations([]); setSaveStatus('saved'); return }
    const validShape = stored.schemaVersion === FAMILY_DRAFT_SCHEMA_VERSION && Array.isArray(stored.operations) && stored.operations.every(isFamilyOperation)
    if (!validShape || isExpiredFamilyDraft(stored)) {
      setFamilyData(next); setOperations([])
      setDraftRecovery({ draft: stored, reason: validShape ? 'Draft đã quá 7 ngày và cần bạn xác nhận.' : 'Phiên bản Draft không còn tương thích.' })
      return
    }
    try {
      const operations = compactFamilyOperations(stored.operations)
      const restored = requireValidFamilyData(replayFamilyOperations(next, operations))
      setFamilyData(restored); setOperations(operations); setSaveStatus(operations.length ? 'unsaved' : 'saved')
      if (operations.length) setNotice(`Đã khôi phục ${operations.length} thay đổi chưa lưu.`)
    } catch {
      setFamilyData(next); setOperations([]); setDraftRecovery({ draft: stored, reason: 'Draft không thể áp dụng an toàn lên dữ liệu mới nhất.' })
    }
  }, [selectAvailableProfile, setOperations, userId])

  const refresh = useCallback(async () => {
    setLoading(true); setError(undefined)
    try {
      if (useMockData) {
        const next = cloneData(mockData.current)
        setWorkspace(undefined); setSavedData(next); setFamilyData(next); selectAvailableProfile(next); setSaveStatus(pendingRef.current.length ? 'unsaved' : 'saved')
      } else {
        if (!repository.current || (activeWorkspaceId && repository.current.workspace.id !== activeWorkspaceId)) repository.current = await FamilyRepository.connect(activeWorkspaceId)
        let connected = repository.current
        let snapshot = await connected.load()
        const storedDraft = await loadFamilyDraft(connected.workspace.id, userId).catch(() => undefined)
        const sharedWorkspace = sharedWorkspaceForEmptyOwner(connected.workspace, connected.workspaces, snapshot.data, Boolean(storedDraft))
        if (sharedWorkspace) {
          repository.current = await FamilyRepository.connect(sharedWorkspace.id)
          connected = repository.current
          snapshot = await connected.load()
          setNotice('Đã mở gia đình được chia sẻ với bạn.')
        }
        setWorkspaces(connected.workspaces); setWorkspace(connected.workspace); setActiveWorkspaceId(connected.workspace.id)
        if (pendingRef.current.length) {
          const merged = mergeFamilyOperations(snapshot.data, pendingRef.current)
          if (merged.conflicts.length) {
            setConflictDetails({ conflicts: merged.conflicts, latestSnapshot: snapshot }); setSaveStatus('conflict')
          } else {
            setSavedData(snapshot.data); revision.current = snapshot.revision
            setFamilyData(requireValidFamilyData(replayFamilyOperations(snapshot.data, pendingRef.current)))
            setSaveStatus('unsaved'); setNotice('Đã cập nhật Draft trên dữ liệu mới nhất.')
          }
        } else await restoreDraft(snapshot.data, snapshot.revision, connected.workspace.id)
        setActivity(await connected.listActivity().catch(() => []))
      }
      draftReady.current = true
    } catch (caught) {
      console.error(caught); setError(caught instanceof Error ? caught.message : 'Không thể tải dữ liệu gia đình.')
    } finally { setLoading(false) }
  }, [activeWorkspaceId, restoreDraft, selectAvailableProfile, useMockData, userId])

  useEffect(() => {
    if (repository.current?.workspace.id !== activeWorkspaceId) {
      repository.current = undefined; revision.current = undefined; draftReady.current = false
      submittedDraftRevision.current = undefined; submittedOperationIds.current = new Set(); setCollaborationState(undefined); setReviewDrafts([]); setMirrorSync(undefined)
    }
    void refresh()
  }, [activeWorkspaceId, refresh])

  useEffect(() => {
    if (!draftReady.current || useMockData || !workspace?.id || draftRecovery) return
    if (!pendingOperations.length) { void deleteFamilyDraft(workspace.id, userId); return }
    void saveFamilyDraft({ workspaceId: workspace.id, userId, baseRevision: revision.current, operations: pendingOperations, updatedAt: new Date().toISOString(), schemaVersion: FAMILY_DRAFT_SCHEMA_VERSION })
      .catch(() => setError('Không thể lưu Draft trên thiết bị. Các thay đổi vẫn còn trong tab này.'))
  }, [draftRecovery, pendingOperations, useMockData, userId, workspace?.id])

  useEffect(() => {
    if (!pendingOperations.length) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [pendingOperations.length])

  const rebaseFromRemote = useCallback(async () => {
    if (!repository.current) return
    const latest = await repository.current.load()
    if (!pendingRef.current.length) { applyCommittedSnapshot(latest.data, latest.revision); return }
    const merged = mergeFamilyOperations(latest.data, pendingRef.current)
    if (merged.conflicts.length) {
      setConflictDetails({ conflicts: merged.conflicts, latestSnapshot: latest }); setSaveStatus('conflict'); return
    }
    setSavedData(latest.data); revision.current = latest.revision; setFamilyData(requireValidFamilyData(replayFamilyOperations(latest.data, pendingRef.current)))
    setNotice('Draft đã được cập nhật trên dữ liệu Drive mới nhất.')
  }, [applyCommittedSnapshot])

  useEffect(() => {
    if (useMockData || !workspace?.id || typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(`famnesia:${workspace.id}:${userId}`)
    channel.onmessage = (event) => { if (event.data?.type === 'family-committed') void rebaseFromRemote() }
    return () => channel.close()
  }, [rebaseFromRemote, useMockData, userId, workspace?.id])

  const continueMirrorSync = useCallback(async (status: CollaborationStatus) => {
    if (!repository.current || status.workspaceRole !== 'contributor' || !navigator.onLine) return
    const synced = status.mirror?.syncedGeneration ?? -1
    if (synced >= status.mirrorGeneration && status.mirror?.status !== 'failed') return
    try {
      let result = await repository.current.syncMirror()
      setMirrorSync(result)
      for (let chunk = 1; result.remaining > 0 && chunk < 3; chunk += 1) {
        result = await repository.current.syncMirror(); setMirrorSync(result)
      }
    } catch (caught) {
      setMirrorSync({ status: 'failed', generation: status.mirrorGeneration, processed: 0, remaining: 0 })
      setNotice(caught instanceof Error ? `Mirror Drive chưa đồng bộ: ${caught.message}` : 'Mirror Drive chưa đồng bộ; Famnesia sẽ thử lại sau.')
    }
  }, [])

  const refreshCollaboration = useCallback(async () => {
    if (useMockData || !workspace?.id || !repository.current || collaborationRefreshing.current) return
    collaborationRefreshing.current = true
    try {
      const status = await repository.current.collaborationStatus()
      setCollaborationState(status)
      if (!status.enabled) { setReviewDrafts([]); return }
      if (status.workspaceRole === 'owner') {
        setReviewDrafts(await repository.current.listDrafts())
      } else if (status.workspaceRole === 'contributor') {
        const serverDraft = status.ownDraft
        if (serverDraft && serverDraft.revision !== submittedDraftRevision.current) {
          const reviewedIds = new Set(serverDraft.reviewHistory.flatMap((event) => event.operationIds))
          const localOnly = pendingRef.current.filter((operation) => !submittedOperationIds.current.has(operation.id) && !reviewedIds.has(operation.id))
          if (serverDraft.status === 'invalid') {
            const latest = await repository.current.load()
            const preserved = compactFamilyOperations(pendingRef.current)
            setSavedData(latest.data); revision.current = latest.revision; setFamilyData(requireValidFamilyData(replayFamilyOperations(latest.data, preserved))); setOperations(preserved); setSaveStatus('unsaved')
            setNotice(serverDraft.note ? `Draft trên Drive không hợp lệ: ${serverDraft.note} Thay đổi cục bộ vẫn được giữ để gửi lại.` : 'Draft trên Drive không hợp lệ. Thay đổi cục bộ vẫn được giữ để gửi lại.')
          } else if (serverDraft.status === 'approved') {
            const latest = await repository.current.load()
            if (localOnly.length) {
              setSavedData(latest.data); revision.current = latest.revision; setFamilyData(requireValidFamilyData(replayFamilyOperations(latest.data, localOnly))); setOperations(localOnly); setSaveStatus('unsaved')
              setNotice('Owner đã duyệt revision trước. Các thay đổi mới của bạn vẫn được giữ lại.')
            } else {
              applyCommittedSnapshot(latest.data, latest.revision)
              if (workspace.id) await deleteFamilyDraft(workspace.id, userId).catch(() => undefined)
              setNotice('Owner đã duyệt toàn bộ thay đổi của bạn.')
            }
          } else if (serverDraft.status === 'rejected') {
            const latest = await repository.current.load()
            setSavedData(latest.data); revision.current = latest.revision; setFamilyData(requireValidFamilyData(replayFamilyOperations(latest.data, localOnly))); setOperations(localOnly); setSaveStatus(localOnly.length ? 'unsaved' : 'saved')
            setNotice(serverDraft.note ? `Owner đã từ chối Draft: ${serverDraft.note}` : 'Owner đã từ chối Draft.')
          } else {
            const unique = [...serverDraft.operations, ...localOnly.filter((operation) => !serverDraft.operations.some((remote) => remote.id === operation.id))]
            const operations = compactFamilyOperations(unique)
            const latest = await repository.current.load()
            const merged = mergeFamilyOperations(latest.data, operations)
            setSavedData(latest.data); revision.current = latest.revision
            if (merged.conflicts.length) { setConflictDetails({ conflicts: merged.conflicts, latestSnapshot: latest }); setSaveStatus('conflict') }
            else { setFamilyData(requireValidFamilyData(replayFamilyOperations(latest.data, operations))); setOperations(operations); setSaveStatus(serverDraft.status === 'needs_changes' ? 'conflict' : 'saved') }
            if (serverDraft.status === 'partially_reviewed') setNotice(serverDraft.note ? `Owner đã xử lý một phần Draft: ${serverDraft.note}` : 'Owner đã xử lý một phần; phần còn lại vẫn đang chờ.')
            if (serverDraft.status === 'needs_changes') setNotice(serverDraft.note ? `Draft cần chỉnh sửa: ${serverDraft.note}` : 'Draft cần chỉnh sửa trước khi gửi lại.')
          }
          submittedDraftRevision.current = serverDraft.revision
          submittedOperationIds.current = new Set(serverDraft.operations.map((operation) => operation.id))
        }
        void continueMirrorSync(status)
      }
    } catch (caught) {
      if (!(caught instanceof ApiError && caught.code === 'COLLAB_APPROVAL_DISABLED')) console.error(caught)
    } finally { collaborationRefreshing.current = false }
  }, [applyCommittedSnapshot, continueMirrorSync, setOperations, useMockData, userId, workspace?.id])

  useEffect(() => {
    if (useMockData || !workspace?.id) return
    void refreshCollaboration()
    const poll = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshCollaboration() }, 60_000)
    const focus = () => void refreshCollaboration()
    window.addEventListener('focus', focus)
    return () => { window.clearInterval(poll); window.removeEventListener('focus', focus) }
  }, [refreshCollaboration, useMockData, workspace?.id])

  const stageOperations = useCallback((incoming: FamilyOperation[]) => {
    if (!useMockData && !workspace?.canEdit) throw new Error('Bạn chỉ có quyền xem workspace này.')
    if (commitOutcomeUnknown.current) throw new Error('Hãy thử Lưu tất cả lại để xác minh lần lưu trước trước khi chỉnh sửa thêm.')
    const operations = compactFamilyOperations([...pendingRef.current, ...incoming])
    const next = requireValidFamilyData(replayFamilyOperations(savedData, operations))
    setFamilyData(next); setOperations(operations); setSaveStatus(operations.length ? (navigator.onLine ? 'unsaved' : 'offline') : 'saved')
    setError(undefined); setNotice(undefined); setConflictDetails(undefined); commitId.current = undefined
  }, [savedData, setOperations, useMockData, workspace?.canEdit])

  const runUpload = useCallback(async <T,>(label: string, action: () => Promise<T>): Promise<T> => {
    setBusy(label); setError(undefined)
    try { return await action() }
    catch (caught) { const message = caught instanceof Error ? caught.message : 'Không thể hoàn tất thao tác.'; setError(message); throw caught }
    finally { setBusy(undefined) }
  }, [])

  const uploadPhotos = useCallback(async (files: File[], profileId: string, personId: string): Promise<string[]> => {
    if (!files.length) return []
    if (!useMockData && typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('Không thể tải ảnh khi đang ngoại tuyến. Các chỉnh sửa khác vẫn có thể lưu vào Draft.')
    if (useMockData) return files.map((_, index) => `mock-${Date.now()}-${index}`)
    if (!repository.current) throw new Error('Workspace chưa sẵn sàng.')
    const optimized = await Promise.all(files.map(async (file) => {
      const original = await optimizePhoto(file)
      return { original, thumbnail: await createPhotoThumbnail(original) }
    }))
    const uploaded: string[] = []
    try { for (const photo of optimized) uploaded.push(await repository.current.uploadPhoto(photo.original, profileId, personId, photo.thumbnail)); return uploaded }
    catch (caught) { await Promise.allSettled(uploaded.map((id) => repository.current?.deletePhoto(id))); throw caught }
  }, [useMockData])

  const activeProfile = familyData.profiles.find((profile) => profile.id === activeProfileId)
  const persons = useMemo(() => familyData.persons.filter((person) => person.profileId === activeProfileId), [activeProfileId, familyData.persons])
  const relationships = useMemo(() => familyData.relationships.filter((relationship) => relationship.profileId === activeProfileId), [activeProfileId, familyData.relationships])
  const media = useMemo(() => familyData.media.filter((item) => item.profileId === activeProfileId), [activeProfileId, familyData.media])

  const setActiveProfileId = useCallback((profileId: string) => { if (familyData.profiles.some((profile) => profile.id === profileId)) setActiveProfileIdState(profileId) }, [familyData.profiles])

  const createProfile = useCallback(async (name: string, description = '', lineageSurname = '') => {
    const id = nextProfileId(familyData.profiles.map((profile) => profile.id))
    const profile: FamilyProfile = { id, name: name.trim(), lineageSurname: lineageSurname.trim(), description: description.trim(), subjectPersonId: null, photoFileId: null, requiresSecret: false, isActive: true }
    if (!profile.name) throw new Error('Hãy nhập tên gia đình.')
    stageOperations([createOperation({ type: 'profile.create', entityId: id, profileId: id, value: profile })]); setActiveProfileIdState(id); return profile
  }, [familyData.profiles, stageOperations])

  const updateProfile = useCallback(async (profileId: string, name: string, description = '', lineageSurname = '') => {
    const current = familyData.profiles.find((item) => item.id === profileId); if (!current) throw new Error('Không tìm thấy gia đình cần chỉnh sửa.')
    const next = { ...current, name: name.trim(), description: description.trim(), lineageSurname: lineageSurname.trim() }; if (!next.name) throw new Error('Hãy nhập tên gia đình.')
    const diff = changedFields(current, next); if (Object.keys(diff.changes).length) stageOperations([createOperation({ type: 'profile.update', entityId: profileId, profileId, ...diff })])
  }, [familyData.profiles, stageOperations])

  const setSubject = useCallback(async (personId: string) => {
    if (!activeProfile || !persons.some((person) => person.id === personId)) throw new Error('Chủ thể phải thuộc gia đình đang chọn.')
    stageOperations([createOperation({ type: 'subject.set', entityId: activeProfile.id, profileId: activeProfile.id, changes: { subjectPersonId: personId }, baseValues: { subjectPersonId: activeProfile.subjectPersonId ?? null } })])
  }, [activeProfile, persons, stageOperations])

  const personFromDraft = useCallback((id: string, profileId: string, draft: PersonDraft, current?: Person): Person => {
    const now = new Date().toISOString()
    return { ...current, id, profileId, name: draft.name.trim(), nickname: draft.nickname?.trim() || null, gender: draft.gender, birthDate: draft.birthDate || null, isDeceased: draft.isDeceased,
      deathDate: draft.isDeceased ? draft.deathDate || null : null, deathLunar: draft.isDeceased && draft.deathLunarDay && draft.deathLunarMonth ? { day: draft.deathLunarDay, month: draft.deathLunarMonth, leapMonth: Boolean(draft.deathLunarLeapMonth) } : null,
      phone1: draft.phone1?.trim() ?? '', phone2: draft.phone2?.trim() ?? '', address: draft.address?.trim() ?? '', note: draft.note?.trim() ?? '', ancestralRole: draft.ancestralRole, sortOrder: draft.sortOrder,
      createdAt: current?.createdAt ?? now, updatedAt: now, confidence: { birthDate: draft.birthDateConfidence, deathDate: draft.deathDateConfidence } }
  }, [])

  const mediaAttachOperations = useCallback((photoIds: string[], profileId: string, personId: string, existingCount: number): FamilyOperation[] => {
    const ids = familyData.media.map((item) => item.id); const now = new Date().toISOString()
    return photoIds.map((fileId, index) => { const id = generateNextMediaId(ids); ids.push(id); const value: PersonMedia = { id, profileId, personId, fileId, type: 'photo', isPrimary: existingCount === 0 && index === 0, caption: '', takenDate: null, sortOrder: existingCount + index + 1, createdAt: now }; return createOperation({ type: 'media.attach', entityId: id, profileId, value }) })
  }, [familyData.media])

  const addPerson = useCallback(async (draft: PersonDraft, connection?: NewPersonConnection) => runUpload('Đang tải ảnh và thêm vào Draft…', async () => {
    if (!activeProfile) throw new Error('Hãy tạo hoặc chọn một gia đình trước.')
    const id = generateNextPersonId(familyData.persons.map((person) => person.id)); const created = personFromDraft(id, activeProfile.id, draft)
    const photoIds = await uploadPhotos(draft.photos ?? [], activeProfile.id, id)
    const operations: FamilyOperation[] = [createOperation({ type: 'person.create', entityId: id, profileId: activeProfile.id, value: created })]
    const pendingRelationships: Relationship[] = []
    for (const relatedId of connection?.relatedPersonIds ?? []) {
      const type = connection!.kind === 'spouse' ? 'spouse' : 'parent'; const person1Id = connection!.kind === 'parent' ? id : relatedId; const person2Id = connection!.kind === 'child' ? id : connection!.kind === 'parent' ? relatedId : id
      const relationship: Relationship = { id: generateNextRelationshipId([...familyData.relationships, ...pendingRelationships].map((item) => item.id)), profileId: activeProfile.id, person1Id, person2Id, type, status: type === 'spouse' ? connection?.spouseStatus ?? 'unknown' : undefined, sortOrder: draft.sortOrder, createdAt: created.createdAt, updatedAt: created.updatedAt }
      const validation = validateRelationship(relationship, [...relationships, ...pendingRelationships], [...persons, created]); if (validation) { await Promise.allSettled(photoIds.map((photoId) => repository.current?.deletePhoto(photoId))); throw new Error(validation) }
      pendingRelationships.push(relationship); operations.push(createOperation({ type: 'relationship.create', entityId: relationship.id, profileId: activeProfile.id, value: relationship }))
    }
    operations.push(...mediaAttachOperations(photoIds, activeProfile.id, id, 0)); stageOperations(operations); return created
  }), [activeProfile, familyData.persons, familyData.relationships, mediaAttachOperations, personFromDraft, persons, relationships, runUpload, stageOperations, uploadPhotos])

  const updatePerson = useCallback(async (id: string, draft: PersonDraft) => runUpload('Đang tải ảnh và cập nhật Draft…', async () => {
    const current = familyData.persons.find((person) => person.id === id); if (!current) throw new Error('Thành viên này không còn tồn tại.')
    const updated = personFromDraft(id, current.profileId ?? '', draft, current); const diff = changedFields(current, updated); const photoIds = await uploadPhotos(draft.photos ?? [], current.profileId ?? '', id)
    const operations: FamilyOperation[] = []
    if (Object.keys(diff.changes).length) operations.push(createOperation({ type: 'person.update', entityId: id, profileId: current.profileId, ...diff }))
    operations.push(...mediaAttachOperations(photoIds, current.profileId ?? '', id, familyData.media.filter((item) => item.personId === id).length)); if (operations.length) stageOperations(operations)
  }), [familyData.media, familyData.persons, mediaAttachOperations, personFromDraft, runUpload, stageOperations, uploadPhotos])

  const addPersonMedia = useCallback(async (personId: string, files: File[]) => runUpload('Đang tải ảnh vào kho media riêng tư…', async () => {
    const person = familyData.persons.find((item) => item.id === personId); if (!person || !files.length) return
    const photoIds = await uploadPhotos(files, person.profileId ?? '', personId)
    stageOperations(mediaAttachOperations(photoIds, person.profileId ?? '', personId, familyData.media.filter((item) => item.personId === personId).length))
  }), [familyData.media, familyData.persons, mediaAttachOperations, runUpload, stageOperations, uploadPhotos])

  const setPrimaryMedia = useCallback(async (mediaId: string) => {
    const target = familyData.media.find((item) => item.id === mediaId); if (!target) throw new Error('Không tìm thấy ảnh này.')
    const previous = familyData.media.find((item) => item.personId === target.personId && item.isPrimary)?.id ?? null
    stageOperations([createOperation({ type: 'media.primary.set', entityId: mediaId, profileId: target.profileId, changes: { personId: target.personId, primaryMediaId: mediaId }, baseValues: { primaryMediaId: previous } })])
  }, [familyData.media, stageOperations])

  const updateMediaCaption = useCallback(async (mediaId: string, caption: string) => {
    const current = familyData.media.find((item) => item.id === mediaId); if (!current || current.caption === caption.trim()) return
    stageOperations([createOperation({ type: 'media.caption.update', entityId: mediaId, profileId: current.profileId, changes: { caption: caption.trim() }, baseValues: { caption: current.caption ?? '' } })])
  }, [familyData.media, stageOperations])

  const deletePersonMedia = useCallback(async (mediaId: string) => {
    const target = familyData.media.find((item) => item.id === mediaId); if (!target) return
    const newlyUploaded = pendingRef.current.find((item) => item.type === 'media.attach' && item.entityId === mediaId)
    stageOperations([createOperation({ type: 'media.delete', entityId: mediaId, profileId: target.profileId, baseValues: { $entity: savedData.media.find((item) => item.id === mediaId) ?? target } })])
    const objectKey = mediaReferenceId(target)
    if (newlyUploaded && objectKey && !useMockData) await repository.current?.deletePhoto(objectKey).catch(() => setNotice('Ảnh không còn trong Draft và sẽ được dọn tự động sau.'))
  }, [familyData.media, savedData.media, stageOperations, useMockData])

  const addRelationship = useCallback(async (input: Omit<Relationship, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!activeProfile) throw new Error('Hãy chọn gia đình trước.'); const now = new Date().toISOString()
    const relationship: Relationship = { ...input, profileId: activeProfile.id, id: generateNextRelationshipId(familyData.relationships.map((item) => item.id)), createdAt: now, updatedAt: now }
    const validation = validateRelationship(relationship, relationships, persons); if (validation) throw new Error(validation)
    stageOperations([createOperation({ type: 'relationship.create', entityId: relationship.id, profileId: activeProfile.id, value: relationship })])
  }, [activeProfile, familyData.relationships, persons, relationships, stageOperations])

  const updateRelationship = useCallback(async (relationship: Relationship) => {
    const current = familyData.relationships.find((item) => item.id === relationship.id); if (!current) throw new Error('Quan hệ này không còn tồn tại.')
    const updated = { ...relationship, profileId: activeProfile?.id ?? relationship.profileId, updatedAt: new Date().toISOString() }; const validation = validateRelationship(updated, relationships.filter((item) => item.id !== relationship.id), persons); if (validation) throw new Error(validation)
    const diff = changedFields(current, updated); if (Object.keys(diff.changes).length) stageOperations([createOperation({ type: 'relationship.update', entityId: relationship.id, profileId: updated.profileId, ...diff })])
  }, [activeProfile?.id, familyData.relationships, persons, relationships, stageOperations])

  const deleteRelationship = useCallback(async (id: string) => {
    const current = familyData.relationships.find((item) => item.id === id); if (!current) return
    stageOperations([createOperation({ type: 'relationship.delete', entityId: id, profileId: current.profileId, baseValues: { $entity: savedData.relationships.find((item) => item.id === id) ?? current } })])
  }, [familyData.relationships, savedData.relationships, stageOperations])

  const deletePerson = useCallback(async (id: string) => {
    const person = familyData.persons.find((item) => item.id === id); if (!person) return
    const newPhotoIds = pendingRef.current.filter((item) => item.type === 'media.attach' && (item.value as PersonMedia | undefined)?.personId === id).map(operationReferencesNewPhoto).filter((value): value is string => Boolean(value))
    stageOperations([createOperation({ type: 'person.delete', entityId: id, profileId: person.profileId, baseValues: { $entity: savedData.persons.find((item) => item.id === id) ?? person } })])
    if (!useMockData) await Promise.allSettled(newPhotoIds.map((photoId) => repository.current?.deletePhoto(photoId)))
  }, [familyData.persons, savedData.persons, stageOperations, useMockData])

  const saveAll = useCallback(async () => {
    const operations = compactFamilyOperations(pendingRef.current); if (!operations.length) return true
    if (!useMockData && typeof navigator !== 'undefined' && !navigator.onLine) { setSaveStatus('offline'); setError('Đang ngoại tuyến — Draft vẫn an toàn trên thiết bị.'); return false }
    const submitting = !useMockData && Boolean(workspace?.canSubmitDraft)
    setBusy(submitting ? 'Đang gửi owner duyệt…' : 'Đang lưu tất cả thay đổi…'); setSaveStatus('saving'); setError(undefined)
    try {
      if (useMockData) {
        const saved = requireValidFamilyData({ ...replayFamilyOperations(mockData.current, operations), updatedAt: new Date().toISOString() }); mockData.current = cloneData(saved); applyCommittedSnapshot(saved)
      } else {
        if (!repository.current) throw new Error('Workspace chưa sẵn sàng.')
        commitId.current ??= `commit_${crypto.randomUUID()}`
        const request = { commitId: commitId.current, baseRevision: revision.current, operations, clientCreatedAt: new Date().toISOString() }
        if (submitting) {
          const result = await repository.current.submitDraft(request)
          submittedDraftRevision.current = result.draft.revision; submittedOperationIds.current = new Set(result.draft.operations.map((item) => item.id))
          setCollaborationState((current) => current ? { ...current, ownDraft: result.draft, mirrorGeneration: result.mirrorGeneration } : current)
          setSaveStatus('saved'); setNotice(`Đã gửi ${operations.length} thay đổi cho owner duyệt.`)
          return true
        }
        const result = await repository.current.commit(request)
        applyCommittedSnapshot(result.snapshot.data, result.snapshot.revision); setActivity(await repository.current.listActivity().catch(() => activity))
        if (workspace?.id && typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel(`famnesia:${workspace.id}:${userId}`); channel.postMessage({ type: 'family-committed', revision: result.snapshot.revision }); channel.close() }
      }
      if (workspace?.id && !submitting) await deleteFamilyDraft(workspace.id, userId).catch(() => undefined)
      setNotice(`Đã lưu ${operations.length} thay đổi.`); return true
    } catch (caught) {
      console.error(caught)
      if (caught instanceof ApiError && caught.code === 'FAMILY_COMMIT_CONFLICT') { commitOutcomeUnknown.current = false; setConflictDetails(caught.details as FamilyCommitConflictDetails); setSaveStatus('conflict'); setError('Có thay đổi trùng nhau cần bạn chọn phiên bản.'); return false }
      commitOutcomeUnknown.current = caught instanceof CommitOutcomeUnknownError
      setSaveStatus('failed'); setError(caught instanceof Error ? `${caught.message} Draft vẫn an toàn.` : 'Lưu thất bại — Draft vẫn an toàn.'); return false
    } finally { setBusy(undefined) }
  }, [activity, applyCommittedSnapshot, useMockData, userId, workspace?.canSubmitDraft, workspace?.id])

  const discardDraft = useCallback(async () => {
    if (commitOutcomeUnknown.current) { setError('Chưa thể hủy Draft khi kết quả lần lưu trước chưa được xác minh. Hãy thử Lưu tất cả lại.'); return }
    const photoIds = pendingRef.current.map(operationReferencesNewPhoto).filter((value): value is string => Boolean(value))
    setFamilyData(savedData); setOperations([]); selectAvailableProfile(savedData); setConflictDetails(undefined); setSaveStatus('saved'); commitId.current = undefined
    if (!useMockData) await Promise.allSettled(photoIds.map((photoId) => repository.current?.deletePhoto(photoId)))
    if (workspace?.id) await deleteFamilyDraft(workspace.id, userId).catch(() => undefined)
    setNotice('Đã hủy toàn bộ thay đổi chưa lưu.')
  }, [savedData, selectAvailableProfile, setOperations, useMockData, userId, workspace?.id])

  const undoOperation = useCallback(async (operationId: string) => {
    const remaining = removeOperationWithDependencies(pendingRef.current, operationId)
    const remainingIds = new Set(remaining.map((item) => item.id)); const removedPhotoIds = pendingRef.current.filter((item) => !remainingIds.has(item.id)).map(operationReferencesNewPhoto).filter((value): value is string => Boolean(value))
    const next = requireValidFamilyData(replayFamilyOperations(savedData, remaining)); setFamilyData(next); setOperations(remaining); setSaveStatus(remaining.length ? 'unsaved' : 'saved')
    if (!useMockData) await Promise.allSettled(removedPhotoIds.map((photoId) => repository.current?.deletePhoto(photoId)))
  }, [savedData, setOperations, useMockData])

  const resolveConflictsAndSave = useCallback(async (resolutions: Record<string, 'remote' | 'local'>) => {
    if (!conflictDetails) return false
    let operations = structuredClone(pendingRef.current)
    for (const conflict of conflictDetails.conflicts) {
      const choice = resolutions[operationConflictKey(conflict)] ?? 'remote'; const index = operations.findIndex((item) => item.id === conflict.operationId); if (index < 0) continue
      const operation = operations[index]
      if (conflict.field.startsWith('$')) { if (choice === 'remote' || conflict.reason !== 'field_changed') operations.splice(index, 1); continue }
      if (choice === 'remote') {
        const changes = { ...(operation.changes ?? {}) }; const baseValues = { ...(operation.baseValues ?? {}) }; delete changes[conflict.field]; delete baseValues[conflict.field]
        if (!Object.keys(changes).length || (operation.type === 'media.primary.set' && Object.keys(changes).every((field) => field === 'personId'))) operations.splice(index, 1)
        else operations[index] = { ...operation, changes, baseValues }
      } else operations[index] = { ...operation, baseValues: { ...(operation.baseValues ?? {}), [conflict.field]: conflict.remoteValue } }
    }
    operations = compactFamilyOperations(operations); setSavedData(conflictDetails.latestSnapshot.data); revision.current = conflictDetails.latestSnapshot.revision
    setFamilyData(requireValidFamilyData(replayFamilyOperations(conflictDetails.latestSnapshot.data, operations))); setOperations(operations); setConflictDetails(undefined); commitId.current = undefined
    if (!operations.length) { setSaveStatus('saved'); return true }
    setSaveStatus('unsaved'); return false
  }, [conflictDetails, setOperations])

  const downloadRecoveryDraft = useCallback(() => {
    if (!draftRecovery) return
    const blob = new Blob([`${JSON.stringify(draftRecovery.draft, null, 2)}\n`], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `famnesia-draft-recovery-${Date.now()}.json`; anchor.click(); URL.revokeObjectURL(url)
  }, [draftRecovery])
  const deleteRecoveryDraft = useCallback(async () => { if (draftRecovery) await deleteFamilyDraft(draftRecovery.draft.workspaceId, draftRecovery.draft.userId); setDraftRecovery(undefined) }, [draftRecovery])

  const requireNoDraft = useCallback(() => { if (pendingRef.current.length) throw new Error('Hãy Lưu tất cả hoặc Hủy Draft trước khi Import, Restore hoặc Gộp trùng lặp.') }, [])
  const saveFullData = useCallback(async (next: FamilyData, mode: 'replace' | 'restore' | 'merge') => {
    if (useMockData) { const saved = requireValidFamilyData({ ...next, updatedAt: new Date().toISOString() }); mockData.current = cloneData(saved); applyCommittedSnapshot(saved); return }
    if (!repository.current) throw new Error('Workspace chưa sẵn sàng.'); const snapshot = await repository.current.save(next, revision.current, mode); applyCommittedSnapshot(snapshot.data, snapshot.revision); setActivity(await repository.current.listActivity().catch(() => []))
  }, [applyCommittedSnapshot, useMockData])

  const backupNow = useCallback(async (reason = 'manual'): Promise<FamilyBackup> => {
    setBusy('Đang tạo bản sao lưu…'); setError(undefined)
    try { if (useMockData) { const backup: MockBackup = { id: `mock-${Date.now()}`, name: `famnesia_${Date.now()}.json`, createdTime: new Date().toISOString(), reason, data: cloneData(familyData) }; mockBackups.current.unshift(backup); return backup } if (!repository.current) throw new Error('Workspace chưa sẵn sàng.'); return await repository.current.backup(familyData, reason) }
    finally { setBusy(undefined) }
  }, [familyData, useMockData])
  const listBackups = useCallback(async () => {
    if (useMockData) return mockBackups.current.map(({ data: _, ...backup }) => backup)
    return await repository.current?.listBackups() ?? []
  }, [useMockData])
  const replaceAllData = useCallback(async (replacement: FamilyData, reason = 'manual-import') => { requireNoDraft(); setBusy(reason === 'restore' ? 'Đang khôi phục dữ liệu…' : 'Đang import dữ liệu…'); try { await saveFullData(requireValidFamilyData(replacement), reason === 'restore' ? 'restore' : 'replace') } finally { setBusy(undefined) } }, [requireNoDraft, saveFullData])
  const restoreBackup = useCallback(async (backupId: string) => { requireNoDraft(); const data = useMockData ? mockBackups.current.find((item) => item.id === backupId)?.data : await repository.current?.loadBackup(backupId); if (!data) throw new Error('Không tìm thấy bản sao lưu.'); await replaceAllData(data, 'restore') }, [replaceAllData, requireNoDraft, useMockData])
  const suppressDuplicate = useCallback(async (leftId: string, rightId: string) => { const marker = duplicatePairId(leftId, rightId); if (!(familyData.settings.duplicateSuppressions ?? []).includes(marker)) stageOperations([createOperation({ type: 'settings.duplicate_suppression.add', entityId: marker, value: marker })]) }, [familyData.settings.duplicateSuppressions, stageOperations])
  const mergeDuplicatePeople = useCallback(async (canonicalId: string, duplicateId: string) => { requireNoDraft(); setBusy('Đang gộp thành viên…'); try { await saveFullData(mergePeople(familyData, canonicalId, duplicateId), 'merge') } finally { setBusy(undefined) } }, [familyData, requireNoDraft, saveFullData])

  const switchWorkspace = useCallback((id: string) => { if (!workspaces.some((item) => item.id === id) || id === activeWorkspaceId) return; localStorage.setItem('family-tree-workspace', id); repository.current = undefined; revision.current = undefined; setActiveWorkspaceId(id) }, [activeWorkspaceId, workspaces])
  const connectSharedWorkspace = useCallback(async (id: string) => {
    if (pendingRef.current.length) throw new Error('Hãy Lưu tất cả hoặc Hủy Draft trước khi kết nối gia đình khác.')
    setBusy('Đang kết nối gia đình được chia sẻ…'); setError(undefined)
    try {
      const connected = await FamilyRepository.connectShared(id)
      repository.current = connected; revision.current = undefined; draftReady.current = false
      setWorkspaces(connected.workspaces); setWorkspace(connected.workspace); setActiveWorkspaceId(connected.workspace.id)
      setNotice('Đã kết nối gia đình được chia sẻ. Những lần sau Famnesia sẽ tự mở gia đình này.')
    } finally { setBusy(undefined) }
  }, [])
  const refreshMembers = useCallback(async () => { if (useMockData || !repository.current?.workspace.canManageMembers) { setMembers([]); return [] } const next = await repository.current.listMembers(); setMembers(next); return next }, [useMockData])
  const addMember = useCallback(async (email: string, role: 'contributor' | 'viewer') => { if (!repository.current) throw new Error('Workspace chưa sẵn sàng.'); await repository.current.addMember(email, role); await refreshMembers() }, [refreshMembers])
  const updateMember = useCallback(async (id: string, role: 'contributor' | 'viewer') => { if (!repository.current) throw new Error('Workspace chưa sẵn sàng.'); await repository.current.updateMember(id, role); await refreshMembers() }, [refreshMembers])
  const removeMember = useCallback(async (id: string) => { if (!repository.current) throw new Error('Workspace chưa sẵn sàng.'); await repository.current.removeMember(id); await refreshMembers() }, [refreshMembers])
  const refreshActivity = useCallback(async () => { if (useMockData || !repository.current) return activity; const events = await repository.current.listActivity(); setActivity(events); return events }, [activity, useMockData])
  const reviewDraft = useCallback(async (request: DraftReviewRequest): Promise<DraftReviewResult> => {
    if (!repository.current) throw new Error('Workspace chưa sẵn sàng.')
    if (pendingRef.current.length) throw new Error('Hãy lưu hoặc hủy Draft cục bộ của owner trước khi duyệt đề xuất.')
    setBusy(request.decision === 'approve' ? 'Đang duyệt Draft…' : 'Đang từ chối Draft…'); setError(undefined)
    try {
      const result = await repository.current.reviewDraft(request)
      if (result.snapshot) applyCommittedSnapshot(result.snapshot.data, result.snapshot.revision)
      await refreshCollaboration(); setActivity(await repository.current.listActivity().catch(() => activity))
      setNotice(request.decision === 'approve' ? `Đã duyệt ${result.appliedOperationIds.length} thay đổi.` : `Đã từ chối ${result.appliedOperationIds.length} thay đổi.`)
      return result
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể xử lý Draft.'); throw caught }
    finally { setBusy(undefined) }
  }, [activity, applyCommittedSnapshot, refreshCollaboration])
  const retryMirrorSync = useCallback(async () => {
    if (!repository.current) throw new Error('Workspace chưa sẵn sàng.')
    setBusy('Đang đồng bộ Drive mirror…')
    try { const result = await repository.current.syncMirror(); setMirrorSync(result); await refreshCollaboration(); return result }
    finally { setBusy(undefined) }
  }, [refreshCollaboration])

  return useMemo(() => ({ familyData, savedData, profiles: familyData.profiles, activeProfile, activeProfileId, persons, relationships, media, workspace, workspaces, activeWorkspaceId, members, activity, loading, busy, error, notice, saveStatus, useMockData,
    pendingOperations, conflictDetails, draftRecovery, refresh, setActiveProfileId, createProfile, updateProfile, setSubject, addPerson, updatePerson, addPersonMedia, setPrimaryMedia, updateMediaCaption, deletePersonMedia, addRelationship, updateRelationship, deleteRelationship, deletePerson,
    saveAll, discardDraft, undoOperation, resolveConflictsAndSave, downloadRecoveryDraft, deleteRecoveryDraft,
    backupNow, listBackups, restoreBackup, replaceAllData, switchWorkspace, connectSharedWorkspace, refreshMembers, addMember, updateMember, removeMember, suppressDuplicate, mergeDuplicatePeople, refreshActivity,
    collaborationState, reviewDrafts, mirrorSync, refreshCollaboration, reviewDraft, retryMirrorSync,
  }), [familyData, savedData, activeProfile, activeProfileId, persons, relationships, media, workspace, workspaces, activeWorkspaceId, members, activity, loading, busy, error, notice, saveStatus, useMockData, pendingOperations, conflictDetails, draftRecovery, refresh, setActiveProfileId, createProfile, updateProfile, setSubject, addPerson, updatePerson, addPersonMedia, setPrimaryMedia, updateMediaCaption, deletePersonMedia, addRelationship, updateRelationship, deleteRelationship, deletePerson, saveAll, discardDraft, undoOperation, resolveConflictsAndSave, downloadRecoveryDraft, deleteRecoveryDraft, backupNow, listBackups, restoreBackup, replaceAllData, switchWorkspace, connectSharedWorkspace, refreshMembers, addMember, updateMember, removeMember, suppressDuplicate, mergeDuplicatePeople, refreshActivity, collaborationState, reviewDrafts, mirrorSync, refreshCollaboration, reviewDraft, retryMirrorSync])
}
