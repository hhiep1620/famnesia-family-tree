export class AppError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export function json(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(data), { ...init, headers })
}

export function apiError(error: unknown): Response {
  if (error instanceof AppError) {
    return json({ error: { code: error.code, message: error.message, details: error.details } }, { status: error.status })
  }
  console.error(error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) })
  return json({ error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' } }, { status: 500 })
}

export async function withErrors(action: () => Promise<Response>): Promise<Response> {
  try { return await action() }
  catch (error) { return apiError(error) }
}

export function requireMethod(request: Request, methods: string[]): void {
  if (!methods.includes(request.method)) throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.')
}

export async function readJson<T>(request: Request): Promise<T> {
  try { return await request.json() as T }
  catch { throw new AppError(400, 'INVALID_JSON', 'Request body must be valid JSON.') }
}

export async function readJsonLimited<T>(request: Request, maxBytes: number): Promise<T> {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > maxBytes) throw new AppError(413, 'REQUEST_TOO_LARGE', 'Import file exceeds allowed size.')
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new AppError(413, 'REQUEST_TOO_LARGE', 'Import file exceeds allowed size.')
  try { return JSON.parse(text) as T }
  catch { throw new AppError(400, 'INVALID_JSON', 'Request body must be valid JSON.') }
}

export function assertSameOrigin(request: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return
  const origin = request.headers.get('origin')
  if (!origin) throw new AppError(403, 'CSRF_ORIGIN_REQUIRED', 'Origin header is required.')
  const expected = new URL(request.url).origin
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https'
  const forwardedOrigin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : expected
  if (origin !== expected && origin !== forwardedOrigin) throw new AppError(403, 'CSRF_ORIGIN_MISMATCH', 'Request origin is not allowed.')
}

export function pathParameter(request: Request, marker: string): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean)
  const markerIndex = segments.indexOf(marker)
  const value = markerIndex >= 0 ? segments[markerIndex + 1] : undefined
  if (!value) throw new AppError(400, 'MISSING_PATH_PARAMETER', `Missing ${marker}.`)
  return decodeURIComponent(value)
}
