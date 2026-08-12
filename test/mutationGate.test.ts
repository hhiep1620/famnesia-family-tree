import { describe, expect, it } from 'vitest'
import { MutationGate, MutationInProgressError } from '../src/services/mutationGate'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((next, fail) => { resolve = next; reject = fail })
  return { promise, resolve, reject }
}

describe('MutationGate', () => {
  it('rejects a second mutation while the first one is running', async () => {
    const gate = new MutationGate()
    const pending = deferred<string>()
    const first = gate.run(() => pending.promise)

    await expect(gate.run(async () => 'second')).rejects.toBeInstanceOf(MutationInProgressError)
    pending.resolve('first')
    await expect(first).resolves.toBe('first')
  })

  it('allows the next mutation after success', async () => {
    const gate = new MutationGate()
    await expect(gate.run(async () => 'first')).resolves.toBe('first')
    await expect(gate.run(async () => 'second')).resolves.toBe('second')
  })

  it('releases the gate after failure', async () => {
    const gate = new MutationGate()
    await expect(gate.run(async () => { throw new Error('failed') })).rejects.toThrow('failed')
    await expect(gate.run(async () => 'recovered')).resolves.toBe('recovered')
  })
})
