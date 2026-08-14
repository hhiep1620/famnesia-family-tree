import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL?.trim()
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()

if (!url || !publishableKey || !secretKey) {
  throw new Error('SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY are required.')
}
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_AUTH_SMOKE !== 'true') {
  throw new Error('Refusing production auth smoke without ALLOW_PRODUCTION_AUTH_SMOKE=true.')
}

const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } })
const browser = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } })
const suffix = randomUUID()
const email = `famnesia-auth-smoke-${suffix}@example.test`
const password = `Famnesia-${suffix}-Aa1!`
let userId

try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: 'Auth Smoke User' } })
  if (created.error || !created.data.user) throw created.error ?? new Error('Auth smoke user was not created.')
  userId = created.data.user.id

  const signedIn = await browser.auth.signInWithPassword({ email, password })
  if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error('Email/password session was not created.')

  const verified = await browser.auth.getUser(signedIn.data.session.access_token)
  if (verified.error || verified.data.user?.id !== userId) throw verified.error ?? new Error('Verified identity did not match the signed-in user.')

  const { error: profileError } = await browser.from('user_profiles').select('id, email').eq('id', userId).single()
  if (profileError) throw profileError

  const signedOut = await browser.auth.signOut()
  if (signedOut.error) throw signedOut.error
  console.log('Supabase local auth smoke passed: create, sign in, verify, provision and sign out.')
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId)
}
