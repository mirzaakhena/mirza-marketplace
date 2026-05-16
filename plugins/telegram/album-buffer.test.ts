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
