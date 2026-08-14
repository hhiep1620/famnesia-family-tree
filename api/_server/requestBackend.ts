import { requireAuth } from './auth.js'
import type { RequestBackend } from './backendContracts.js'
import { AppError } from './http.js'
import { backendSelection, requireDrivePersistenceBackends, requireGoogleDriveAuthBackend } from './backendSelectors.js'
import { createDriveRequestBackend } from './driveBackend.js'
import { createSupabaseWriteRequestBackend } from './supabase/writeBackend.js'

export async function requestBackend(request: Request): Promise<RequestBackend> {
  const maintenanceMode = process.env.FAMNESIA_MAINTENANCE_MODE?.trim() || 'off'
  if (!['off', 'read-only'].includes(maintenanceMode)) {
    throw new AppError(500, 'MAINTENANCE_CONFIGURATION_INVALID', 'FAMNESIA_MAINTENANCE_MODE must be off or read-only.')
  }
  if (maintenanceMode === 'read-only' && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    throw new AppError(503, 'FAMNESIA_READ_ONLY', 'Famnesia is temporarily read-only during a controlled migration or rollback window.')
  }
  const selection = backendSelection()
  const auth = await requireAuth(request)
  if (selection.data === 'supabase') return createSupabaseWriteRequestBackend(auth, selection)
  requireGoogleDriveAuthBackend(selection)
  requireDrivePersistenceBackends(selection)
  return createDriveRequestBackend(auth, selection)
}
