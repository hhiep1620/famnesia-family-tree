import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL?.trim()
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()
const appUrl = (process.env.FAMNESIA_APP_URL ?? 'http://localhost:3001').replace(/\/$/, '')
if (!supabaseUrl || !publishableKey || !secretKey) throw new Error('SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY are required.')
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(supabaseUrl)) throw new Error('Supabase media smoke is restricted to the local stack.')

const password = process.env.SUPABASE_SEED_PASSWORD ?? 'FamnesiaLocal123!'
const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
for (const userId of [
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005',
]) {
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
  headers.set('Accept', init.accept ?? 'application/json')
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json')
  if (init.method && init.method !== 'GET') headers.set('Origin', appUrl)
  const response = await fetch(`${appUrl}${path}`, { ...init, headers })
  const contentType = response.headers.get('content-type') ?? ''
  const body = contentType.includes('json') ? await response.json() : await response.arrayBuffer()
  return { response, body }
}

function assert(condition, message) { if (!condition) throw new Error(message) }
function operation(id, type, entityId, value, baseValues) {
  return { id, type, entityId, profileId: 'F_HOANG', value, baseValues, createdAt: new Date().toISOString() }
}
function commitBody(commitId, baseVersion, operations) {
  return JSON.stringify({ commitId, baseRevision: { version: String(baseVersion) }, operations, clientCreatedAt: new Date().toISOString() })
}
async function upload(token, bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])) {
  const form = new FormData()
  form.append('photo', new Blob([bytes], { type: 'image/png' }), 'original.png')
  form.append('thumbnail', new Blob([bytes], { type: 'image/png' }), 'thumb.png')
  form.append('profileId', 'F_HOANG')
  form.append('personId', 'P01')
  return request(token, `/api/workspaces/${familyId}/photos`, { method: 'POST', body: form })
}

const owner = await session('local-owner@example.test')
const viewer = await session('local-viewer@example.test')
const outsider = await session('local-outsider@example.test')
const contributor = await session('local-contributor@example.test')
const familyId = '20000000-0000-4000-8000-000000000001'
const commitPath = `/api/workspaces/${familyId}/family?operation=commit`

const firstUpload = await upload(owner.token)
assert(firstUpload.response.status === 201 && /^[0-9a-f-]{36}$/i.test(firstUpload.body.id), `Owner upload failed: ${JSON.stringify(firstUpload.body)}`)
const uploadId = firstUpload.body.id

const invalid = await upload(owner.token, new TextEncoder().encode('<svg/>'))
assert(invalid.response.status === 415 && invalid.body.error?.code === 'PHOTO_MAGIC_INVALID', 'Magic-byte spoof must be rejected.')

const viewerUpload = await upload(viewer.token)
assert(viewerUpload.response.status === 403, 'Viewer upload must be denied.')
const outsiderUpload = await upload(outsider.token)
assert([403, 422].includes(outsiderUpload.response.status), 'Outsider upload must be denied without exposing workspace references.')

const initial = await request(owner.token, `/api/workspaces/${familyId}/family`)
assert(initial.response.ok && initial.body.snapshot.revision.version === '7', 'Media smoke expects reset seed version 7.')
const mediaValue = { id: 'M02', profileId: 'F_HOANG', personId: 'P01', fileId: uploadId, type: 'photo', isPrimary: false, caption: 'Storage smoke', takenDate: null, sortOrder: 2, createdAt: new Date().toISOString() }
const attached = await request(owner.token, commitPath, { method: 'POST', body: commitBody('commit_media_attach', 7, [operation('op-media-attach', 'media.attach', 'M02', mediaValue)]) })
assert(attached.response.ok && attached.body.snapshot.data.media.some((item) => item.id === 'M02' && item.storagePath), `Media attach failed: ${JSON.stringify(attached.body)}`)

for (const variant of ['original', 'thumb']) {
  const ownerRead = await request(owner.token, `/api/workspaces/${familyId}/photos/M02?variant=${variant}`, { accept: 'image/*' })
  assert(ownerRead.response.ok && ownerRead.response.headers.get('content-type')?.includes('image/png'), `Owner ${variant} read failed.`)
  const viewerRead = await request(viewer.token, `/api/workspaces/${familyId}/photos/M02?variant=${variant}`, { accept: 'image/*' })
  assert(viewerRead.response.ok, `Viewer ${variant} read failed.`)
}
const outsiderRead = await request(outsider.token, `/api/workspaces/${familyId}/photos/M02?variant=thumb`, { accept: 'image/*' })
assert(outsiderRead.response.status === 404, 'Outsider must not discover media metadata.')

const pendingUpload = await upload(owner.token)
assert(pendingUpload.response.status === 201, 'Second owner staging upload failed.')
const remoteUpdate = { id: 'op-media-remote', type: 'person.update', entityId: 'P01', profileId: 'F_HOANG', changes: { nickname: 'Remote media' }, baseValues: { nickname: 'An' }, createdAt: new Date().toISOString() }
const remote = await request(owner.token, commitPath, { method: 'POST', body: commitBody('commit_media_remote', 8, [remoteUpdate]) })
assert(remote.response.ok, 'Remote conflict setup failed.')
const conflictMedia = { ...mediaValue, id: 'M03', fileId: pendingUpload.body.id, sortOrder: 3 }
const localConflict = { ...remoteUpdate, id: 'op-media-local', changes: { nickname: 'Local media' } }
const conflicted = await request(owner.token, commitPath, { method: 'POST', body: commitBody('commit_media_conflict', 8, [operation('op-media-pending', 'media.attach', 'M03', conflictMedia), localConflict]) })
assert(conflicted.response.status === 409, 'Same-field conflict with media staging should return 409.')
const stagedState = await admin.from('media_uploads').select('status').eq('id', pendingUpload.body.id).single()
assert(stagedState.data?.status === 'verified', 'Commit conflict must retain verified staging for retry.')

const contributorUpload = await upload(contributor.token)
assert(contributorUpload.response.status === 201, 'Contributor should upload private staging.')
const contributorCommit = await request(contributor.token, commitPath, { method: 'POST', body: commitBody('commit_media_contributor', 9, [operation('op-media-contributor', 'media.attach', 'M04', { ...mediaValue, id: 'M04', fileId: contributorUpload.body.id })]) })
assert(contributorCommit.response.status === 403, 'Contributor must not attach canonical media directly.')
const discarded = await request(contributor.token, `/api/workspaces/${familyId}/photos/${contributorUpload.body.id}`, { method: 'DELETE' })
assert(discarded.response.status === 204, 'Contributor should discard own staging.')
const discardedAgain = await request(contributor.token, `/api/workspaces/${familyId}/photos/${contributorUpload.body.id}`, { method: 'DELETE' })
assert(discardedAgain.response.status === 204, 'Staging discard must be idempotent.')

const canonicalM02 = attached.body.snapshot.data.media.find((item) => item.id === 'M02')
const deleted = await request(owner.token, commitPath, { method: 'POST', body: commitBody('commit_media_delete', 9, [operation('op-media-delete', 'media.delete', 'M02', undefined, { $entity: canonicalM02 })]) })
assert(deleted.response.ok && !deleted.body.snapshot.data.media.some((item) => item.id === 'M02'), 'Canonical media delete failed.')
const deletedRead = await request(owner.token, `/api/workspaces/${familyId}/photos/M02?variant=original`, { accept: 'image/*' })
assert(deletedRead.response.status === 404, 'Deleted media metadata must no longer resolve.')
const uploadRow = await admin.from('media_uploads').select('original_path, thumbnail_path').eq('id', uploadId).single()
const remainingObjects = await admin.storage.from('family-media').list(uploadRow.data.original_path.split('/').slice(0, -1).join('/'))
assert(!remainingObjects.data?.some((item) => ['original.png', 'thumb.webp'].includes(item.name)), 'Cleanup queue must remove committed objects after metadata deletion.')

await request(owner.token, `/api/workspaces/${familyId}/photos/${pendingUpload.body.id}`, { method: 'DELETE' })
console.log('Supabase media API smoke passed: staging, magic/MIME, attach, private original/thumb reads, conflict retention, role denial, discard and cleanup.')
