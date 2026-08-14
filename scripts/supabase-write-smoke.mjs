import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL?.trim()
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()
const appUrl = (process.env.FAMNESIA_APP_URL ?? 'http://localhost:3001').replace(/\/$/, '')
if (!supabaseUrl || !publishableKey || !secretKey) throw new Error('SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY are required.')
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(supabaseUrl)) throw new Error('Supabase write smoke is restricted to the local stack.')

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
  if (!condition) throw new Error(message)
}

function operation(id, type, entityId, changes, baseValues) {
  return { id, type, entityId, profileId: 'F_HOANG', changes, baseValues, createdAt: new Date().toISOString() }
}

function commitBody(commitId, baseVersion, operations) {
  return JSON.stringify({
    commitId,
    baseRevision: { version: String(baseVersion) },
    operations,
    clientCreatedAt: new Date().toISOString(),
  })
}

const owner = await session('local-owner@example.test')
const editor = await session('local-editor@example.test')
const contributor = await session('local-contributor@example.test')
const viewer = await session('local-viewer@example.test')
const familyId = '20000000-0000-4000-8000-000000000001'
const commitPath = `/api/workspaces/${familyId}/family?operation=commit`

try {
  const initial = await request(owner.token, `/api/workspaces/${familyId}/family`)
  assert(initial.response.ok && initial.body.snapshot.revision.version === '7', 'Seed workspace should start at data version 7.')
  assert(initial.body.workspace.canCommitDirectly === true && initial.body.workspace.canUpload === true, 'Owner should have metadata commit and private media staging capability.')

  const ownerCommitId = 'commit_concurrent_owner'
  const editorCommitId = 'commit_concurrent_editor'
  const ownerOperation = operation('op-concurrent-owner', 'person.update', 'P01', { nickname: 'Owner Concurrent' }, { nickname: 'An' })
  const editorOperation = operation('op-concurrent-editor', 'person.update', 'P01', { phone2: '0902000000' }, { phone2: '' })
  const [ownerResult, editorResult] = await Promise.all([
    request(owner.token, commitPath, { method: 'POST', body: commitBody(ownerCommitId, 7, [ownerOperation]) }),
    request(editor.token, commitPath, { method: 'POST', body: commitBody(editorCommitId, 7, [editorOperation]) }),
  ])
  assert(ownerResult.response.ok && editorResult.response.ok, `Concurrent owner/editor commits should both succeed for different fields: ${JSON.stringify({ owner: ownerResult.body, editor: editorResult.body })}`)
  const versions = [ownerResult.body.snapshot.revision.version, editorResult.body.snapshot.revision.version].sort()
  assert(versions[0] === '8' && versions[1] === '9', 'Concurrent commits should serialize into versions 8 and 9.')
  assert([ownerResult.body.commit.autoMerged, editorResult.body.commit.autoMerged].filter(Boolean).length === 1, 'Exactly one concurrent commit should auto-merge.')

  const latest = await request(owner.token, `/api/workspaces/${familyId}/family`)
  const person = latest.body.snapshot.data.persons.find((item) => item.id === 'P01')
  assert(latest.body.snapshot.revision.version === '9', 'Two commits should increment the canonical version twice.')
  assert(person?.nickname === 'Owner Concurrent' && person?.phone2 === '0902000000', 'Different-field concurrent changes should both survive.')

  const retry = await request(owner.token, commitPath, { method: 'POST', body: commitBody(ownerCommitId, 7, [ownerOperation]) })
  assert(retry.response.ok && retry.body.commit.idempotent === true, 'Retry with the same commit ID should be idempotent.')
  assert(retry.body.snapshot.revision.version === '9' && [8, 9].includes(retry.body.commit.resultVersion), 'Idempotent retry should return current canonical data and original result metadata.')

  const status = await request(owner.token, `/api/workspaces/${familyId}/family?resource=commit-status&commitId=${ownerCommitId}`)
  assert(status.response.ok && status.body.status === 'applied' && status.body.result?.commit?.idempotent === true, 'Commit status should recover an applied unknown outcome.')

  const conflict = await request(owner.token, commitPath, {
    method: 'POST',
    body: commitBody('commit_same_field_smoke', 7, [operation('op-same-field-smoke', 'person.update', 'P01', { nickname: 'Conflicting Local' }, { nickname: 'An' })]),
  })
  assert(conflict.response.status === 409 && conflict.body.error?.code === 'FAMILY_COMMIT_CONFLICT', 'Same-field stale update should return a typed 409 conflict.')

  const contributorCommit = await request(contributor.token, commitPath, {
    method: 'POST',
    body: commitBody('commit_contributor_smoke', 9, [operation('op-contributor-smoke', 'person.update', 'P01', { note: 'Denied' }, { note: 'Chủ thể dữ liệu mẫu' })]),
  })
  assert(contributorCommit.response.status === 403 && contributorCommit.body.error?.code === 'FAMILY_COMMIT_FORBIDDEN', 'Contributor direct commit should be denied.')

  const viewerCommit = await request(viewer.token, commitPath, {
    method: 'POST',
    body: commitBody('commit_viewer_smoke', 9, [operation('op-viewer-smoke', 'person.update', 'P01', { note: 'Denied' }, { note: 'Chủ thể dữ liệu mẫu' })]),
  })
  assert(viewerCommit.response.status === 403 && viewerCommit.body.error?.code === 'FAMILY_COMMIT_FORBIDDEN', 'Viewer direct commit should be denied.')

  const activity = await request(owner.token, `/api/workspaces/${familyId}/family?resource=activity`)
  const commitActivities = activity.body.activity.filter((event) => event.action === 'family.commit')
  assert(commitActivities.length === 2, 'Two successful batches should create exactly two activity summaries.')

  console.log('Supabase write API smoke passed: atomic commits, concurrent auto-merge, conflict, idempotency/status recovery and role denial.')
} finally {
  await Promise.all([owner.client.auth.signOut(), editor.client.auth.signOut(), contributor.client.auth.signOut(), viewer.client.auth.signOut()])
}
