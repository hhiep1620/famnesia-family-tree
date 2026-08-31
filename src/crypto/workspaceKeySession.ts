import {
  canonicalize,
  deriveWriterAeadKeyFromRootKey,
  encodeBase64Url,
  importWorkspaceRootKey,
  nonceFromCounter,
  type EnvelopePurpose,
  type WorkspaceRootKey,
  type WriterAeadKey,
} from './contract'

export interface WorkspaceKeySessionDescriptor {
  workspaceId: string
  principalId: string
  keyId: string
  keyEpoch: number
  directoryRevision: number
}

export interface WorkspaceKeyTransfer extends WorkspaceKeySessionDescriptor {
  version: 1
  rootKey: CryptoKey
}

const identifier = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u

function assertDescriptor(value: WorkspaceKeySessionDescriptor): void {
  for (const item of [value.workspaceId, value.principalId, value.keyId]) {
    if (!identifier.test(item)) throw new Error('INVALID_WORKSPACE_KEY_SESSION_ID')
  }
  if (!Number.isSafeInteger(value.keyEpoch) || value.keyEpoch < 1 ||
      !Number.isSafeInteger(value.directoryRevision) || value.directoryRevision < 1) {
    throw new Error('INVALID_WORKSPACE_KEY_SESSION_VERSION')
  }
}

function assertRootKey(rootKey: CryptoKey): void {
  if (rootKey.type !== 'secret' || rootKey.extractable || rootKey.algorithm.name !== 'HKDF' ||
      !rootKey.usages.includes('deriveKey')) throw new Error('INVALID_WORKSPACE_ROOT_KEY')
}

export class WorkspaceKeySession {
  readonly workspaceId!: string
  readonly principalId!: string
  readonly keyId!: string
  readonly keyEpoch!: number
  readonly directoryRevision!: number
  readonly writerId: string
  private readonly rootKey: WorkspaceRootKey
  private nonceCounter = 0n
  private integrityKeyPromise?: Promise<CryptoKey>

  private constructor(descriptor: WorkspaceKeySessionDescriptor, rootKey: WorkspaceRootKey, tabId: string) {
    assertDescriptor(descriptor)
    assertRootKey(rootKey.cryptoKey)
    if (!identifier.test(tabId)) throw new Error('INVALID_TAB_ID')
    Object.assign(this, descriptor)
    this.rootKey = rootKey
    this.writerId = `${descriptor.principalId}.tab.${tabId}`
  }

  static async fromRawKey(
    descriptor: WorkspaceKeySessionDescriptor,
    rawKey: Uint8Array,
    tabId = crypto.randomUUID(),
  ): Promise<WorkspaceKeySession> {
    const copy = rawKey.slice()
    try {
      return new WorkspaceKeySession(descriptor, await importWorkspaceRootKey(copy), tabId)
    } finally {
      copy.fill(0)
      rawKey.fill(0)
    }
  }

  static fromTransfer(transfer: WorkspaceKeyTransfer, expected: WorkspaceKeySessionDescriptor, tabId = crypto.randomUUID()): WorkspaceKeySession {
    if (transfer.version !== 1) throw new Error('INVALID_KEY_TRANSFER')
    for (const key of ['workspaceId', 'principalId', 'keyId', 'keyEpoch', 'directoryRevision'] as const) {
      if (transfer[key] !== expected[key]) throw new Error('KEY_TRANSFER_SCOPE_MISMATCH')
    }
    assertRootKey(transfer.rootKey)
    return new WorkspaceKeySession(expected, { cryptoKey: transfer.rootKey }, tabId)
  }

  transfer(): WorkspaceKeyTransfer {
    return {
      version: 1,
      workspaceId: this.workspaceId,
      principalId: this.principalId,
      keyId: this.keyId,
      keyEpoch: this.keyEpoch,
      directoryRevision: this.directoryRevision,
      rootKey: this.rootKey.cryptoKey,
    }
  }

  nextNonce(): Uint8Array {
    const nonce = nonceFromCounter(this.nonceCounter)
    this.nonceCounter += 1n
    return nonce
  }

  writerKey(purpose: EnvelopePurpose, usages: KeyUsage[], writerId = this.writerId): Promise<WriterAeadKey> {
    return deriveWriterAeadKeyFromRootKey(this.rootKey, writerId, this.keyId, this.keyEpoch, purpose, usages)
  }

  async integrityKey(): Promise<CryptoKey> {
    this.integrityKeyPromise ??= crypto.subtle.deriveKey(
      {
        name: 'HKDF', hash: 'SHA-256',
        salt: new TextEncoder().encode(this.workspaceId),
        info: new TextEncoder().encode(canonicalize({ label: 'famnesia:migration-integrity:v1', keyId: this.keyId, keyEpoch: this.keyEpoch })),
      },
      this.rootKey.cryptoKey,
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      false,
      ['sign'],
    )
    return this.integrityKeyPromise
  }

  async keyedDigest(value: unknown): Promise<string> {
    const signature = await crypto.subtle.sign(
      'HMAC', await this.integrityKey(), new TextEncoder().encode(canonicalize(value)),
    )
    return `hmac-sha256:${encodeBase64Url(new Uint8Array(signature))}`
  }

  async opaqueEntityId(fieldClass: string, domainId: string): Promise<string> {
    const digest = await this.keyedDigest({ domain: 'famnesia:entity-id:v1', fieldClass, domainId })
    return `e_${digest.slice('hmac-sha256:'.length)}`
  }
}

export interface WorkspaceKeyChannelMessage {
  type: 'request' | 'response'
  requestId: string
  workspaceId: string
  principalId: string
  transfer?: WorkspaceKeyTransfer
}

export interface WorkspaceKeyChannelPort {
  postMessage(message: WorkspaceKeyChannelMessage): void
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkspaceKeyChannelMessage>) => void): void
  removeEventListener(type: 'message', listener: (event: MessageEvent<WorkspaceKeyChannelMessage>) => void): void
  close(): void
}

export class WorkspaceKeyChannel {
  private readonly listener: (event: MessageEvent<WorkspaceKeyChannelMessage>) => void
  private session?: WorkspaceKeySession
  private readonly port: WorkspaceKeyChannelPort

  constructor(port: WorkspaceKeyChannelPort, session?: WorkspaceKeySession) {
    this.port = port
    this.session = session
    this.listener = (event) => {
      const message = event.data
      if (message?.type !== 'request' || !this.session) return
      if (message.workspaceId !== this.session.workspaceId || message.principalId !== this.session.principalId) return
      this.port.postMessage({ ...message, type: 'response', transfer: this.session.transfer() })
    }
    port.addEventListener('message', this.listener)
  }

  setSession(session?: WorkspaceKeySession): void { this.session = session }

  request(expected: WorkspaceKeySessionDescriptor, timeoutMs = 1_500): Promise<WorkspaceKeySession> {
    const requestId = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error('WORKSPACE_LOCKED')) }, timeoutMs)
      const receive = (event: MessageEvent<WorkspaceKeyChannelMessage>) => {
        const message = event.data
        if (message?.type !== 'response' || message.requestId !== requestId || !message.transfer) return
        cleanup()
        try { resolve(WorkspaceKeySession.fromTransfer(message.transfer, expected)) }
        catch (error) { reject(error) }
      }
      const cleanup = () => { clearTimeout(timer); this.port.removeEventListener('message', receive) }
      this.port.addEventListener('message', receive)
      this.port.postMessage({ type: 'request', requestId, workspaceId: expected.workspaceId, principalId: expected.principalId })
    })
  }

  close(): void {
    this.port.removeEventListener('message', this.listener)
    this.port.close()
    this.session = undefined
  }
}

export function createWorkspaceKeyBroadcastChannel(name = 'famnesia-workspace-key-v1'): WorkspaceKeyChannel {
  if (typeof BroadcastChannel === 'undefined') throw new Error('WORKSPACE_KEY_CHANNEL_UNAVAILABLE')
  return new WorkspaceKeyChannel(new BroadcastChannel(name))
}
