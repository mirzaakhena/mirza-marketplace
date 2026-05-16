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
