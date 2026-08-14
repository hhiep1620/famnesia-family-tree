import { requireAuth } from './auth.js'
import type { RequestBackend } from './backendContracts.js'
import { backendSelection, requireDrivePersistenceBackends, requireGoogleDriveAuthBackend } from './backendSelectors.js'
import { createDriveRequestBackend } from './driveBackend.js'
import { createSupabaseReadRequestBackend } from './supabase/readBackend.js'

export async function requestBackend(request: Request): Promise<RequestBackend> {
  const selection = backendSelection()
  const auth = await requireAuth(request)
  if (selection.data === 'supabase') return createSupabaseReadRequestBackend(auth, selection)
  requireGoogleDriveAuthBackend(selection)
  requireDrivePersistenceBackends(selection)
  return createDriveRequestBackend(auth, selection)
}
