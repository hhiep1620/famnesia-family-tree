import { parseDriveKeyVault, serializeRecoveryArtifact, type DriveKeyVaultV1 } from './recoveryBootstrap'

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const VAULT_FOLDER_NAME = 'Famnesia Key Vault'
export const VAULT_FILE_NAME = 'vault-v1.json'

export interface DriveToken {
  accessToken: string
  expiresAt: number
}

export interface DriveIdentity {
  emailAddress: string
  permissionId: string
}

interface DriveFileMetadata {
  id: string
  name: string
  mimeType: string
  parents?: string[]
  ownedByMe?: boolean
  trashed?: boolean
  appProperties?: Record<string, string>
}

export class DriveVaultError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'DriveVaultError'
  }
}

function escapeQuery(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")
}

function normalizedEmail(value: string): string {
  return value.trim().toLocaleLowerCase('en-US')
}

export class GoogleDriveKeyVaultClient {
  private readonly tokenProvider: () => Promise<DriveToken>
  private readonly fetcher: typeof fetch
  private readonly now: () => number

  constructor(
    tokenProvider: () => Promise<DriveToken>,
    fetcher: typeof fetch = fetch,
    now: () => number = Date.now,
  ) {
    this.tokenProvider = tokenProvider
    this.fetcher = fetcher
    this.now = now
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.tokenProvider()
    if (!token.accessToken || token.expiresAt <= this.now() + 15_000) {
      throw new DriveVaultError('DRIVE_RECONNECT_REQUIRED', 'Kết nối Google Drive đã hết hạn. Hãy kết nối lại.')
    }
    const response = await this.fetcher(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token.accessToken}` },
      referrerPolicy: 'no-referrer',
    })
    if (response.status === 401) throw new DriveVaultError('DRIVE_RECONNECT_REQUIRED', 'Kết nối Google Drive đã hết hạn. Hãy kết nối lại.')
    if (response.status === 403) throw new DriveVaultError('DRIVE_ACCESS_DENIED', 'Google Drive từ chối quyền truy cập key vault.')
    if (!response.ok) throw new DriveVaultError('DRIVE_REQUEST_FAILED', 'Không thể truy cập key vault trên Google Drive.')
    return response
  }

  async getIdentity(): Promise<DriveIdentity> {
    const response = await this.request('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,permissionId)')
    const body = await response.json() as { user?: { emailAddress?: unknown; permissionId?: unknown } }
    if (typeof body.user?.emailAddress !== 'string' || typeof body.user.permissionId !== 'string') {
      throw new DriveVaultError('DRIVE_IDENTITY_INVALID', 'Google Drive không trả về danh tính tài khoản hợp lệ.')
    }
    return { emailAddress: body.user.emailAddress, permissionId: body.user.permissionId }
  }

  async assertAccount(expectedEmail: string): Promise<DriveIdentity> {
    const identity = await this.getIdentity()
    if (normalizedEmail(identity.emailAddress) !== normalizedEmail(expectedEmail)) {
      throw new DriveVaultError('DRIVE_ACCOUNT_MISMATCH', 'Tài khoản Google Drive không trùng với tài khoản Famnesia đang đăng nhập.')
    }
    return identity
  }

  private async list(query: string): Promise<DriveFileMetadata[]> {
    const params = new URLSearchParams({
      q: query,
      spaces: 'drive',
      fields: 'files(id,name,mimeType,parents,ownedByMe,trashed,appProperties)',
      pageSize: '20',
    })
    const response = await this.request(`https://www.googleapis.com/drive/v3/files?${params}`)
    const body = await response.json() as { files?: DriveFileMetadata[] }
    return Array.isArray(body.files) ? body.files : []
  }

  private async createMultipart(metadata: Record<string, unknown>, content?: string): Promise<DriveFileMetadata> {
    const boundary = `famnesia_${crypto.randomUUID()}`
    const parts = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    ]
    if (content !== undefined) parts.push(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${content}\r\n`)
    parts.push(`--${boundary}--`)
    const response = await this.request(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,parents,ownedByMe,trashed,appProperties',
      { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: parts.join('') },
    )
    return response.json() as Promise<DriveFileMetadata>
  }

  private async createMetadata(metadata: Record<string, unknown>): Promise<DriveFileMetadata> {
    const response = await this.request(
      'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,parents,ownedByMe,trashed,appProperties',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metadata) },
    )
    return response.json() as Promise<DriveFileMetadata>
  }

  private async findVaultFolders(): Promise<DriveFileMetadata[]> {
    return this.list([
      `name='${escapeQuery(VAULT_FOLDER_NAME)}'`,
      "mimeType='application/vnd.google-apps.folder'",
      "appProperties has { key='famnesiaKind' and value='key-vault-folder-v1' }",
      'trashed=false',
    ].join(' and '))
  }

  private async findVaultFiles(folderId: string): Promise<DriveFileMetadata[]> {
    return this.list([
      `'${escapeQuery(folderId)}' in parents`,
      `name='${escapeQuery(VAULT_FILE_NAME)}'`,
      "appProperties has { key='famnesiaKind' and value='key-vault-v1' }",
      'trashed=false',
    ].join(' and '))
  }

  async createVault(expectedEmail: string, vault: DriveKeyVaultV1): Promise<{ folderId: string; fileId: string }> {
    await this.assertAccount(expectedEmail)
    parseDriveKeyVault(vault)
    const existingFolders = await this.findVaultFolders()
    if (existingFolders.length > 1) throw new DriveVaultError('DUPLICATE_KEY_VAULT', 'Phát hiện nhiều thư mục key vault. Không thể tự chọn an toàn.')
    let folder = existingFolders[0]
    if (folder && !folder.ownedByMe) throw new DriveVaultError('DRIVE_VAULT_NOT_OWNED', 'Key vault không thuộc tài khoản Google Drive hiện tại.')
    if (!folder) {
      folder = await this.createMetadata({
        name: VAULT_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        appProperties: { famnesiaKind: 'key-vault-folder-v1' },
      })
    }
    const existingFiles = await this.findVaultFiles(folder.id)
    if (existingFiles.length) throw new DriveVaultError('KEY_VAULT_ALREADY_EXISTS', 'Key vault đã tồn tại; Famnesia sẽ không ghi đè tự động.')
    const file = await this.createMultipart({
      name: VAULT_FILE_NAME,
      mimeType: 'application/json',
      parents: [folder.id],
      appProperties: { famnesiaKind: 'key-vault-v1', formatVersion: '1' },
    }, serializeRecoveryArtifact(vault))
    return { folderId: folder.id, fileId: file.id }
  }

  async restoreVault(expectedEmail: string): Promise<{ folderId: string; fileId: string; vault: DriveKeyVaultV1 }> {
    await this.assertAccount(expectedEmail)
    const folders = await this.findVaultFolders()
    if (folders.length === 0) throw new DriveVaultError('KEY_VAULT_MISSING', 'Không tìm thấy Famnesia Key Vault trong Google Drive này.')
    if (folders.length > 1) throw new DriveVaultError('DUPLICATE_KEY_VAULT', 'Phát hiện nhiều thư mục key vault. Không thể tự chọn an toàn.')
    if (!folders[0].ownedByMe) throw new DriveVaultError('DRIVE_VAULT_NOT_OWNED', 'Key vault không thuộc tài khoản Google Drive hiện tại.')
    const files = await this.findVaultFiles(folders[0].id)
    if (files.length === 0) throw new DriveVaultError('KEY_VAULT_MISSING', 'Key vault chưa có tệp khóa.')
    if (files.length > 1) throw new DriveVaultError('DUPLICATE_KEY_VAULT', 'Phát hiện nhiều tệp khóa. Không thể tự chọn an toàn.')
    if (!files[0].ownedByMe) throw new DriveVaultError('DRIVE_VAULT_NOT_OWNED', 'Tệp key vault không thuộc tài khoản Google Drive hiện tại.')
    const response = await this.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(files[0].id)}?alt=media`)
    let candidate: unknown
    try { candidate = JSON.parse(await response.text()) as unknown }
    catch { throw new DriveVaultError('KEY_VAULT_CORRUPT', 'Tệp key vault không phải JSON hợp lệ.') }
    try {
      return { folderId: folders[0].id, fileId: files[0].id, vault: parseDriveKeyVault(candidate) }
    } catch {
      throw new DriveVaultError('KEY_VAULT_CORRUPT', 'Tệp key vault bị hỏng hoặc không tương thích.')
    }
  }
}
