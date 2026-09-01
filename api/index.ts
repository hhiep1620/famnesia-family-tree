import authCallback from '../server/auth/callback.js'
import authLogin from '../server/auth/login.js'
import authLogout from '../server/auth/logout.js'
import authReconnect from '../server/auth/reconnect.js'
import authSession from '../server/auth/session.js'
import join from '../server/join.js'
import workspaces from '../server/workspaces/index.js'
import workspace from '../server/workspaces/[workspaceId]/index.js'
import family from '../server/workspaces/[workspaceId]/family.js'
import backups from '../server/workspaces/[workspaceId]/backups/index.js'
import checkpoint from '../server/workspaces/[workspaceId]/checkpoint-intent.js'
import contactAuthorization from '../server/workspaces/[workspaceId]/contact-authorization.js'
import contactPolicy from '../server/workspaces/[workspaceId]/contact-policy.js'
import delegation from '../server/workspaces/[workspaceId]/editor-delegation.js'
import members from '../server/workspaces/[workspaceId]/members/index.js'
import photos from '../server/workspaces/[workspaceId]/photos/index.js'
import photo from '../server/workspaces/[workspaceId]/photos/[photoId].js'
import portability from '../server/workspaces/[workspaceId]/portability-export-authorization.js'

type FetchHandler = { fetch(request: Request): Response | Promise<Response> }
const routes: Array<[RegExp, FetchHandler]> = [
  [/^\/api\/auth\/callback\/?$/, authCallback], [/^\/api\/auth\/login\/?$/, authLogin], [/^\/api\/auth\/logout\/?$/, authLogout],
  [/^\/api\/auth\/reconnect\/?$/, authReconnect], [/^\/api\/auth\/session\/?$/, authSession],
  [/^\/api\/join\/?$/, join],
  [/^\/api\/workspaces\/?$/, workspaces], [/^\/api\/workspaces\/[^/]+\/backups\/?$/, backups],
  [/^\/api\/workspaces\/[^/]+\/checkpoint-intent\/?$/, checkpoint], [/^\/api\/workspaces\/[^/]+\/contact-authorization\/?$/, contactAuthorization],
  [/^\/api\/workspaces\/[^/]+\/contact-policy\/?$/, contactPolicy], [/^\/api\/workspaces\/[^/]+\/editor-delegation\/?$/, delegation],
  [/^\/api\/workspaces\/[^/]+\/family\/?$/, family], [/^\/api\/workspaces\/[^/]+\/members\/?$/, members],
  [/^\/api\/workspaces\/[^/]+\/photos\/[^/]+\/?$/, photo], [/^\/api\/workspaces\/[^/]+\/photos\/?$/, photos],
  [/^\/api\/workspaces\/[^/]+\/portability-export-authorization\/?$/, portability], [/^\/api\/workspaces\/[^/]+\/?$/, workspace],
]

export default { fetch(request: Request) {
  const path = new URL(request.url).pathname
  const route = routes.find(([pattern]) => pattern.test(path))?.[1]
  if (!route) return new Response('Not found', { status: 404 })
  return route.fetch(request)
} }
