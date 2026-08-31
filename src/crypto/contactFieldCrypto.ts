import {
  decodeUtf8,
  deriveWriterAeadKeyFromRootKey,
  encodeUtf8,
  encryptEnvelopeWithWriterKey,
  importWorkspaceRootKey,
  nonceFromCounter,
  decryptEnvelope,
  type EncryptedEnvelopeV1,
  type WorkspaceRootKey,
} from './contract'
import { wrapKeyMaterial, type KeyWrapContextV1, type WrappedKeyEnvelopeV1 } from './keyContract'
import type { PrivateFieldClass } from './encryptedDataContract'

export interface ContactFieldDescriptor {
  workspaceId: string
  personId: string
  fieldClass: PrivateFieldClass
  keyId: string
  keyEpoch: number
  writerId: string
}

export interface ContactRecipient {
  principalId: string
  unwrapFingerprint: string
  unwrapPublicKey: CryptoKey
  envelopeId: string
}

export interface ProvisionedContactField {
  envelope: EncryptedEnvelopeV1
  wrappedKeys: WrappedKeyEnvelopeV1[]
}

export class ContactFieldKeySession {
  private readonly rootKey: WorkspaceRootKey
  private readonly descriptor: ContactFieldDescriptor
  private nonceCounter = 0n

  private constructor(descriptor: ContactFieldDescriptor, rootKey: WorkspaceRootKey) {
    this.descriptor = descriptor
    this.rootKey = rootKey
  }

  static async fromRaw(descriptor: ContactFieldDescriptor, rawKey: Uint8Array): Promise<ContactFieldKeySession> {
    const copy = rawKey.slice()
    try { return new ContactFieldKeySession(descriptor, await importWorkspaceRootKey(copy)) }
    finally { copy.fill(0); rawKey.fill(0) }
  }

  async encrypt(value: string, dataVersion: number): Promise<EncryptedEnvelopeV1> {
    if (typeof value !== 'string' || value.length > 16_384) throw new Error('INVALID_CONTACT_VALUE')
    const key = await deriveWriterAeadKeyFromRootKey(this.rootKey, this.descriptor.writerId, this.descriptor.keyId,
      this.descriptor.keyEpoch, 'contact', ['encrypt'])
    const aad = { workspaceId: this.descriptor.workspaceId, entityId: this.descriptor.personId, fieldClass: this.descriptor.fieldClass,
      schemaVersion: 1, dataVersion, keyId: this.descriptor.keyId, keyEpoch: this.descriptor.keyEpoch,
      writerId: this.descriptor.writerId, purpose: 'contact' as const }
    return encryptEnvelopeWithWriterKey(encodeUtf8(JSON.stringify({ version: 1, value })), key, aad, nonceFromCounter(this.nonceCounter++))
  }

  async decrypt(envelope: EncryptedEnvelopeV1): Promise<string> {
    if (envelope.aad.workspaceId !== this.descriptor.workspaceId || envelope.aad.entityId !== this.descriptor.personId ||
        envelope.aad.fieldClass !== this.descriptor.fieldClass || envelope.aad.keyId !== this.descriptor.keyId ||
        envelope.aad.keyEpoch !== this.descriptor.keyEpoch || envelope.aad.purpose !== 'contact') {
      throw new Error('CONTACT_FIELD_CONTEXT_MISMATCH')
    }
    const key = await deriveWriterAeadKeyFromRootKey(this.rootKey, envelope.aad.writerId, envelope.aad.keyId,
      envelope.aad.keyEpoch, 'contact', ['decrypt'])
    const decoded = JSON.parse(decodeUtf8(await decryptEnvelope(envelope, key, envelope.aad, envelope.aad.dataVersion))) as unknown
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded) ||
        Object.keys(decoded).sort().join('|') !== 'value|version' || (decoded as { version?: unknown }).version !== 1 ||
        typeof (decoded as { value?: unknown }).value !== 'string') throw new Error('INVALID_CONTACT_PAYLOAD')
    return (decoded as { value: string }).value
  }
}

export async function provisionContactField(
  descriptor: ContactFieldDescriptor,
  value: string,
  dataVersion: number,
  directoryRevision: number,
  recipients: ContactRecipient[],
  issuer: { principalId: string; signingFingerprint: string; signingPrivateKey: CryptoKey; signingPublicKey: CryptoKey },
  expiresAt: number,
): Promise<ProvisionedContactField> {
  if (!recipients.length) throw new Error('CONTACT_RECIPIENT_REQUIRED')
  const rawKey = crypto.getRandomValues(new Uint8Array(32))
  try {
    const wrappedKeys: WrappedKeyEnvelopeV1[] = []
    for (const recipient of recipients) {
      const context: KeyWrapContextV1 = {
        envelopeId: recipient.envelopeId, workspaceId: descriptor.workspaceId, entityId: descriptor.personId,
        recipientPrincipalId: recipient.principalId, recipientKeyFingerprint: recipient.unwrapFingerprint,
        keyId: descriptor.keyId, keyPurpose: 'contact', keyEpoch: descriptor.keyEpoch, directoryRevision,
        issuerPrincipalId: issuer.principalId, issuerSigningFingerprint: issuer.signingFingerprint, expiresAt,
      }
      wrappedKeys.push(await wrapKeyMaterial(rawKey, recipient.unwrapPublicKey, context, issuer.signingPrivateKey, issuer.signingPublicKey))
    }
    const session = await ContactFieldKeySession.fromRaw(descriptor, rawKey)
    return { envelope: await session.encrypt(value, dataVersion), wrappedKeys }
  } finally { rawKey.fill(0) }
}
