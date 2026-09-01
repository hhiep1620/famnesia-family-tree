import type { AuthContext } from './auth.js'
import type { RequestBackend } from './backendContracts.js'
import type { BackendSelection } from './backendSelectors.js'
import {
  addMember, appendActivity, commitFamily, createBackup, deletePhoto, listActivity, listBackups, listMembers,
  listWorkspaces, loadBackup, loadFamily, readPhoto, removeMember, saveFamily, updateMember, uploadPhoto, workspaceResources,
} from './drive.js'
import { AppError } from './http.js'

export function createDriveRequestBackend(auth: AuthContext, selection: BackendSelection): RequestBackend {
  const token = auth.accessToken
  const user = auth.user
  return {
    selection,
    user,
    workspaces: {
      async list() {
        const workspaces = await listWorkspaces(token)
        return workspaces
      },
      async connect(workspaceId) {
        const connected = await loadFamily(token, workspaceId)
        return connected.workspace
      },
      async get(workspaceId) {
        const workspace = await workspaceResources(token, workspaceId)
        return { ...workspace.access, rootFolderUrl: workspace.root.webViewLink ?? `https://drive.google.com/drive/folders/${workspace.root.id}` }
      },
      async create() { throw new AppError(409, 'DRIVE_WORKSPACE_CREATE_UNSUPPORTED', 'Create the Famnesia folder through the existing Google Drive setup flow.') },
      async acceptInvitation() { throw new AppError(409, 'DRIVE_INVITATION_LINK_UNSUPPORTED', 'Google Drive workspaces use the shared-folder connector.') },
    },
    family: {
      async load(workspaceId) {
        const loaded = await loadFamily(token, workspaceId)
        return loaded
      },
      save: (workspaceId, data, expected, mode) => saveFamily(token, workspaceId, data, expected, mode, { email: user.email, name: user.name }),
      commit: (workspaceId, request) => commitFamily(token, workspaceId, request, { email: user.email, name: user.name }),
      commitStatus: async () => ({ status: 'missing' }),
      listActivity: (workspaceId) => listActivity(token, workspaceId),
      recordActivity: (workspaceId, input) => appendActivity(token, workspaceId, input),
    },
    media: {
      upload: (workspaceId, file, filename, profileId, personId) => uploadPhoto(token, workspaceId, file, filename, profileId, personId, auth.providerSubject),
      read: (workspaceId, mediaId) => readPhoto(token, workspaceId, mediaId),
      delete: (workspaceId, mediaId) => deletePhoto(token, workspaceId, mediaId),
    },
    members: {
      list: (workspaceId) => listMembers(token, workspaceId),
      async add(workspaceId, email, role) {
        await addMember(token, workspaceId, email, role)
        await appendActivity(token, workspaceId, { actorEmail: user.email, actorName: user.name, action: 'member.invited', entityType: 'member', summary: `Invited ${email} as ${role}` })
      },
      async update(workspaceId, memberId, role) {
        await updateMember(token, workspaceId, memberId, role)
        await appendActivity(token, workspaceId, { actorEmail: user.email, actorName: user.name, action: 'member.role_changed', entityType: 'member', entityId: memberId, summary: `Changed a member role to ${role}` })
      },
      async remove(workspaceId, memberId) {
        await removeMember(token, workspaceId, memberId)
        await appendActivity(token, workspaceId, { actorEmail: user.email, actorName: user.name, action: 'member.removed', entityType: 'member', entityId: memberId, summary: 'Removed a workspace member' })
      },
    },
    backups: {
      async create(workspaceId, data, reason) {
        const backup = await createBackup(token, workspaceId, data, reason)
        return backup
      },
      list: (workspaceId) => listBackups(token, workspaceId),
      load: (workspaceId, backupId) => loadBackup(token, workspaceId, backupId),
    },
  }
}
