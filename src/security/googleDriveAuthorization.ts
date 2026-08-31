import { DRIVE_FILE_SCOPE, type DriveToken } from './googleDriveKeyVault'

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client'

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
}

interface TokenClient {
  requestAccessToken(options?: { prompt?: string }): void
}

interface GoogleIdentityWindow extends Window {
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient(config: {
          client_id: string
          scope: string
          callback: (response: TokenResponse) => void
          error_callback: () => void
        }): TokenClient
      }
    }
  }
}

let gisLoader: Promise<void> | undefined

function loadGoogleIdentityServices(): Promise<void> {
  const browser = window as GoogleIdentityWindow
  if (browser.google?.accounts?.oauth2) return Promise.resolve()
  if (gisLoader) return gisLoader
  gisLoader = new Promise<void>((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      window.clearInterval(poll)
      window.clearTimeout(timeout)
    }
    const succeedIfReady = () => {
      if (settled || !browser.google?.accounts?.oauth2) return
      settled = true
      cleanup()
      resolve()
    }
    const fail = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('GOOGLE_DRIVE_AUTH_UNAVAILABLE'))
    }
    const poll = window.setInterval(succeedIfReady, 50)
    const timeout = window.setTimeout(fail, 10_000)
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_URL}"]`)
    if (existing) {
      existing.addEventListener('load', succeedIfReady, { once: true })
      existing.addEventListener('error', fail, { once: true })
      succeedIfReady()
      return
    }
    const script = document.createElement('script')
    script.src = GIS_SCRIPT_URL
    script.async = true
    script.defer = true
    script.referrerPolicy = 'no-referrer'
    script.addEventListener('load', succeedIfReady, { once: true })
    script.addEventListener('error', fail, { once: true })
    document.head.append(script)
  }).catch((error) => {
    gisLoader = undefined
    throw error
  })
  return gisLoader
}

export function parseDriveClientId(value: unknown): string {
  if (typeof value !== 'string' || !/^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(value.trim())) {
    throw new Error('VITE_GOOGLE_DRIVE_CLIENT_ID_INVALID')
  }
  return value.trim()
}

/**
 * Browser-only GIS token holder. The short-lived Drive token is kept only in
 * memory and is never persisted or exchanged through a Famnesia endpoint.
 */
export class BrowserGoogleDriveAuthorization {
  private token?: DriveToken
  private pending?: Promise<DriveToken>
  private readonly clientId: string
  private readonly now: () => number

  constructor(
    clientId: string,
    now: () => number = Date.now,
  ) {
    parseDriveClientId(clientId)
    this.clientId = clientId
    this.now = now
  }

  currentToken(): DriveToken | undefined {
    return this.token && this.token.expiresAt > this.now() + 15_000 ? this.token : undefined
  }

  clear(): void {
    this.token = undefined
  }

  async connect(): Promise<DriveToken> {
    const current = this.currentToken()
    if (current) return current
    if (this.pending) return this.pending
    this.pending = this.requestFromUser().finally(() => { this.pending = undefined })
    return this.pending
  }

  private async requestFromUser(): Promise<DriveToken> {
    await loadGoogleIdentityServices()
    const oauth2 = (window as GoogleIdentityWindow).google?.accounts?.oauth2
    if (!oauth2) throw new Error('GOOGLE_DRIVE_AUTH_UNAVAILABLE')
    return new Promise<DriveToken>((resolve, reject) => {
      const client = oauth2.initTokenClient({
        client_id: this.clientId,
        scope: DRIVE_FILE_SCOPE,
        callback: (response) => {
          if (response.error || typeof response.access_token !== 'string' || !Number.isFinite(response.expires_in)) {
            reject(new Error('GOOGLE_DRIVE_AUTH_FAILED'))
            return
          }
          this.token = {
            accessToken: response.access_token,
            expiresAt: this.now() + Number(response.expires_in) * 1000,
          }
          resolve(this.token)
        },
        error_callback: () => reject(new Error('GOOGLE_DRIVE_AUTH_CANCELLED')),
      })
      client.requestAccessToken({ prompt: 'consent' })
    })
  }
}
