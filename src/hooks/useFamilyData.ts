import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sampleFamilyData } from '../data/sampleFamily'
import { validateRelationship } from '../graph/familyValidation'
import { optimizePhoto } from '../media/imageOptimization'
import { generateNextMediaId } from '../media/mediaSelectors'
import { CURRENT_SCHEMA_VERSION, requireValidFamilyData } from '../schema/familyDataSchema'
import { ApiError } from '../services/apiClient'
import { FamilyRepository, type FamilyDataRevision } from '../services/familyRepository'
import { MutationGate } from '../services/mutationGate'
import { canRetryRevisionDrift } from '../services/revisionConflict'
import type {
  FamilyBackup,
  FamilyData,
  FamilyProfile,
  FriendlyRelationship,
  Person,
  PersonDraft,
  PersonMedia,
  Relationship,
  SaveStatus,
  SpouseStatus,
  WorkspaceInfo,
  WorkspaceMember,
} from '../types/family'
import { generateNextPersonId } from '../utils/personId'
import { generateNextRelationshipId } from '../utils/relationshipId'

export interface NewPersonConnection {
  kind: FriendlyRelationship
  relatedPersonIds: string[]
  spouseStatus?: SpouseStatus
}

interface MockBackup extends FamilyBackup { data: FamilyData }

function nextProfileId(ids: string[]): string {
  const max = ids.reduce((current, id) => {
    const match = /^F(\d+)$/i.exec(id.trim())
    return match ? Math.max(current, Number(match[1])) : current
  }, 0)
  return `F${String(max + 1).padStart(4, '0')}`
}

function cloneData(data: FamilyData): FamilyData {
  return structuredClone(data)
}

export function useFamilyData() {
  const useMockData = import.meta.env.DEV && import.meta.env.VITE_USE_MOCK_DATA === 'true'
  const repository = useRef<FamilyRepository | undefined>(undefined)
  const revision = useRef<FamilyDataRevision | undefined>(undefined)
  const mutationGate = useRef(new MutationGate())
  const mockData = useRef<FamilyData>(cloneData(sampleFamilyData))
  const mockBackups = useRef<MockBackup[]>([])
  const [familyData, setFamilyData] = useState<FamilyData>(() => ({
    schemaVersion: CURRENT_SCHEMA_VERSION, profiles: [], persons: [], relationships: [], media: [],
    settings: { timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN' },
  }))
  const [activeProfileId, setActiveProfileIdState] = useState<string>()
  const [workspace, setWorkspace] = useState<WorkspaceInfo>()
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>()
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')

  const applySnapshot = useCallback((next: FamilyData, nextRevision?: FamilyDataRevision) => {
    setFamilyData(next)
    revision.current = nextRevision
    setActiveProfileIdState((current) => next.profiles.some((profile) => profile.id === current)
      ? current
      : next.profiles.find((profile) => profile.isActive)?.id ?? next.profiles[0]?.id)
    setSaveStatus('saved')
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      if (useMockData) {
        applySnapshot(cloneData(mockData.current))
        setWorkspace(undefined)
      } else {
        if (!repository.current || (activeWorkspaceId && repository.current.workspace.id !== activeWorkspaceId)) repository.current = await FamilyRepository.connect(activeWorkspaceId)
        setWorkspaces(repository.current.workspaces)
        setWorkspace(repository.current.workspace)
        setActiveWorkspaceId(repository.current.workspace.id)
        const snapshot = await repository.current.load()
        applySnapshot(snapshot.data, snapshot.revision)
      }
    } catch (caught) {
      console.error(caught)
      setError(caught instanceof Error ? caught.message : 'Không thể tải dữ liệu gia đình.')
    } finally {
      setLoading(false)
    }
  }, [activeWorkspaceId, applySnapshot, useMockData])

  useEffect(() => {
    repository.current = undefined
    revision.current = undefined
    void refresh()
  }, [activeWorkspaceId, refresh])

  const runMutation = useCallback(async <T,>(label: string, action: () => Promise<T>): Promise<T> => {
    return mutationGate.current.run(async () => {
      setBusy(label)
      setError(undefined)
      setSaveStatus('saving')
      try {
        return await action()
      } catch (caught) {
        console.error(caught)
        let message = caught instanceof Error ? caught.message : 'Không thể lưu thay đổi.'
        let errorToThrow: unknown = caught
        let conflictSynced = false
        if (caught instanceof ApiError && caught.code === 'FAMILY_DATA_CONFLICT' && repository.current) {
          try {
            const latest = await repository.current.load()
            applySnapshot(latest.data, latest.revision)
            message = 'Famnesia đã đồng bộ dữ liệu mới nhất. Thay đổi vừa nhập chưa được lưu; hãy thực hiện lại thao tác.'
            errorToThrow = new Error(message)
            conflictSynced = true
          } catch (syncError) {
            console.error(syncError)
            message = 'Dữ liệu đã thay đổi nhưng Famnesia chưa thể đồng bộ lại. Hãy thử nút Làm mới.'
            errorToThrow = new Error(message)
          }
        }
        setError(message)
        if (!conflictSynced) setSaveStatus('failed')
        throw errorToThrow
      } finally {
        setBusy(undefined)
      }
    })
  }, [applySnapshot])

  const saveData = useCallback(async (next: FamilyData): Promise<FamilyData> => {
    const valid = requireValidFamilyData(next)
    if (useMockData) {
      const saved = requireValidFamilyData({ ...valid, updatedAt: new Date().toISOString() })
      mockData.current = cloneData(saved)
      applySnapshot(saved)
      return saved
    }
    if (!repository.current) throw new Error('Workspace Google Drive chưa sẵn sàng.')
    if (!repository.current.workspace.canEdit) throw new Error('Bạn chỉ có quyền xem workspace này.')
    try {
      const snapshot = await repository.current.save(valid, revision.current)
      applySnapshot(snapshot.data, snapshot.revision)
      return snapshot.data
    } catch (caught) {
      if (!(caught instanceof ApiError) || caught.code !== 'FAMILY_DATA_CONFLICT') throw caught
      const latest = await repository.current.load()
      if (!canRetryRevisionDrift(valid, latest.data)) throw caught
      const snapshot = await repository.current.save(valid, latest.revision)
      applySnapshot(snapshot.data, snapshot.revision)
      return snapshot.data
    }
  }, [applySnapshot, useMockData])

  const persist = useCallback((label: string, next: FamilyData): Promise<FamilyData> => (
    runMutation(label, () => saveData(next))
  ), [runMutation, saveData])

  const activeProfile = familyData.profiles.find((profile) => profile.id === activeProfileId)
  const persons = useMemo(() => familyData.persons.filter((person) => person.profileId === activeProfileId), [activeProfileId, familyData.persons])
  const relationships = useMemo(() => familyData.relationships.filter((relationship) => relationship.profileId === activeProfileId), [activeProfileId, familyData.relationships])
  const media = useMemo(() => familyData.media.filter((item) => item.profileId === activeProfileId), [activeProfileId, familyData.media])

  const setActiveProfileId = useCallback((profileId: string) => {
    if (familyData.profiles.some((profile) => profile.id === profileId)) setActiveProfileIdState(profileId)
  }, [familyData.profiles])

  const createProfile = useCallback(async (name: string, description = '') => {
    const id = nextProfileId(familyData.profiles.map((profile) => profile.id))
    const profile: FamilyProfile = {
      id, name: name.trim(), description: description.trim(), subjectPersonId: null,
      photoFileId: null, requiresSecret: false, isActive: true,
    }
    if (!profile.name) throw new Error('Hãy nhập tên gia đình.')
    await persist('Đang tạo gia đình…', { ...familyData, profiles: [...familyData.profiles, profile] })
    setActiveProfileIdState(id)
    return profile
  }, [familyData, persist])

  const setSubject = useCallback(async (personId: string) => {
    if (!activeProfile) throw new Error('Hãy chọn gia đình trước.')
    if (!persons.some((person) => person.id === personId)) throw new Error('Chủ thể phải thuộc gia đình đang chọn.')
    await persist('Đang lưu chủ thể…', {
      ...familyData,
      profiles: familyData.profiles.map((profile) => profile.id === activeProfile.id ? { ...profile, subjectPersonId: personId } : profile),
    })
  }, [activeProfile, familyData, persist, persons])

  const addPerson = useCallback(async (draft: PersonDraft, connection?: NewPersonConnection) => runMutation('Đang lưu thành viên…', async () => {
    if (!activeProfile) throw new Error('Hãy tạo hoặc chọn một gia đình trước.')
    const id = generateNextPersonId(familyData.persons.map((person) => person.id))
    const uploadedPhotoIds: string[] = []
    try {
      if (draft.photos?.length && !useMockData) {
        if (!workspace) throw new Error('Thư mục ảnh chưa sẵn sàng.')
        if (!repository.current) throw new Error('Workspace Google Drive chưa sẵn sàng.')
        const optimized = await Promise.all(draft.photos.map(optimizePhoto))
        for (const photo of optimized) uploadedPhotoIds.push(await repository.current.uploadPhoto(photo, activeProfile.id, id))
      } else if (draft.photos?.length) {
        uploadedPhotoIds.push(...draft.photos.map((_, index) => `mock-${Date.now()}-${index}`))
      }
      const now = new Date().toISOString()
      const created: Person = {
        id,
        profileId: activeProfile.id,
        name: draft.name.trim(),
        nickname: draft.nickname?.trim() || null,
        gender: draft.gender,
        birthDate: draft.birthDate || null,
        isDeceased: draft.isDeceased,
        deathDate: draft.isDeceased ? draft.deathDate || null : null,
        deathLunar: draft.isDeceased && draft.deathLunarDay && draft.deathLunarMonth
          ? { day: draft.deathLunarDay, month: draft.deathLunarMonth, leapMonth: Boolean(draft.deathLunarLeapMonth) }
          : null,
        phone1: draft.phone1?.trim() ?? '',
        phone2: draft.phone2?.trim() ?? '',
        address: draft.address?.trim() ?? '',
        note: draft.note?.trim() ?? '',
        ancestralRole: draft.ancestralRole,
        sortOrder: draft.sortOrder,
        createdAt: now,
        updatedAt: now,
      }
      const mediaIds = familyData.media.map((item) => item.id)
      const createdMedia: PersonMedia[] = uploadedPhotoIds.map((driveFileId, index) => {
        const mediaId = generateNextMediaId(mediaIds)
        mediaIds.push(mediaId)
        const item: PersonMedia = { id: mediaId, profileId: activeProfile.id, personId: id, driveFileId, type: 'photo', isPrimary: index === 0, caption: '', takenDate: null, sortOrder: index + 1, createdAt: now }
        return item
      })
      const pending: Relationship[] = []
      for (const relatedId of connection?.relatedPersonIds ?? []) {
        const type = connection!.kind === 'spouse' ? 'spouse' : 'parent'
        const person1Id = connection!.kind === 'parent' ? id : relatedId
        const person2Id = connection!.kind === 'child' ? id : connection!.kind === 'parent' ? relatedId : id
        const relationship: Relationship = {
          id: generateNextRelationshipId([...familyData.relationships, ...pending].map((item) => item.id)),
          profileId: activeProfile.id,
          person1Id,
          person2Id,
          type,
          status: type === 'spouse' ? connection?.spouseStatus ?? 'unknown' : undefined,
          sortOrder: draft.sortOrder,
          createdAt: now,
          updatedAt: now,
        }
        const validation = validateRelationship(relationship, [...relationships, ...pending], [...persons, created])
        if (validation) throw new Error(validation)
        pending.push(relationship)
      }
      await saveData({
        ...familyData,
        persons: [...familyData.persons, created],
        relationships: [...familyData.relationships, ...pending],
        media: [...familyData.media, ...createdMedia],
      })
      return created
    } catch (caught) {
      if (!useMockData) await Promise.all(uploadedPhotoIds.map((photoId) => repository.current?.deletePhoto(photoId).catch(console.error)))
      throw caught
    }
  }), [activeProfile, familyData, persons, relationships, runMutation, saveData, useMockData, workspace])

  const updatePerson = useCallback(async (id: string, draft: PersonDraft) => runMutation('Đang cập nhật thành viên…', async () => {
    const current = familyData.persons.find((person) => person.id === id)
    if (!current) throw new Error('Thành viên này không còn tồn tại.')
    const uploadedPhotoIds: string[] = []
    try {
      if (draft.photos?.length && !useMockData) {
        if (!workspace) throw new Error('Thư mục ảnh chưa sẵn sàng.')
        if (!repository.current) throw new Error('Workspace Google Drive chưa sẵn sàng.')
        const optimized = await Promise.all(draft.photos.map(optimizePhoto))
        for (const photo of optimized) uploadedPhotoIds.push(await repository.current.uploadPhoto(photo, current.profileId ?? '', current.id))
      } else if (draft.photos?.length) {
        uploadedPhotoIds.push(...draft.photos.map((_, index) => `mock-${Date.now()}-${index}`))
      }
      const updated: Person = {
        ...current,
        name: draft.name.trim(),
        nickname: draft.nickname?.trim() || null,
        gender: draft.gender,
        birthDate: draft.birthDate || null,
        isDeceased: draft.isDeceased,
        deathDate: draft.isDeceased ? draft.deathDate || null : null,
        deathLunar: draft.isDeceased && draft.deathLunarDay && draft.deathLunarMonth
          ? { day: draft.deathLunarDay, month: draft.deathLunarMonth, leapMonth: Boolean(draft.deathLunarLeapMonth) }
          : null,
        phone1: draft.phone1?.trim() ?? '',
        phone2: draft.phone2?.trim() ?? '',
        address: draft.address?.trim() ?? '',
        note: draft.note?.trim() ?? '',
        ancestralRole: draft.ancestralRole,
        sortOrder: draft.sortOrder,
        updatedAt: new Date().toISOString(),
      }
      const existingMedia = familyData.media.filter((item) => item.personId === id)
      const mediaIds = [...familyData.media.map((item) => item.id)]
      const addedMedia = uploadedPhotoIds.map((driveFileId, index): PersonMedia => {
        const mediaId = generateNextMediaId(mediaIds)
        mediaIds.push(mediaId)
        return { id: mediaId, profileId: current.profileId ?? '', personId: id, driveFileId, type: 'photo', isPrimary: existingMedia.length === 0 && index === 0, caption: '', takenDate: null, sortOrder: existingMedia.length + index + 1, createdAt: new Date().toISOString() }
      })
      await saveData({
        ...familyData,
        persons: familyData.persons.map((person) => person.id === id ? updated : person),
        media: [...familyData.media, ...addedMedia],
      })
    } catch (caught) {
      if (!useMockData) await Promise.all(uploadedPhotoIds.map((photoId) => repository.current?.deletePhoto(photoId).catch(console.error)))
      throw caught
    }
  }), [familyData, runMutation, saveData, useMockData, workspace])

  const addPersonMedia = useCallback(async (personId: string, files: File[]) => runMutation('Đang tải ảnh…', async () => {
    const person = familyData.persons.find((candidate) => candidate.id === personId)
    if (!person || files.length === 0) return
    const uploadedPhotoIds: string[] = []
    try {
      if (useMockData) uploadedPhotoIds.push(...files.map((_, index) => `mock-${Date.now()}-${index}`))
      else {
        if (!repository.current) throw new Error('Workspace Google Drive chưa sẵn sàng.')
        const optimized = await Promise.all(files.map(optimizePhoto))
        for (const photo of optimized) uploadedPhotoIds.push(await repository.current.uploadPhoto(photo, person.profileId ?? '', person.id))
      }
      const existing = familyData.media.filter((item) => item.personId === personId)
      const mediaIds = familyData.media.map((item) => item.id)
      const createdAt = new Date().toISOString()
      const added = uploadedPhotoIds.map((driveFileId, index): PersonMedia => {
        const id = generateNextMediaId(mediaIds); mediaIds.push(id)
        return { id, profileId: person.profileId ?? '', personId, driveFileId, type: 'photo', isPrimary: existing.length === 0 && index === 0, caption: '', takenDate: null, sortOrder: existing.length + index + 1, createdAt }
      })
      await saveData({ ...familyData, media: [...familyData.media, ...added] })
    } catch (caught) {
      if (!useMockData) await Promise.all(uploadedPhotoIds.map((photoId) => repository.current?.deletePhoto(photoId).catch(console.error)))
      throw caught
    }
  }), [familyData, runMutation, saveData, useMockData])

  const setPrimaryMedia = useCallback(async (mediaId: string) => {
    const target = familyData.media.find((item) => item.id === mediaId)
    if (!target) throw new Error('Không tìm thấy ảnh này.')
    await persist('Đang đổi ảnh đại diện…', {
      ...familyData,
      media: familyData.media.map((item) => item.personId === target.personId ? { ...item, isPrimary: item.id === mediaId } : item),
    })
  }, [familyData, persist])

  const updateMediaCaption = useCallback(async (mediaId: string, caption: string) => {
    await persist('Đang lưu chú thích…', { ...familyData, media: familyData.media.map((item) => item.id === mediaId ? { ...item, caption: caption.trim() } : item) })
  }, [familyData, persist])

  const deletePersonMedia = useCallback(async (mediaId: string) => {
    const target = familyData.media.find((item) => item.id === mediaId)
    if (!target) return
    const remainingForPerson = familyData.media.filter((item) => item.personId === target.personId && item.id !== mediaId)
    const replacementId = target.isPrimary ? remainingForPerson[0]?.id : undefined
    await persist('Đang xóa ảnh…', {
      ...familyData,
      media: familyData.media.filter((item) => item.id !== mediaId).map((item) => item.id === replacementId ? { ...item, isPrimary: true } : item),
    })
    if (!useMockData) await repository.current?.deletePhoto(target.driveFileId).catch(console.error)
  }, [familyData, persist, useMockData])

  const addRelationship = useCallback(async (input: Omit<Relationship, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!activeProfile) throw new Error('Hãy chọn gia đình trước.')
    const now = new Date().toISOString()
    const relationship: Relationship = {
      ...input,
      profileId: activeProfile.id,
      id: generateNextRelationshipId(familyData.relationships.map((item) => item.id)),
      createdAt: now,
      updatedAt: now,
    }
    const validation = validateRelationship(relationship, relationships, persons)
    if (validation) throw new Error(validation)
    await persist('Đang lưu quan hệ…', { ...familyData, relationships: [...familyData.relationships, relationship] })
  }, [activeProfile, familyData, persist, persons, relationships])

  const updateRelationship = useCallback(async (relationship: Relationship) => {
    const updated = { ...relationship, profileId: activeProfile?.id ?? relationship.profileId, updatedAt: new Date().toISOString() }
    const others = relationships.filter((candidate) => candidate.id !== relationship.id)
    const validation = validateRelationship(updated, others, persons)
    if (validation) throw new Error(validation)
    await persist('Đang cập nhật quan hệ…', {
      ...familyData,
      relationships: familyData.relationships.map((candidate) => candidate.id === updated.id ? updated : candidate),
    })
  }, [activeProfile?.id, familyData, persist, persons, relationships])

  const deleteRelationship = useCallback(async (id: string) => {
    await persist('Đang xóa quan hệ…', {
      ...familyData,
      relationships: familyData.relationships.filter((relationship) => relationship.id !== id),
    })
  }, [familyData, persist])

  const deletePerson = useCallback(async (id: string) => {
    if (familyData.relationships.some((relationship) => relationship.person1Id === id || relationship.person2Id === id)) {
      throw new Error('Hãy gỡ hoặc chuyển các quan hệ gia đình trước khi xóa thành viên này.')
    }
    const person = familyData.persons.find((candidate) => candidate.id === id)
    const personMedia = familyData.media.filter((item) => item.personId === id)
    await persist('Đang xóa thành viên…', {
      ...familyData,
      persons: familyData.persons.filter((candidate) => candidate.id !== id),
      profiles: familyData.profiles.map((profile) => profile.subjectPersonId === id ? { ...profile, subjectPersonId: null } : profile),
      media: familyData.media.filter((item) => item.personId !== id),
    })
    if (!useMockData && person) await Promise.all(personMedia.map((item) => repository.current?.deletePhoto(item.driveFileId).catch(console.error)))
  }, [familyData, persist, useMockData])

  const backupNow = useCallback(async (reason = 'manual'): Promise<FamilyBackup> => {
    setBusy('Đang tạo bản sao lưu…')
    setError(undefined)
    try {
      if (useMockData) {
        const backup: MockBackup = {
          id: `mock-${Date.now()}`,
          name: `famnesia_${new Date().toISOString().replace(/[:.-]/g, '')}.json`,
          createdTime: new Date().toISOString(),
          reason,
          data: cloneData(familyData),
        }
        mockBackups.current.unshift(backup)
        return backup
      }
      if (!repository.current) throw new Error('Workspace Google Drive chưa sẵn sàng.')
      return await repository.current.backup(familyData, reason)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Không thể tạo bản sao lưu.'
      setError(message)
      throw caught
    } finally {
      setBusy(undefined)
    }
  }, [familyData, useMockData])

  const listBackups = useCallback(async (): Promise<FamilyBackup[]> => {
    if (useMockData) return mockBackups.current.map(({ data: _, ...backup }) => backup)
    if (!repository.current) return []
    return repository.current.listBackups()
  }, [useMockData])

  const replaceAllData = useCallback(async (replacement: FamilyData, reason = 'manual-import') => {
    const valid = requireValidFamilyData(replacement)
    await runMutation(reason === 'restore' ? 'Đang khôi phục dữ liệu…' : 'Đang import dữ liệu…', async () => {
      if (useMockData) {
        const backup: MockBackup = { id: `mock-${Date.now()}`, name: `famnesia_before_${reason}.json`, createdTime: new Date().toISOString(), reason, data: cloneData(familyData) }
        mockBackups.current.unshift(backup)
        const saved = requireValidFamilyData({ ...valid, updatedAt: new Date().toISOString() })
        mockData.current = cloneData(saved)
        applySnapshot(saved)
      } else {
        if (!repository.current) throw new Error('Workspace Google Drive chưa sẵn sàng.')
        const snapshot = await repository.current.save(valid, revision.current, reason === 'restore' ? 'restore' : 'replace')
        applySnapshot(snapshot.data, snapshot.revision)
      }
    })
  }, [applySnapshot, familyData, runMutation, useMockData])

  const restoreBackup = useCallback(async (backupId: string) => {
    let data: FamilyData | undefined
    if (useMockData) data = mockBackups.current.find((backup) => backup.id === backupId)?.data
    else data = await repository.current?.loadBackup(backupId)
    if (!data) throw new Error('Không tìm thấy bản sao lưu.')
    await replaceAllData(data, 'restore')
  }, [replaceAllData, useMockData])

  const switchWorkspace = useCallback((id: string) => {
    if (!workspaces.some((candidate) => candidate.id === id) || id === activeWorkspaceId) return
    localStorage.setItem('family-tree-workspace', id)
    repository.current = undefined
    revision.current = undefined
    setActiveWorkspaceId(id)
  }, [activeWorkspaceId, workspaces])

  const refreshMembers = useCallback(async () => {
    if (useMockData || !repository.current?.workspace.canManageMembers) { setMembers([]); return [] }
    const next = await repository.current.listMembers(); setMembers(next); return next
  }, [useMockData])

  const addMember = useCallback(async (email: string, role: 'editor' | 'viewer') => {
    if (!repository.current) throw new Error('Workspace chưa sẵn sàng.')
    await repository.current.addMember(email, role); await refreshMembers()
  }, [refreshMembers])

  const updateMember = useCallback(async (id: string, role: 'editor' | 'viewer') => {
    if (!repository.current) throw new Error('Workspace chưa sẵn sàng.')
    await repository.current.updateMember(id, role); await refreshMembers()
  }, [refreshMembers])

  const removeMember = useCallback(async (id: string) => {
    if (!repository.current) throw new Error('Workspace chưa sẵn sàng.')
    await repository.current.removeMember(id); await refreshMembers()
  }, [refreshMembers])

  return useMemo(() => ({
    familyData,
    profiles: familyData.profiles,
    activeProfile,
    activeProfileId,
    persons,
    relationships,
    media,
    workspace,
    workspaces,
    activeWorkspaceId,
    members,
    loading,
    busy,
    error,
    saveStatus,
    useMockData,
    refresh,
    setActiveProfileId,
    createProfile,
    setSubject,
    addPerson,
    updatePerson,
    addPersonMedia,
    setPrimaryMedia,
    updateMediaCaption,
    deletePersonMedia,
    addRelationship,
    updateRelationship,
    deleteRelationship,
    deletePerson,
    backupNow,
    listBackups,
    restoreBackup,
    replaceAllData,
    switchWorkspace,
    refreshMembers,
    addMember,
    updateMember,
    removeMember,
  }), [
    activeProfile, activeProfileId, activeWorkspaceId, addMember, addPerson, addPersonMedia, addRelationship, backupNow, busy, createProfile,
    deletePerson, deletePersonMedia, deleteRelationship, error, familyData, listBackups, loading, media, persons,
    refresh, relationships, replaceAllData, restoreBackup, saveStatus, setActiveProfileId,
    setPrimaryMedia, setSubject, switchWorkspace, updateMediaCaption, updateMember, removeMember, refreshMembers, updatePerson, updateRelationship, useMockData, workspace, workspaces, members,
  ])
}
