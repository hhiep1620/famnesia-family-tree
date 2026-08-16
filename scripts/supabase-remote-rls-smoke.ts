#!/usr/bin/env node
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
let memberToken = process.env.RLS_MEMBER_ACCESS_TOKEN?.trim()
let outsiderToken = process.env.RLS_OUTSIDER_ACCESS_TOKEN?.trim()
const workspaceId = process.env.RLS_WORKSPACE_ID?.trim()
const reportPath = path.resolve(process.argv[2] || `rls-evidence-${Date.now()}.json`)
if (!url || !key || !workspaceId) throw new Error('Supabase URL/key and RLS_WORKSPACE_ID are required.')
const local = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)
if ((!memberToken || !outsiderToken) && local && process.env.RLS_MEMBER_EMAIL && process.env.RLS_OUTSIDER_EMAIL) {
  const password = process.env.SUPABASE_SEED_PASSWORD ?? 'FamnesiaLocal123!'
  const signIn = async (email: string) => {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const result = await client.auth.signInWithPassword({ email, password })
    if (result.error || !result.data.session) throw result.error ?? new Error(`Could not sign in ${email}.`)
    return result.data.session.access_token
  }
  memberToken = await signIn(process.env.RLS_MEMBER_EMAIL)
  outsiderToken = await signIn(process.env.RLS_OUTSIDER_EMAIL)
}
if (!memberToken || !outsiderToken) throw new Error('Provide member/outsider access tokens; local stacks may instead provide RLS_MEMBER_EMAIL and RLS_OUTSIDER_EMAIL.')

async function rows(token: string, resource: string) {
  const response = await fetch(`${url}/rest/v1/${resource}`, { headers: { apikey: key!, Authorization: `Bearer ${token}`, Accept: 'application/json' } })
  if (!response.ok) throw new Error(`RLS request failed (${response.status}) for ${resource.split('?')[0]}.`)
  return await response.json() as unknown[]
}
const encoded = encodeURIComponent(workspaceId)
const memberWorkspace = await rows(memberToken, `workspaces?id=eq.${encoded}&select=id`)
const memberPeople = await rows(memberToken, `persons?workspace_id=eq.${encoded}&select=id&limit=1`)
const outsiderWorkspace = await rows(outsiderToken, `workspaces?id=eq.${encoded}&select=id`)
const outsiderPeople = await rows(outsiderToken, `persons?workspace_id=eq.${encoded}&select=id&limit=1`)
const outsiderMedia = await rows(outsiderToken, `media?workspace_id=eq.${encoded}&select=id&limit=1`)
const checks = {
  memberWorkspaceVisible: memberWorkspace.length === 1,
  memberCanonicalRowsReachable: Array.isArray(memberPeople),
  outsiderWorkspaceDenied: outsiderWorkspace.length === 0,
  outsiderPersonsDenied: outsiderPeople.length === 0,
  outsiderMediaDenied: outsiderMedia.length === 0,
}
const status = Object.values(checks).every(Boolean) ? 'passed' : 'failed'
const report = { status, checkedAt: new Date().toISOString(), supabaseHost: new URL(url).host, workspaceId, checks }
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
if (status !== 'passed') throw new Error(`Remote RLS smoke failed. Evidence: ${reportPath}`)
console.log(`Remote RLS smoke passed. Evidence: ${reportPath}`)
