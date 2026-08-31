import { describe, expect, it } from 'vitest'
import { ContactFieldKeySession, provisionContactField } from '../src/crypto/contactFieldCrypto'
import { generateProvisioningSigningKeyPair, generateProvisioningUnwrappingKeyPair, publicKeyFingerprint, unwrapKeyMaterial } from '../src/crypto/keyContract'

const descriptor = { workspaceId: 'workspace-one', personId: 'person-one', fieldClass: 'phone' as const,
  keyId: 'contact-person-one-phone-1', keyEpoch: 1, writerId: 'principal-owner.tab.one' }

describe('CR-07 field-scoped contact crypto', () => {
  it('encrypts one field, wraps only for recipients and never emits plaintext', async () => {
    const recipient = await generateProvisioningUnwrappingKeyPair(); const issuer = await generateProvisioningSigningKeyPair()
    const recipientFingerprint = await publicKeyFingerprint(recipient.publicKey); const issuerFingerprint = await publicKeyFingerprint(issuer.publicKey)
    const result = await provisionContactField(descriptor, '0900000000', 2, 3, [{ principalId: 'principal-recipient',
      unwrapFingerprint: recipientFingerprint, unwrapPublicKey: recipient.publicKey, envelopeId: 'envelope-phone-one' }], {
      principalId: 'principal-owner', signingFingerprint: issuerFingerprint, signingPrivateKey: issuer.privateKey, signingPublicKey: issuer.publicKey,
    }, 2_000_000_000)
    expect(JSON.stringify(result)).not.toContain('0900000000')
    const context = result.wrappedKeys[0].context
    const raw = await unwrapKeyMaterial(result.wrappedKeys[0], recipient.privateKey, recipient.publicKey, context, issuer.publicKey, 1_900_000_000)
    const session = await ContactFieldKeySession.fromRaw(descriptor, raw)
    await expect(session.decrypt(result.envelope)).resolves.toBe('0900000000')
  })

  it('cannot decrypt a phone field with another field key', async () => {
    const phoneRaw = new Uint8Array(32).fill(1); const addressRaw = new Uint8Array(32).fill(2)
    const phone = await ContactFieldKeySession.fromRaw(descriptor, phoneRaw)
    const envelope = await phone.encrypt('0900000000', 2)
    const address = await ContactFieldKeySession.fromRaw({ ...descriptor, fieldClass: 'address', keyId: 'contact-person-one-address-1' }, addressRaw)
    await expect(address.decrypt(envelope)).rejects.toThrow()
  })
})
