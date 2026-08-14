export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

type AccessTokenProvider = () => Promise<string | undefined>
let accessTokenProvider: AccessTokenProvider | undefined

export function configureBearerAccessTokenProvider(provider?: AccessTokenProvider): void {
  accessTokenProvider = provider
}

export async function authenticatedApiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  if (!headers.has('Authorization') && accessTokenProvider) {
    const accessToken = await accessTokenProvider()
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  }
  return fetch(path, { ...init, credentials: 'same-origin', headers })
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedApiFetch(path, init)
  if (response.status === 204) return undefined as T
  const contentType = response.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json') ? await response.json() as { error?: { code?: string; message?: string; details?: unknown } } : undefined
  if (!response.ok) throw new ApiError(response.status, payload?.error?.code ?? 'REQUEST_FAILED', payload?.error?.message ?? 'Không thể hoàn tất yêu cầu.', payload?.error?.details)
  if (!payload) throw new ApiError(502, 'INVALID_API_RESPONSE', 'Máy chủ trả về phản hồi không hợp lệ. Hãy chạy ứng dụng bằng Vercel Dev.')
  return payload as T
}

export function jsonBody(value: unknown): Pick<RequestInit, 'body' | 'headers'> {
  return { body: JSON.stringify(value), headers: { 'Content-Type': 'application/json' } }
}
