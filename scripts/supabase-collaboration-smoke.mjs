import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL?.trim()
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()
const appUrl = (process.env.FAMNESIA_APP_URL ?? 'http://localhost:3001').replace(/\/$/, '')
if (!supabaseUrl || !publishableKey || !secretKey) throw new Error('SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY are required.')
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(supabaseUrl)) throw new Error('Supabase collaboration smoke is restricted to the local stack.')

const password = process.env.SUPABASE_SEED_PASSWORD ?? 'FamnesiaLocal123!'
const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
const seedUsers = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005',
]
for (const userId of seedUsers) {
  const result = await admin.auth.admin.updateUserById(userId, { password })
  if (result.error) throw result.error
}

async function session(email) {
  const client = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const result = await client.auth.signInWithPassword({ email, password })
  if (result.error || !result.data.session) throw result.error ?? new Error(`Could not sign in ${email}.`)
  return { client, token: result.data.session.access_token }
}

async function request(token, path, init = {}) {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  headers.set('Accept', 'application/json')
  if (init.body) headers.set('Content-Type', 'application/json')
  if (init.method && init.method !== 'GET') headers.set('Origin', appUrl)
  const response = await fetch(`${appUrl}${path}`, { ...init, headers })
  const contentType = response.headers.get('content-type') ?? ''
  const body = contentType.includes('json') ? await response.json() : await response.text()
  return { response, body }
}

function assert(condition, message) {
  if (!condition) throw new Error(`${message}`)
}

function operation(id, type, entityId, value, changes, baseValues) {
  return { id, type, entityId, profileId: 'F_HOANG', ...(value ? { value } : {}), ...(changes ? { changes } : {}), ...(baseValues ? { baseValues } : {}), createdAt: new Date().toISOString() }
}

function draftBody(commitId, baseVersion, operations) {
  return JSON.stringify({ commitId, baseRevision: { version: String(baseVersion) }, operations, clientCreatedAt: new Date().toISOString() })
}

const owner = await session('local-owner@example.test')
const editor = await session('local-editor@example.test')
const contributor = await session('local-contributor@example.test')
const viewer = await session('local-viewer@example.test')
const outsider = await session('local-outsider@example.test')
const familyId = '20000000-0000-4000-8000-000000000001'
const familyPath = `/api/workspaces/${familyId}/family`
const membersPath = `/api/workspaces/${familyId}/members`

try {
  const created = await request(outsider.token, '/api/workspaces', { method: 'POST', body: JSON.stringify({ name: 'Workspace API smoke' }) })
  assert(created.response.status === 201 && created.body.workspace?.role === 'owner', 'A signed-in user should create a workspace and become owner.')

  const invitation = await request(owner.token, membersPath, { method: 'POST', body: JSON.stringify({ email: 'local-outsider@example.test', role: 'contributor' }) })
  assert(invitation.response.status === 201 && invitation.body.invitation?.inviteUrl?.includes('?invite='), 'Owner should receive a copyable invitation link.')
  const inviteToken = new URL(invitation.body.invitation.inviteUrl, appUrl).searchParams.get('invite')
  assert(inviteToken, 'Invitation link should contain a plaintext token only in the returned URL.')

  const wrongEmail = await request(viewer.token, '/api/workspaces', { method: 'POST', body: JSON.stringify({ invitationToken: inviteToken }) })
  assert(wrongEmail.response.status === 403 && wrongEmail.body.error?.code === 'INVITATION_EMAIL_MISMATCH', 'Wrong email must be denied without consuming the invitation.')
  const accepted = await request(outsider.token, '/api/workspaces', { method: 'POST', body: JSON.stringify({ invitationToken: inviteToken }) })
  assert(accepted.response.ok && accepted.body.workspace?.id === familyId && accepted.body.workspace?.role === 'contributor', 'Invited email should join with the requested role.')
  const replay = await request(outsider.token, '/api/workspaces', { method: 'POST', body: JSON.stringify({ invitationToken: inviteToken }) })
  assert(replay.response.ok && replay.body.workspace?.id === familyId, 'Invite acceptance should be idempotent for the accepted account.')

  const contributorStatus = await request(contributor.token, `${familyPath}?resource=collaboration-status`)
  assert(contributorStatus.response.ok && contributorStatus.body.status?.enabled === true && contributorStatus.body.status?.workspaceRole === 'contributor', 'Contributor should see the Supabase approval workflow without Picker or Drive mirror.')

  const firstOperations = [operation('collab-op-1', 'person.update', 'P01', undefined, { nickname: 'Approved Draft' }, { nickname: 'An' })]
  const firstDraft = await request(contributor.token, `${familyPath}?operation=draft-submit`, { method: 'POST', body: draftBody('draft-submit-1', 7, firstOperations) })
  assert(firstDraft.response.ok && firstDraft.body.draft?.status === 'pending' && firstDraft.body.draft?.revision === 1, 'Contributor should submit revision 1.')
  const directCommit = await request(contributor.token, `${familyPath}?operation=commit`, { method: 'POST', body: draftBody('blocked-direct-commit', 7, firstOperations) })
  assert(directCommit.response.status === 403 && directCommit.body.error?.code === 'FAMILY_COMMIT_FORBIDDEN', 'Contributor direct canonical commit must remain forbidden.')

  const ownerDrafts = await request(owner.token, `${familyPath}?resource=drafts`)
  const reviewDraft = ownerDrafts.body.drafts?.find((item) => item.id === firstDraft.body.draft.id)
  assert(ownerDrafts.response.ok && reviewDraft?.operations?.length === 1, 'Owner Draft Inbox should list contributor operations.')
  const approved = await request(owner.token, `${familyPath}?operation=draft-review`, {
    method: 'POST',
    body: JSON.stringify({ draftId: reviewDraft.id, draftRevision: reviewDraft.revision, decision: 'approve' }),
  })
  assert(approved.response.ok && approved.body.draft?.status === 'approved' && approved.body.snapshot?.revision?.version === '8', 'Owner approval should commit canonical data and close the draft.')
  const afterApproval = await request(owner.token, familyPath)
  assert(afterApproval.body.snapshot.data.persons.find((person) => person.id === 'P01')?.nickname === 'Approved Draft', 'Approved field should appear in canonical data.')

  const person = { id: 'P99', profileId: 'F_HOANG', name: 'Dependency Person', nickname: null, gender: 'unknown', birthDate: null, isDeceased: false, deathDate: null, deathLunar: null, phone1: '', phone2: '', address: '', note: '', ancestralRole: 'none', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  const relationship = { id: 'R99', profileId: 'F_HOANG', person1Id: 'P01', person2Id: 'P99', type: 'parent', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  const dependencyOperations = [
    operation('collab-create-person', 'person.create', 'P99', person),
    operation('collab-create-relationship', 'relationship.create', 'R99', relationship),
  ]
  const dependencyDraft = await request(contributor.token, `${familyPath}?operation=draft-submit`, { method: 'POST', body: draftBody('draft-submit-2', 8, dependencyOperations) })
  assert(dependencyDraft.response.ok, 'Contributor should submit a second terminal-successor draft.')
  const dependencyApproval = await request(owner.token, `${familyPath}?operation=draft-review`, {
    method: 'POST',
    body: JSON.stringify({ draftId: dependencyDraft.body.draft.id, draftRevision: 1, decision: 'approve', operationIds: ['collab-create-relationship'] }),
  })
  assert(dependencyApproval.response.ok && dependencyApproval.body.automaticallyIncludedOperationIds?.includes('collab-create-person'), 'Selected approval should include required create dependencies.')
  const afterDependency = await request(owner.token, familyPath)
  assert(afterDependency.body.snapshot.revision.version === '9' && afterDependency.body.snapshot.data.persons.some((item) => item.id === 'P99') && afterDependency.body.snapshot.data.relationships.some((item) => item.id === 'R99'), 'Dependency closure should commit a valid person and relationship atomically.')

  const rejectOperations = [operation('collab-reject-1', 'person.update', 'P02', undefined, { nickname: 'Reject me' }, { nickname: null })]
  const rejectDraft = await request(contributor.token, `${familyPath}?operation=draft-submit`, { method: 'POST', body: draftBody('draft-submit-3', 9, rejectOperations) })
  const viewerReview = await request(viewer.token, `${familyPath}?operation=draft-review`, { method: 'POST', body: JSON.stringify({ draftId: rejectDraft.body.draft.id, draftRevision: 1, decision: 'reject', note: 'Viewer may not review' }) })
  assert(viewerReview.response.status === 403, 'Viewer must not review contributor drafts.')
  const missingReason = await request(editor.token, `${familyPath}?operation=draft-review`, { method: 'POST', body: JSON.stringify({ draftId: rejectDraft.body.draft.id, draftRevision: 1, decision: 'reject' }) })
  assert(missingReason.response.status === 422 && missingReason.body.error?.code === 'DRAFT_REJECT_NOTE_REQUIRED', 'Reject must require a reason.')
  const staleReview = await request(editor.token, `${familyPath}?operation=draft-review`, { method: 'POST', body: JSON.stringify({ draftId: rejectDraft.body.draft.id, draftRevision: 99, decision: 'reject', note: 'Stale' }) })
  assert(staleReview.response.status === 409 && staleReview.body.error?.code === 'DRAFT_REVISION_CHANGED', 'Review should reject stale draft revisions.')
  const rejected = await request(editor.token, `${familyPath}?operation=draft-review`, { method: 'POST', body: JSON.stringify({ draftId: rejectDraft.body.draft.id, draftRevision: 1, decision: 'reject', note: 'Không đúng thông tin' }) })
  assert(rejected.response.ok && rejected.body.draft?.status === 'rejected' && rejected.body.draft?.note === 'Không đúng thông tin', 'Editor should reject with a durable reason.')

  const members = await request(owner.token, membersPath)
  const outsiderMember = members.body.members?.find((member) => member.email === 'local-outsider@example.test' && !member.pendingInvitation)
  assert(outsiderMember, 'Accepted user should appear in workspace members.')
  const removed = await request(owner.token, membersPath, { method: 'DELETE', body: JSON.stringify({ permissionId: outsiderMember.id }) })
  assert(removed.response.status === 204, 'Owner should remove a non-owner member.')
  const deniedAfterRemoval = await request(outsider.token, familyPath)
  assert(deniedAfterRemoval.response.status === 404, 'Removal should deny the next family request immediately.')

  const revokeInvitation = await request(owner.token, membersPath, { method: 'POST', body: JSON.stringify({ email: 'local-outsider@example.test', role: 'viewer' }) })
  const pendingMembers = await request(owner.token, membersPath)
  const pending = pendingMembers.body.members?.find((member) => member.email === 'local-outsider@example.test' && member.pendingInvitation)
  assert(pending, 'New invitation should appear as pending.')
  const revoked = await request(owner.token, membersPath, { method: 'DELETE', body: JSON.stringify({ permissionId: pending.id }) })
  assert(revoked.response.status === 204, 'Owner should revoke a pending invitation.')
  const revokedToken = new URL(revokeInvitation.body.invitation.inviteUrl, appUrl).searchParams.get('invite')
  const revokedAccept = await request(outsider.token, '/api/workspaces', { method: 'POST', body: JSON.stringify({ invitationToken: revokedToken }) })
  assert(revokedAccept.response.status === 409 && revokedAccept.body.error?.code === 'INVITATION_NOT_PENDING', 'Revoked invitation should not be accepted.')

  console.log('Supabase collaboration API smoke passed: create, invite/accept/revoke, roles, draft approval/reject, dependencies and immediate removal.')
} finally {
  await Promise.all([owner.client.auth.signOut(), editor.client.auth.signOut(), contributor.client.auth.signOut(), viewer.client.auth.signOut(), outsider.client.auth.signOut()])
}
