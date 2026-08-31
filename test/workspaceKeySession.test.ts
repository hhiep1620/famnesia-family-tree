import { describe, expect, it } from 'vitest'
import {
  WorkspaceKeyChannel,
  WorkspaceKeySession,
  type WorkspaceKeyChannelMessage,
  type WorkspaceKeyChannelPort,
} from '../src/crypto/workspaceKeySession'

const descriptor = {
  workspaceId: '42000000-0000-4000-8000-000000000001',
  principalId: 'cp_aaaaaaaaaaaaaaaaaaaaaaaa',
  keyId: 'wk-family-1', keyEpoch: 1, directoryRevision: 2,
}

class PairedPort implements WorkspaceKeyChannelPort {
  peer?: PairedPort
  private listeners = new Set<(event: MessageEvent<WorkspaceKeyChannelMessage>) => void>()
  postMessage(message: WorkspaceKeyChannelMessage): void {
    queueMicrotask(() => this.peer?.listeners.forEach((listener) => listener({ data: message } as MessageEvent<WorkspaceKeyChannelMessage>)))
  }
  addEventListener(_type: 'message', listener: (event: MessageEvent<WorkspaceKeyChannelMessage>) => void): void { this.listeners.add(listener) }
  removeEventListener(_type: 'message', listener: (event: MessageEvent<WorkspaceKeyChannelMessage>) => void): void { this.listeners.delete(listener) }
  close(): void { this.listeners.clear() }
}

function channelPair(): [PairedPort, PairedPort] {
  const left = new PairedPort(); const right = new PairedPort()
  left.peer = right; right.peer = left
  return [left, right]
}

describe('CR-05 workspace key session', () => {
  it('imports and transfers only a non-extractable root handle', async () => {
    const raw = new Uint8Array(32).fill(9)
    const first = await WorkspaceKeySession.fromRawKey(descriptor, raw, 'tab-one')
    expect([...raw].every((byte) => byte === 0)).toBe(true)
    const transfer = first.transfer()
    expect(transfer.rootKey.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', transfer.rootKey)).rejects.toThrow()
    const second = WorkspaceKeySession.fromTransfer(transfer, descriptor, 'tab-two')
    expect(second.writerId).not.toBe(first.writerId)
    expect(await second.keyedDigest({ test: 1 })).toBe(await first.keyedDigest({ test: 1 }))
  })

  it('rejects cross-workspace, principal and epoch handoff', async () => {
    const first = await WorkspaceKeySession.fromRawKey(descriptor, new Uint8Array(32).fill(9), 'tab-one')
    for (const changed of [
      { ...descriptor, workspaceId: '42000000-0000-4000-8000-000000000099' },
      { ...descriptor, principalId: 'cp_bbbbbbbbbbbbbbbbbbbbbbbb' },
      { ...descriptor, keyEpoch: 2 },
    ]) expect(() => WorkspaceKeySession.fromTransfer(first.transfer(), changed)).toThrow('KEY_TRANSFER_SCOPE_MISMATCH')
  })

  it('separates writer subkeys and nonce counters per tab', async () => {
    const first = await WorkspaceKeySession.fromRawKey(descriptor, new Uint8Array(32).fill(9), 'tab-one')
    const second = WorkspaceKeySession.fromTransfer(first.transfer(), descriptor, 'tab-two')
    expect(first.writerId).not.toBe(second.writerId)
    expect(first.nextNonce()).toEqual(second.nextNonce())
    const firstKey = await first.writerKey('family-content', ['encrypt'])
    const secondKey = await second.writerKey('family-content', ['encrypt'])
    expect(firstKey.writerId).not.toBe(secondKey.writerId)
  })

  it('hands a non-extractable key to another tab without serialization or persistence', async () => {
    const first = await WorkspaceKeySession.fromRawKey(descriptor, new Uint8Array(32).fill(9), 'tab-one')
    const [ownerPort, peerPort] = channelPair()
    const owner = new WorkspaceKeyChannel(ownerPort, first)
    const peer = new WorkspaceKeyChannel(peerPort)
    const second = await peer.request(descriptor, 100)
    expect(second.writerId).not.toBe(first.writerId)
    expect(second.transfer().rootKey.extractable).toBe(false)
    expect(await second.keyedDigest({ shared: true })).toBe(await first.keyedDigest({ shared: true }))
    owner.close(); peer.close()
  })
})
