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
