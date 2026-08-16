import type { AuthContext } from './auth.js'
import type { RequestBackend } from './backendContracts.js'
import type { BackendSelection } from './backendSelectors.js'
import { collaborationApprovalEnabled } from './env.js'
import {
  addMember, appendActivity, commitFamily, createBackup, deletePhoto, listActivity, listBackups, listMembers,
  listWorkspaces, loadBackup, loadFamily, readPhoto, removeMember, saveFamily, updateMember, uploadPhoto, workspaceResources,
} from './drive.js'
import {
  addCollaborationMember, collaborationStatus, collaborationWorkspaceAccess, collaborationWorkspaceInfo,
  deleteDraftPhoto, listCollaborationMembers, listReviewDrafts, markMirrorChanged, readDraftPhoto,
  removeCollaborationMember, reviewFamilyDraft, submitFamilyDraft, updateCollaborationMember, uploadDraftPhoto,
} from './collaboration.js'
import { syncDriveMirror } from './mirror.js'
import { AppError } from './http.js'

export function createDriveRequestBackend(auth: AuthContext, selection: BackendSelection): RequestBackend {
  const token = auth.accessToken
  const user = auth.user

  const drafts: RequestBackend['drafts'] = {
    submit: (workspaceId, request) => submitFamilyDraft(token, workspaceId, user, request),
    list: (workspaceId) => listReviewDrafts(token, workspaceId, user),
    status: (workspaceId) => collaborationStatus(token, workspaceId, user),
    review: (workspaceId, request) => reviewFamilyDraft(token, workspaceId, user, request),
    syncMirror: (workspaceId) => syncDriveMirror(token, workspaceId, user),
    workspaceInfo: (workspaceId) => collaborationWorkspaceInfo(token, workspaceId, user),
    markCanonicalChanged: (workspaceId) => markMirrorChanged(workspaceId),
  }

  return {
    selection,
    user,
    workspaces: {
      async list() {
        const workspaces = await listWorkspaces(token)
        return Promise.all(workspaces.map((workspace) => collaborationWorkspaceAccess(token, workspace, user)))
      },
      async connect(workspaceId) {
        const connected = await loadFamily(token, workspaceId)
        return collaborationWorkspaceAccess(token, connected.workspace, user)
      },
      async get(workspaceId) {
        const workspace = await workspaceResources(token, workspaceId)
        const access = await collaborationWorkspaceAccess(token, workspace.access, user)
        return { ...access, rootFolderUrl: workspace.root.webViewLink ?? `https://drive.google.com/drive/folders/${workspace.root.id}` }
      },
      async create() { throw new AppError(409, 'DRIVE_WORKSPACE_CREATE_UNSUPPORTED', 'Create the Famnesia folder through the existing Google Drive setup flow.') },
      async acceptInvitation() { throw new AppError(409, 'DRIVE_INVITATION_LINK_UNSUPPORTED', 'Google Drive workspaces use the shared-folder connector.') },
    },
    family: {
      async load(workspaceId) {
        const loaded = await loadFamily(token, workspaceId)
        return { ...loaded, workspace: await collaborationWorkspaceAccess(token, loaded.workspace, user) }
      },
      save: (workspaceId, data, expected, mode) => saveFamily(token, workspaceId, data, expected, mode, { email: user.email, name: user.name }),
      commit: (workspaceId, request) => commitFamily(token, workspaceId, request, { email: user.email, name: user.name }),
      commitStatus: async () => ({ status: 'missing' }),
      listActivity: (workspaceId) => listActivity(token, workspaceId),
      recordActivity: (workspaceId, input) => appendActivity(token, workspaceId, input),
    },
    media: {
      async upload(workspaceId, file, filename, profileId, personId) {
        const access = collaborationApprovalEnabled() ? await drafts.workspaceInfo(workspaceId) : undefined
        return access?.role === 'contributor'
          ? uploadDraftPhoto(token, workspaceId, user, file, filename, profileId, personId)
          : uploadPhoto(token, workspaceId, file, filename, profileId, personId, auth.providerSubject)
      },
      async read(workspaceId, mediaId) {
        const access = collaborationApprovalEnabled() ? await drafts.workspaceInfo(workspaceId) : undefined
        try { return await readPhoto(token, workspaceId, mediaId) }
        catch (error) {
          if (access?.role !== 'contributor' && !access?.canReviewDrafts) throw error
          return readDraftPhoto(token, workspaceId, user, mediaId)
        }
      },
      async delete(workspaceId, mediaId) {
        const access = collaborationApprovalEnabled() ? await drafts.workspaceInfo(workspaceId) : undefined
        if (access?.role === 'contributor') await deleteDraftPhoto(token, workspaceId, user, mediaId)
        else await deletePhoto(token, workspaceId, mediaId)
      },
    },
    members: {
      list: (workspaceId) => collaborationApprovalEnabled() ? listCollaborationMembers(token, workspaceId) : listMembers(token, workspaceId),
      async add(workspaceId, email, role) {
        const driveRole = role === 'editor' ? 'contributor' : role
        if (collaborationApprovalEnabled() && role !== 'editor') await addCollaborationMember(token, workspaceId, email, driveRole)
        else await addMember(token, workspaceId, email, driveRole)
        await appendActivity(token, workspaceId, { actorEmail: user.email, actorName: user.name, action: 'member.invited', entityType: 'member', summary: `Invited ${email} as ${role}` })
        await markMirrorChanged(workspaceId)
      },
      async update(workspaceId, memberId, role) {
        const driveRole = role === 'editor' ? 'contributor' : role
        if (collaborationApprovalEnabled() && role !== 'editor') await updateCollaborationMember(token, workspaceId, memberId, driveRole)
        else await updateMember(token, workspaceId, memberId, driveRole)
        await appendActivity(token, workspaceId, { actorEmail: user.email, actorName: user.name, action: 'member.role_changed', entityType: 'member', entityId: memberId, summary: `Changed a member role to ${role}` })
        await markMirrorChanged(workspaceId)
      },
      async remove(workspaceId, memberId) {
        if (collaborationApprovalEnabled()) await removeCollaborationMember(token, workspaceId, memberId)
        else await removeMember(token, workspaceId, memberId)
        await appendActivity(token, workspaceId, { actorEmail: user.email, actorName: user.name, action: 'member.removed', entityType: 'member', entityId: memberId, summary: 'Removed a workspace member' })
        await markMirrorChanged(workspaceId)
      },
    },
    drafts,
    backups: {
      async create(workspaceId, data, reason) {
        const backup = await createBackup(token, workspaceId, data, reason)
        await markMirrorChanged(workspaceId)
        return backup
      },
      list: (workspaceId) => listBackups(token, workspaceId),
      load: (workspaceId, backupId) => loadBackup(token, workspaceId, backupId),
    },
  }
}
