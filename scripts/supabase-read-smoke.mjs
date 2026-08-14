import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL?.trim()
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()
const appUrl = (process.env.FAMNESIA_APP_URL ?? 'http://localhost:3001').replace(/\/$/, '')
if (!supabaseUrl || !publishableKey || !secretKey) throw new Error('SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY are required.')
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(supabaseUrl)) throw new Error('Supabase read smoke is restricted to the local stack.')

const password = process.env.SUPABASE_SEED_PASSWORD ?? 'FamnesiaLocal123!'
const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
const seedUsers = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
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

const owner = await session('local-owner@example.test')
const viewer = await session('local-viewer@example.test')
const outsider = await session('local-outsider@example.test')
const familyId = '20000000-0000-4000-8000-000000000001'
const emptyId = '20000000-0000-4000-8000-000000000002'

try {
  const ownerWorkspaces = await request(owner.token, '/api/workspaces')
  assert(ownerWorkspaces.response.ok && ownerWorkspaces.body.workspaces?.length === 2, 'Owner should list family and empty workspaces.')

  const family = await request(owner.token, `/api/workspaces/${familyId}/family`)
  assert(family.response.ok, 'Owner should load family workspace.')
  assert(family.body.snapshot?.data?.profiles?.length === 2, 'Family fixture should contain two profiles.')
  assert(family.body.snapshot?.data?.persons?.length === 4, 'Family fixture should contain four people.')
  assert(family.body.snapshot?.data?.relationships?.length === 3, 'Family fixture should contain three relationships.')
  assert(family.body.snapshot?.data?.media?.[0]?.fileId === 'M01', 'Supabase media must use neutral fileId.')
  assert(!family.body.snapshot?.data?.media?.[0]?.driveFileId, 'Storage object must not be disguised as a Drive file ID.')
  assert(family.body.workspace?.canEdit === false, 'CR05 must expose the Supabase backend as read-only.')

  const activity = await request(owner.token, `/api/workspaces/${familyId}/family?resource=activity`)
  assert(activity.response.ok && activity.body.activity?.length === 2, 'Activity parity fixture should load.')

  const empty = await request(owner.token, `/api/workspaces/${emptyId}/family`)
  assert(empty.response.ok && empty.body.snapshot?.data?.persons?.length === 0, 'Empty workspace should map to empty FamilyData.')

  const photo = await request(owner.token, `/api/workspaces/${familyId}/photos/M01`)
  assert(photo.response.ok && photo.response.headers.get('content-type')?.includes('image/svg+xml'), 'Read phase should render a safe media placeholder.')

  const blockedWrite = await request(owner.token, `/api/workspaces/${familyId}/family`, {
    method: 'PUT',
    body: JSON.stringify({ data: family.body.snapshot.data, expectedRevision: family.body.snapshot.revision }),
  })
  assert(blockedWrite.response.status === 501 && blockedWrite.body.error?.code === 'SUPABASE_WRITE_NOT_ENABLED', 'Supabase family write must be explicitly blocked in CR05.')

  const viewerWorkspaces = await request(viewer.token, '/api/workspaces')
  assert(viewerWorkspaces.response.ok && viewerWorkspaces.body.workspaces?.length === 1, 'Viewer should list only their shared workspace.')
  assert(viewerWorkspaces.body.workspaces[0].role === 'viewer', 'Viewer role should be preserved.')
  const viewerFamily = await request(viewer.token, `/api/workspaces/${familyId}/family`)
  assert(viewerFamily.response.ok && viewerFamily.body.snapshot.data.persons.length === 4, 'Viewer should read canonical family data.')

  const outsiderWorkspaces = await request(outsider.token, '/api/workspaces')
  assert(outsiderWorkspaces.response.ok && outsiderWorkspaces.body.workspaces?.length === 0, 'Non-member should list no workspaces.')
  const outsiderFamily = await request(outsider.token, `/api/workspaces/${familyId}/family`)
  assert(outsiderFamily.response.status === 404, 'Non-member should not load another family workspace.')

  console.log('Supabase read API smoke passed: owner/viewer/outsider, parity data, empty workspace, placeholder and blocked writes.')
} finally {
  await Promise.all([owner.client.auth.signOut(), viewer.client.auth.signOut(), outsider.client.auth.signOut()])
}
