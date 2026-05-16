import { test, expect, describe } from 'bun:test'
import { createAlbumBuffer } from './album-buffer'

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

describe('album-buffer: debounce flush', () => {
  test('single item flushes after debounce window', async () => {
    const flushed: Array<{ key: string; items: number[] }> = []
    const buf = createAlbumBuffer<number>({
      debounceMs: 40,
      hardCapMs: 1000,
      maxItems: 10,
      onFlush: (key, items) => { flushed.push({ key, items }) },
    })

    buf.add('A', 1)
    expect(flushed).toEqual([])
    await wait(80)
    expect(flushed).toEqual([{ key: 'A', items: [1] }])
    expect(buf.size()).toBe(0)
  })
})

describe('album-buffer: debounce reset', () => {
  test('3 items in window flush as single batch after last item + debounce', async () => {
    const flushed: Array<{ key: string; items: number[] }> = []
    const buf = createAlbumBuffer<number>({
      debounceMs: 40,
      hardCapMs: 1000,
      maxItems: 10,
      onFlush: (key, items) => { flushed.push({ key, items }) },
    })

    buf.add('A', 1)
    await wait(20)
    buf.add('A', 2)
    await wait(20)
    buf.add('A', 3)
    expect(flushed).toEqual([])  // total elapsed ~40ms, debounce reset means we should not have flushed yet
    await wait(80)
    expect(flushed).toEqual([{ key: 'A', items: [1, 2, 3] }])
  })
})

describe('album-buffer: hard cap', () => {
  test('continuous stream flushes at hardCapMs even though debounce keeps resetting', async () => {
    const flushed: Array<{ key: string; items: number[] }> = []
    const buf = createAlbumBuffer<number>({
      debounceMs: 80,
      hardCapMs: 200,
      maxItems: 100,
      onFlush: (key, items) => { flushed.push({ key, items }) },
    })

    // Stream items every 40ms — debounce (80ms) keeps resetting,
    // but hard cap (200ms) should fire and flush.
    // All 5 items land at t≈0,40,80,120,160 — all before the 200ms hard cap.
    const t0 = Date.now()
    buf.add('A', 1)
    await wait(40); buf.add('A', 2)
    await wait(40); buf.add('A', 3)
    await wait(40); buf.add('A', 4)
    await wait(40); buf.add('A', 5)
    // Total elapsed ~160ms — wait another 100ms for hard cap (200ms) to fire.
    await wait(100)
    const elapsed = Date.now() - t0

    expect(flushed.length).toBe(1)
    expect(flushed[0].key).toBe('A')
    expect(flushed[0].items.length).toBe(5)
    expect(elapsed).toBeLessThan(400)  // sanity: didn't wait debounce
    expect(buf.size()).toBe(0)
  })
})
