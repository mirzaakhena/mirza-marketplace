import { test, expect, describe, spyOn } from 'bun:test'
import { createMessagesStore } from './messages-store'

describe('messages-store: init', () => {
  test('init creates messages table with expected columns', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    const db = store._dbForTest()
    const cols = db.query("PRAGMA table_info(messages)").all() as Array<{ name: string }>
    const names = cols.map(c => c.name).sort()

    expect(names).toEqual([
      'attachments', 'chat_id', 'id', 'message_id', 'metadata',
      'reply_to', 'source', 'text', 'ts', 'user_id', 'user_name',
    ])
    store.close()
  })

  test('init creates expected indexes', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    const db = store._dbForTest()
    const idx = db.query("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_messages%'").all() as Array<{ name: string }>
    const names = idx.map(i => i.name).sort()

    expect(names).toEqual([
      'idx_messages_chat_ts', 'idx_messages_msg', 'idx_messages_source',
    ])
    store.close()
  })

  test('init is idempotent', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()
    expect(() => store.init()).not.toThrow()
    store.close()
  })
})

describe('messages-store: logInbound text-only', () => {
  test('persists text inbound with required fields', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    store.logInbound({
      ts: 1700000000000,
      chat_id: '12345',
      message_id: '99',
      user_id: '777',
      user_name: 'mirza',
      text: 'halo',
    })

    const rows = store._dbForTest().query('SELECT * FROM messages').all() as any[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      ts: 1700000000000,
      chat_id: '12345',
      message_id: '99',
      source: 'user',
      user_id: '777',
      user_name: 'mirza',
      text: 'halo',
      attachments: null,
      reply_to: null,
      metadata: null,
    })
    store.close()
  })
})

describe('messages-store: logInbound full payload', () => {
  test('persists attachments JSON and reply_to', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    store.logInbound({
      ts: 1700000000000,
      chat_id: '12345',
      message_id: '100',
      user_id: '777',
      user_name: 'mirza',
      text: 'lihat ini',
      attachments: [
        { type: 'photo', path: '/inbox/abc.jpg', file_id: 'AgAC' },
      ],
      reply_to: '88',
      metadata: { format: 'plain' },
    })

    const row = store._dbForTest()
      .query('SELECT * FROM messages WHERE message_id = ?')
      .get('100') as any
    expect(row.reply_to).toBe('88')
    expect(JSON.parse(row.attachments)).toEqual([
      { type: 'photo', path: '/inbox/abc.jpg', file_id: 'AgAC' },
    ])
    expect(JSON.parse(row.metadata)).toEqual({ format: 'plain' })
    store.close()
  })

  test('attachments empty array stored as JSON not NULL', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()
    store.logInbound({
      ts: 1700000000001,
      chat_id: '12345',
      attachments: [],
    })
    const row = store._dbForTest()
      .query('SELECT attachments FROM messages WHERE ts = 1700000000001')
      .get() as any
    expect(row.attachments).toBe('[]')
    store.close()
  })
})

describe('messages-store: logOutbound', () => {
  test('persists outbound with source=assistant', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    store.logOutbound({
      ts: 1700000001000,
      chat_id: '12345',
      message_id: '101',
      source: 'assistant',
      text: 'oke siap',
    })

    const row = store._dbForTest()
      .query('SELECT * FROM messages WHERE message_id = ?')
      .get('101') as any
    expect(row).toMatchObject({
      source: 'assistant',
      chat_id: '12345',
      text: 'oke siap',
      user_id: null,
      user_name: null,
    })
    store.close()
  })
})

describe('messages-store: logOutbound system source', () => {
  test('persists system source with triggered_by metadata', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    store.logOutbound({
      ts: 1700000002000,
      chat_id: '12345',
      message_id: '102',
      source: 'system',
      text: 'reminder: minum air',
      metadata: { triggered_by: 'cron:hydration' },
    })

    const row = store._dbForTest()
      .query('SELECT source, metadata FROM messages WHERE message_id = ?')
      .get('102') as any
    expect(row.source).toBe('system')
    expect(JSON.parse(row.metadata)).toEqual({ triggered_by: 'cron:hydration' })
    store.close()
  })
})

describe('messages-store: logEdit', () => {
  test('appends new row with metadata.edited_of, original untouched', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    // Original outbound
    store.logOutbound({
      ts: 1700000003000,
      chat_id: '12345',
      message_id: '200',
      source: 'assistant',
      text: 'masih proses...',
    })

    // Edit (Telegram returns same message_id for edits)
    store.logEdit({
      ts: 1700000003500,
      chat_id: '12345',
      message_id: '200',
      edited_of: '200',
      text: 'selesai!',
    })

    const rows = store._dbForTest()
      .query('SELECT * FROM messages WHERE message_id = ? ORDER BY ts')
      .all('200') as any[]
    expect(rows).toHaveLength(2)
    expect(rows[0].text).toBe('masih proses...')
    expect(rows[0].metadata).toBeNull()
    expect(rows[1].text).toBe('selesai!')
    expect(JSON.parse(rows[1].metadata)).toMatchObject({ edited_of: '200' })
    expect(rows[1].source).toBe('assistant') // default for edit
    store.close()
  })

  test('logEdit preserves caller-supplied metadata + adds edited_of', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()
    store.logEdit({
      ts: 1700000004000,
      chat_id: '12345',
      message_id: '201',
      edited_of: '201',
      text: 'updated',
      metadata: { format: 'markdown' },
    })
    const row = store._dbForTest()
      .query('SELECT metadata FROM messages WHERE ts = 1700000004000')
      .get() as any
    expect(JSON.parse(row.metadata)).toEqual({
      format: 'markdown',
      edited_of: '201',
    })
    store.close()
  })
})

describe('messages-store: failure isolation', () => {
  test('init failure → store falls back to no-op, methods do not throw', () => {
    // Force init failure with a path that's invalid on both OSes:
    // - Windows: 'CON' is a reserved device name, can't create file
    // - POSIX: /dev/null is a character device, can't have subdirectory
    const badPath = process.platform === 'win32' ? 'CON' : '/dev/null/x.db'
    const store = createMessagesStore({ dbPath: badPath })
    const stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true)
    expect(() => store.init()).not.toThrow()

    // All methods should be silent no-op after failed init
    expect(() => store.logInbound({ ts: 1, chat_id: 'x' })).not.toThrow()
    expect(() => store.logOutbound({ ts: 1, chat_id: 'x', source: 'assistant' })).not.toThrow()
    expect(() => store.logEdit({ ts: 1, chat_id: 'x', message_id: 'y', edited_of: 'y' })).not.toThrow()
    expect(() => store.close()).not.toThrow()

    // Init failure should be logged once to stderr
    expect(stderrSpy).toHaveBeenCalled()
    const writes = stderrSpy.mock.calls.map(c => String(c[0]))
    expect(writes.some(w => w.includes('messages-store') && w.includes('init failed'))).toBe(true)
    stderrSpy.mockRestore()
  })

  test('write failure → stderr warning, no throw, normal flow continues', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()
    // Drop the table to force write failure
    store._dbForTest().exec('DROP TABLE messages')

    const stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true)
    expect(() => store.logInbound({ ts: 1, chat_id: 'x', text: 'hi' })).not.toThrow()
    const writes = stderrSpy.mock.calls.map(c => String(c[0]))
    expect(writes.some(w => w.includes('messages-store') && w.includes('write failed'))).toBe(true)
    stderrSpy.mockRestore()
    store.close()
  })
})
