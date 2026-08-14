import { AppError } from './http.js'

export type DataBackendName = 'drive' | 'supabase'
export type AuthBackendName = 'google-drive-oauth' | 'supabase'
export type MediaBackendName = 'drive' | 'supabase'

export interface BackendSelection {
  data: DataBackendName
  auth: AuthBackendName
  media: MediaBackendName
}

type BackendEnvironment = Partial<Record<'DATA_BACKEND' | 'AUTH_BACKEND' | 'MEDIA_BACKEND', string | undefined>>

function selected<T extends string>(name: keyof BackendEnvironment, raw: string | undefined, fallback: T, allowed: readonly T[]): T {
  const value = raw?.trim() || fallback
  if (!allowed.includes(value as T)) {
    throw new AppError(500, 'BACKEND_CONFIGURATION_INVALID', `Invalid ${name} value "${value}". Expected one of: ${allowed.join(', ')}.`)
  }
  return value as T
}

export function parseBackendSelection(environment: BackendEnvironment): BackendSelection {
  const selection: BackendSelection = {
    data: selected('DATA_BACKEND', environment.DATA_BACKEND, 'drive', ['drive', 'supabase']),
    auth: selected('AUTH_BACKEND', environment.AUTH_BACKEND, 'google-drive-oauth', ['google-drive-oauth', 'supabase']),
    media: selected('MEDIA_BACKEND', environment.MEDIA_BACKEND, 'drive', ['drive', 'supabase']),
  }
  const allDrive = selection.data === 'drive' && selection.auth === 'google-drive-oauth' && selection.media === 'drive'
  const allSupabase = selection.data === 'supabase' && selection.auth === 'supabase' && selection.media === 'supabase'
  if (!allDrive && !allSupabase) {
    throw new AppError(
      500,
      'BACKEND_COMBINATION_UNSUPPORTED',
      'Backend selectors must use the complete Drive stack or the complete Supabase stack. Mixed auth/data/media modes cannot preserve required provider credentials.',
    )
  }
  return selection
}

export function backendSelection(): BackendSelection {
  return parseBackendSelection(process.env)
}

export function requireGoogleDriveAuthBackend(selection = backendSelection()): void {
  if (selection.auth !== 'google-drive-oauth') {
    throw new AppError(409, 'GOOGLE_DRIVE_AUTH_REQUIRED', 'This endpoint belongs to the rollback Google Drive OAuth flow.')
  }
}

export function requireDrivePersistenceBackends(selection = backendSelection()): void {
  if (selection.data !== 'drive') {
    throw new AppError(503, 'DATA_BACKEND_NOT_IMPLEMENTED', 'DATA_BACKEND=supabase is not available until the Supabase data repository phase is complete.')
  }
  if (selection.media !== 'drive') {
    throw new AppError(503, 'MEDIA_BACKEND_NOT_IMPLEMENTED', 'MEDIA_BACKEND=supabase is not available until the Supabase Storage migration phase is complete.')
  }
}
