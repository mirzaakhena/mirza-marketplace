import { test, expect, describe } from 'bun:test'
import { InjectionGate } from './injection-gate'

const TIMEOUT = 600_000

describe('InjectionGate', () => {
  test('starts unblocked', () => {
    const gate = new InjectionGate(TIMEOUT)
    expect(gate.isBlocked(1_000)).toBe(false)
  })

  test('holdFor blocks until the deadline, then unblocks', () => {
    const gate = new InjectionGate(TIMEOUT)
    gate.holdFor(1_500, 10_000)
    expect(gate.isBlocked(10_000)).toBe(true)
    expect(gate.isBlocked(11_499)).toBe(true)
    expect(gate.isBlocked(11_500)).toBe(false)
  })

  test('holdFor keeps the furthest deadline (max, not overwrite)', () => {
    const gate = new InjectionGate(TIMEOUT)
    gate.holdFor(5_000, 10_000) // until 15_000
    gate.holdFor(1_000, 11_000) // until 12_000 — must NOT shorten
    expect(gate.isBlocked(14_999)).toBe(true)
    expect(gate.isBlocked(15_000)).toBe(false)
  })

  test('clear barrier blocks regardless of hold window', () => {
    const gate = new InjectionGate(TIMEOUT)
    gate.beginClearBarrier(10_000)
    expect(gate.isBlocked(10_000)).toBe(true)
    // Long after any hold window would have expired, still blocked.
    expect(gate.isBlocked(300_000)).toBe(true)
  })

  test('releaseClearBarrier unblocks after the settle window', () => {
    const gate = new InjectionGate(TIMEOUT)
    gate.beginClearBarrier(10_000)
    gate.releaseClearBarrier(2_500, 60_000)
    expect(gate.isBlocked(60_000)).toBe(true) // settling
    expect(gate.isBlocked(62_499)).toBe(true)
    expect(gate.isBlocked(62_500)).toBe(false)
  })

  test('clear barrier force-releases after the safety timeout', () => {
    const gate = new InjectionGate(TIMEOUT)
    gate.beginClearBarrier(10_000)
    expect(gate.isBlocked(10_000 + TIMEOUT)).toBe(true) // boundary still held
    expect(gate.isBlocked(10_001 + TIMEOUT)).toBe(false) // timed out
    // And stays disarmed afterwards.
    expect(gate.clearBarrierActive(10_002 + TIMEOUT)).toBe(false)
  })

  test('hold window still applies after a barrier timeout', () => {
    const gate = new InjectionGate(1_000)
    gate.beginClearBarrier(10_000)
    gate.holdFor(100_000, 10_000) // until 110_000
    expect(gate.isBlocked(12_000)).toBe(true) // barrier timed out at 11_000, hold remains
    expect(gate.isBlocked(110_000)).toBe(false)
  })
})
