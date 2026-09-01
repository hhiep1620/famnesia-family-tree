import { requireAuth } from './_server/auth.js'
import { backendSelection } from './_server/backendSelectors.js'
import { AppError, assertSameOrigin, json, readJson, requireMethod, withErrors } from './_server/http.js'
import { createSupabaseUserClient } from './_server/supabase/serverClient.js'

const JOIN_CODE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z0-9]{8}$/u
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
type RpcError = { code?: string; message: string }
type RpcClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError | null }> }

function joinError(error: RpcError): never {
  const message = error.message ?? ''
  if (message.includes('JOIN_CODE_NOT_FOUND')) throw new AppError(404, 'JOIN_CODE_NOT_FOUND', 'Mã gia đình không tồn tại hoặc đã được thay đổi.')
  if (message.includes('ALREADY_WORKSPACE_MEMBER')) throw new AppError(409, 'ALREADY_WORKSPACE_MEMBER', 'Bạn đã là thành viên của gia đình này.')
  if (message.includes('JOIN_REQUEST_NOT_FOUND')) throw new AppError(404, 'JOIN_REQUEST_NOT_FOUND', 'Yêu cầu tham gia không còn ở trạng thái chờ.')
  if (error.code === '42501' || message.includes('OWNER_REQUIRED')) throw new AppError(403, 'JOIN_REQUEST_FORBIDDEN', 'Chỉ owner mới được quản lý yêu cầu tham gia.')
  if (error.code === '22023') throw new AppError(422, 'JOIN_REQUEST_INVALID', 'Yêu cầu tham gia không hợp lệ.')
  console.error({ name: 'SupabaseJoinError', code: error.code, message })
  throw new AppError(502, 'JOIN_REQUEST_FAILED', 'Không thể xử lý yêu cầu tham gia lúc này.')
}

export default { fetch(request: Request) { return withErrors(async () => {
  requireMethod(request, ['GET', 'POST', 'PATCH'])
  if (request.method !== 'GET') assertSameOrigin(request)
  const selection = backendSelection()
  if (selection.data !== 'supabase') throw new AppError(409, 'JOIN_CODE_BACKEND_REQUIRED', 'Join code chỉ khả dụng trên Supabase workspace.')
  const auth = await requireAuth(request)
  const client = createSupabaseUserClient(auth.accessToken) as unknown as RpcClient

  if (request.method === 'POST') {
    const body = await readJson<{ code?: unknown; requestedRole?: unknown }>(request)
    if (typeof body.code !== 'string' || !JOIN_CODE.test(body.code)) throw new AppError(400, 'JOIN_CODE_INVALID', 'Mã gia đình phải gồm đúng 8 ký tự, có chữ hoa, chữ thường và chữ số.')
    const requestedRole = body.requestedRole === 'editor' ? 'editor' : 'viewer'
    const result = await client.rpc('request_workspace_join', { p_join_code: body.code, p_requested_role: requestedRole })
    if (result.error) joinError(result.error)
    return json(result.data, { status: 202 })
  }

  const url = new URL(request.url)
  const workspaceId = url.searchParams.get('workspaceId') ?? ''
  if (!UUID.test(workspaceId)) throw new AppError(400, 'WORKSPACE_ID_INVALID', 'Workspace không hợp lệ.')
  if (request.method === 'GET') {
    const result = await client.rpc('list_workspace_join_requests', { p_workspace_id: workspaceId })
    if (result.error) joinError(result.error)
    return json({ requests: result.data })
  }

  const body = await readJson<{ requestId?: unknown; approve?: unknown; role?: unknown }>(request)
  if (typeof body.requestId !== 'string' || !UUID.test(body.requestId) || typeof body.approve !== 'boolean') throw new AppError(400, 'JOIN_RESOLUTION_INVALID', 'Quyết định duyệt yêu cầu không hợp lệ.')
  const role = body.role === 'editor' ? 'editor' : 'viewer'
  const result = await client.rpc('resolve_workspace_join_request', { p_workspace_id: workspaceId, p_request_id: body.requestId, p_approve: body.approve, p_role: role })
  if (result.error) joinError(result.error)
  return json({ status: result.data })
}) } }
