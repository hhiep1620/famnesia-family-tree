import { requireAuth } from '../_server/auth.js'
import { withErrors, json, requireMethod } from '../_server/http.js'

export default {
  fetch(request: Request) {
    return withErrors(async () => {
      requireMethod(request, ['GET'])
      const auth = await requireAuth(request)
      return json({ authenticated: true, user: auth.user, expiresAt: auth.session.expiresAt })
    })
  },
}
