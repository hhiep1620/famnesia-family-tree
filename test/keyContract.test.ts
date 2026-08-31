import { describe, expect, it } from 'vitest'
import {
  decodeBase64Url,
  deriveRecoveryEnvelopeKey,
  decryptEnvelope,
  encodeBase64Url,
  encodeUtf8,
  encryptEnvelopeWithWriterKey,
} from '../src/crypto/contract'
import {
  generateProvisioningSigningKeyPair,
  generateProvisioningUnwrappingKeyPair,
  importSigningPrivateKey,
  importUnwrappingPrivateKey,
  invitationCommitment,
  publicKeyFingerprint,
  signArtifact,
  signedArtifactHash,
  unwrapKeyMaterial,
  verifyArtifact,
  verifyEnrollmentInvitation,
  verifyFreshnessChain,
  verifyPrincipalRebind,
  verifyRevisionedArtifact,
  verifySigningRotation,
  wrapKeyMaterial,
} from '../src/crypto/keyContract'

describe('key contract v1', () => {
  it('wraps only for the bound recipient and rejects public-key substitution', async () => {
    const recipient = await generateProvisioningUnwrappingKeyPair()
    const attacker = await generateProvisioningUnwrappingKeyPair()
    const issuer = await generateProvisioningSigningKeyPair()
    const fingerprint = await publicKeyFingerprint(recipient.publicKey)
    const context = {
      envelopeId: 'env-test-01',
      workspaceId: 'ws-test-01',
      entityId: 'workspace-key-test-01',
      recipientPrincipalId: 'cp_recipient',
      recipientKeyFingerprint: fingerprint,
      keyId: 'wk-test-01',
      keyPurpose: 'workspace' as const,
      keyEpoch: 1,
      directoryRevision: 4,
      issuerPrincipalId: 'cp_owner',
      issuerSigningFingerprint: await publicKeyFingerprint(issuer.publicKey),
      expiresAt: 2_000_000_000,
    }
    const raw = decodeBase64Url('AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8')
    const envelope = await wrapKeyMaterial(raw, recipient.publicKey, context, issuer.privateKey, issuer.publicKey)
    expect(await unwrapKeyMaterial(envelope, recipient.privateKey, recipient.publicKey, context, issuer.publicKey, 1_900_000_000)).toEqual(raw)
    await expect(unwrapKeyMaterial(envelope, attacker.privateKey, attacker.publicKey, context, issuer.publicKey, 1_900_000_000)).rejects.toThrow(
      'RECIPIENT_FINGERPRINT_MISMATCH',
    )
    await expect(
      unwrapKeyMaterial(envelope, recipient.privateKey, recipient.publicKey, { ...context, workspaceId: 'ws-other' }, issuer.publicKey, 1_900_000_000),
    ).rejects.toThrow('KEY_CONTEXT_MISMATCH')
    const substitutedIssuer = await generateProvisioningSigningKeyPair()
    await expect(
      unwrapKeyMaterial(envelope, recipient.privateKey, recipient.publicKey, context, substitutedIssuer.publicKey, 1_900_000_000),
    ).rejects.toThrow('ISSUER_FINGERPRINT_MISMATCH')
    await expect(
      unwrapKeyMaterial(envelope, recipient.privateKey, recipient.publicKey, context, issuer.publicKey, 2_000_000_001),
    ).rejects.toThrow('KEY_ENVELOPE_EXPIRED')
    await expect(
      unwrapKeyMaterial({ ...envelope, wrappedKey: `${envelope.wrappedKey.slice(0, -1)}A` }, recipient.privateKey, recipient.publicKey, context, issuer.publicKey, 1_900_000_000),
    ).rejects.toThrow()
  })

  it('binds signatures to purpose, principal and public-key fingerprint', async () => {
    const signer = await generateProvisioningSigningKeyPair()
    const reader = await generateProvisioningSigningKeyPair()
    const fingerprint = await publicKeyFingerprint(signer.publicKey)
    const artifact = await signArtifact({ revision: 2 }, 'directory', 'cp_owner', signer.privateKey, signer.publicKey)
    expect(await verifyArtifact(artifact, signer.publicKey, { purpose: 'directory', principalId: 'cp_owner', fingerprint })).toBe(true)
    expect(await verifyArtifact(artifact, reader.publicKey, { purpose: 'directory', principalId: 'cp_owner', fingerprint })).toBe(false)
    expect(await verifyArtifact(artifact, signer.publicKey, { purpose: 'policy', principalId: 'cp_owner', fingerprint })).toBe(false)
    expect(await verifyArtifact(artifact, signer.publicKey, { purpose: 'directory', principalId: 'cp_other', fingerprint })).toBe(false)
    expect(await verifyRevisionedArtifact(artifact, signer.publicKey, {
      purpose: 'directory', principalId: 'cp_owner', fingerprint, revokedAtRevision: 2,
    })).toBe(false)
  })

  it('requires both old and new signing keys for normal root rotation', async () => {
    const oldPair = await generateProvisioningSigningKeyPair()
    const newPair = await generateProvisioningSigningKeyPair()
    const serverPair = await generateProvisioningSigningKeyPair()
    const transition = {
      workspaceId: 'ws-test-01',
      fromRevision: 4,
      toRevision: 5,
      oldFingerprint: await publicKeyFingerprint(oldPair.publicKey),
      newFingerprint: await publicKeyFingerprint(newPair.publicKey),
    }
    const oldSignature = await signArtifact(transition, 'directory', 'cp_owner', oldPair.privateKey, oldPair.publicKey)
    const newSignature = await signArtifact(transition, 'directory', 'cp_owner', newPair.privateKey, newPair.publicKey)
    const serverSignature = await signArtifact(transition, 'directory', 'cp_owner', serverPair.privateKey, serverPair.publicKey)
    expect(await verifySigningRotation(transition, oldSignature, newSignature, oldPair.publicKey, newPair.publicKey, 'cp_owner', 'ws-test-01', 4)).toBe(true)
    expect(await verifySigningRotation(transition, serverSignature, newSignature, oldPair.publicKey, newPair.publicKey, 'cp_owner', 'ws-test-01', 4)).toBe(false)
    expect(await verifySigningRotation({ ...transition, newFingerprint: await publicKeyFingerprint(serverPair.publicKey) }, oldSignature, newSignature, oldPair.publicKey, newPair.publicKey, 'cp_owner', 'ws-test-01', 4)).toBe(false)
    expect(await verifySigningRotation({ ...transition, toRevision: 7 }, oldSignature, newSignature, oldPair.publicKey, newPair.publicKey, 'cp_owner', 'ws-test-01', 4)).toBe(false)
  })

  it('verifies signed enrollment, commitment, expiry, pinned root and single use', async () => {
    const owner = await generateProvisioningSigningKeyPair()
    const nonce = new Uint8Array(32).fill(7)
    const ownerFingerprint = await publicKeyFingerprint(owner.publicKey)
    const invitation = {
      workspaceId: 'ws-test-01', genesisFingerprint: 'sha256:genesis', ownerPrincipalId: 'cp_owner',
      ownerSigningFingerprint: ownerFingerprint, invitationId: 'invite-test-01', expiresAt: 2_000_000_000, nonce: 'nonce-test-01',
    }
    const expected = await invitationCommitment(invitation, nonce)
    const artifact = await signArtifact(invitation, 'enrollment', 'cp_owner', owner.privateKey, owner.publicKey)
    const baseExpected = {
      workspaceId: 'ws-test-01', genesisFingerprint: 'sha256:genesis', ownerPrincipalId: 'cp_owner',
      ownerSigningFingerprint: ownerFingerprint, commitment: expected, clientNonce: nonce,
      nowEpochSeconds: 1_900_000_000, usedInvitationIds: new Set<string>(),
    }
    expect(await verifyEnrollmentInvitation(artifact, owner.publicKey, baseExpected)).toBe(true)
    expect(await verifyEnrollmentInvitation(artifact, owner.publicKey, { ...baseExpected, genesisFingerprint: 'sha256:server' })).toBe(false)
    expect(await verifyEnrollmentInvitation(artifact, owner.publicKey, { ...baseExpected, nowEpochSeconds: 2_000_000_001 })).toBe(false)
    expect(await verifyEnrollmentInvitation(artifact, owner.publicKey, { ...baseExpected, usedInvitationIds: new Set(['invite-test-01']) })).toBe(false)
  })

  it('requires distinct signing and unwrapping algorithm purposes', async () => {
    const signing = await generateProvisioningSigningKeyPair()
    const unwrapping = await generateProvisioningUnwrappingKeyPair()
    expect(signing.privateKey.algorithm.name).toBe('ECDSA')
    expect(unwrapping.privateKey.algorithm.name).toBe('ECDH')
    await expect(signArtifact({ grant: true }, 'policy', 'cp_owner', unwrapping.privateKey, unwrapping.publicKey)).rejects.toThrow()
  })

  it('re-imports provisioned private keys as non-extractable', async () => {
    const signing = await generateProvisioningSigningKeyPair()
    const unwrapping = await generateProvisioningUnwrappingKeyPair()
    const lockedSigning = await importSigningPrivateKey(await crypto.subtle.exportKey('jwk', signing.privateKey))
    const lockedUnwrapping = await importUnwrappingPrivateKey(await crypto.subtle.exportKey('jwk', unwrapping.privateKey))
    expect(lockedSigning.extractable).toBe(false)
    expect(lockedUnwrapping.extractable).toBe(false)
  })

  it('accepts only a contiguous signed freshness chain from the pinned checkpoint', async () => {
    const authority = await generateProvisioningSigningKeyPair()
    const fingerprint = await publicKeyFingerprint(authority.publicKey)
    const checkpoint = {
      workspaceId: 'ws-test-01', revision: 10, directoryRevision: 6,
      previousCheckpointHash: 'checkpoint-9', stateHash: 'state-10', timestamp: 1_900_000_000,
    }
    const artifact = await signArtifact(checkpoint, 'directory', 'cp_owner', authority.privateKey, authority.publicKey)
    const expected = {
      workspaceId: 'ws-test-01', authorityPrincipalId: 'cp_owner', authorityFingerprint: fingerprint,
      pinnedCheckpointHash: 'checkpoint-9', pinnedRevision: 9, pinnedDirectoryRevision: 5,
    }
    expect(await verifyFreshnessChain([artifact], authority.publicKey, expected)).toBe(true)
    expect(await signedArtifactHash({ ...artifact, signature: encodeBase64Url(new Uint8Array(64).fill(9)) })).toBe(
      await signedArtifactHash(artifact),
    )
    const skipped = await signArtifact({ ...checkpoint, revision: 11 }, 'directory', 'cp_owner', authority.privateKey, authority.publicKey)
    expect(await verifyFreshnessChain([skipped], authority.publicKey, expected)).toBe(false)
    expect(await verifyFreshnessChain([{ ...artifact, payload: { ...checkpoint, stateHash: 'server-forged' } }], authority.publicKey, expected)).toBe(false)
    expect(await verifyFreshnessChain([artifact], authority.publicKey, { ...expected, revokedAtRevision: 10 })).toBe(false)
  })

  it('matches the deterministic recovery KDF vector', async () => {
    const secret = new Uint8Array(32).fill(17)
    const salt = new Uint8Array(32).fill(34)
    const key = await deriveRecoveryEnvelopeKey(secret, salt, 'cp_test', 1, ['encrypt', 'decrypt'])
    expect(key.cryptoKey.extractable).toBe(false)
    const aad = {
      workspaceId: 'principal', entityId: 'cp_test', fieldClass: 'private-key-bundle', schemaVersion: 1,
      dataVersion: 1, keyId: key.keyId, keyEpoch: 1, writerId: key.writerId,
      purpose: 'user-private-key-bundle' as const,
    }
    const envelope = await encryptEnvelopeWithWriterKey(encodeUtf8('private-bundle'), key, aad, new Uint8Array(12))
    expect(envelope.ciphertext).toBe('qPcNiDp4su_cLwybBeFr6_dppGinAuNUFcFjDiRe')
    expect(await decryptEnvelope(envelope, key, aad)).toEqual(encodeUtf8('private-bundle'))
  })

  it('rebinds an auth UUID only with signing and unwrapping possession proofs', async () => {
    const signing = await generateProvisioningSigningKeyPair()
    const unwrapping = await generateProvisioningUnwrappingKeyPair()
    const issuerFingerprint = await publicKeyFingerprint(signing.publicKey)
    const recipientFingerprint = await publicKeyFingerprint(unwrapping.publicKey)
    const challenge = new Uint8Array(32).fill(91)
    const proofHash = encodeBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', challenge)))
    const payload = {
      principalId: 'cp_owner', oldAuthUuid: 'auth-old', newAuthUuid: 'auth-new', challengeId: 'challenge-01',
      unwrapProofHash: proofHash, expiresAt: 2_000_000_000,
    }
    const signed = await signArtifact(payload, 'principal-rebind', 'cp_owner', signing.privateKey, signing.publicKey)
    const context = {
      envelopeId: 'env-rebind-01', workspaceId: 'principal', entityId: 'challenge-01',
      recipientPrincipalId: 'cp_owner', recipientKeyFingerprint: recipientFingerprint,
      keyId: 'rebind-challenge-01', keyPurpose: 'recovery' as const, keyEpoch: 1, directoryRevision: 1,
      issuerPrincipalId: 'cp_owner', issuerSigningFingerprint: issuerFingerprint, expiresAt: 2_000_000_000,
    }
    const wrapped = await wrapKeyMaterial(challenge, unwrapping.publicKey, context, signing.privateKey, signing.publicKey)
    const expected = {
      principalId: 'cp_owner', signingFingerprint: issuerFingerprint, oldAuthUuid: 'auth-old', newAuthUuid: 'auth-new',
      challengeId: 'challenge-01', nowEpochSeconds: 1_900_000_000, usedChallengeIds: new Set<string>(),
    }
    expect(await verifyPrincipalRebind(
      signed, signing.publicKey, wrapped, unwrapping.privateKey, unwrapping.publicKey, context, signing.publicKey, expected,
    )).toBe(true)
    expect(await verifyPrincipalRebind(
      signed, signing.publicKey, null, unwrapping.privateKey, unwrapping.publicKey, context, signing.publicKey, expected,
    )).toBe(false)
    expect(await verifyPrincipalRebind(
      signed, signing.publicKey, wrapped, unwrapping.privateKey, unwrapping.publicKey, context, signing.publicKey,
      { ...expected, newAuthUuid: 'auth-attacker' },
    )).toBe(false)
    expect(await verifyPrincipalRebind(
      signed, signing.publicKey, wrapped, unwrapping.privateKey, unwrapping.publicKey, context, signing.publicKey,
      { ...expected, usedChallengeIds: new Set(['challenge-01']) },
    )).toBe(false)
  })
})
