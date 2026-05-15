import { test, expect, describe } from 'bun:test'
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
