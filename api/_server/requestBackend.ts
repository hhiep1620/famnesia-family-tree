import { requireAuth } from './auth.js'
import type { RequestBackend } from './backendContracts.js'
import { backendSelection, requireDrivePersistenceBackends, requireGoogleDriveAuthBackend } from './backendSelectors.js'
import { createDriveRequestBackend } from './driveBackend.js'

export async function requestBackend(request: Request): Promise<RequestBackend> {
  const selection = backendSelection()
  requireGoogleDriveAuthBackend(selection)
  requireDrivePersistenceBackends(selection)
  return createDriveRequestBackend(await requireAuth(request), selection)
}
