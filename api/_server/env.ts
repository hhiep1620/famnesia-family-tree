function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required server environment variable: ${name}`)
  return value
}

export function googleOAuthEnv() {
  return {
    clientId: required('GOOGLE_CLIENT_ID'),
    clientSecret: required('GOOGLE_CLIENT_SECRET'),
    redirectUri: required('GOOGLE_REDIRECT_URI'),
  }
}

export function googlePickerEnv() {
  const clientId = googleOAuthEnv().clientId
  const configuredAppId = process.env.GOOGLE_CLOUD_PROJECT_NUMBER?.trim()
  const inferredAppId = /^(\d+)-/.exec(clientId)?.[1]
  const appId = configuredAppId || inferredAppId
  if (!appId || !/^\d+$/.test(appId)) {
    throw new Error('GOOGLE_CLOUD_PROJECT_NUMBER must be a valid Google Cloud project number.')
  }
  return {
    apiKey: required('GOOGLE_PICKER_API_KEY'),
    appId,
  }
}

export function sessionSecret(): string {
  const value = required('SESSION_SECRET')
  if (value.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.')
  return value
}

export function tokenEncryptionKey(): string {
  const value = required('TOKEN_ENCRYPTION_KEY')
  if (value.length < 32) throw new Error('TOKEN_ENCRYPTION_KEY must contain at least 32 characters.')
  return value
}

export function sessionMaxAgeSeconds(): number {
  const raw = process.env.SESSION_MAX_AGE_SECONDS ?? '604800'
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 300 || value > 31_536_000) {
    throw new Error('SESSION_MAX_AGE_SECONDS must be an integer between 300 and 31536000.')
  }
  return value
}

export function isProduction(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'
}
