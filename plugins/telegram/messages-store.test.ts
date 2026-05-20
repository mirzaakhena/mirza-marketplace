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

describe('messages-store: album logging shape', () => {
  test('logInbound with multi-attachment + media_group_id metadata roundtrips', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    store.logInbound({
      ts: 1700000000000,
      chat_id: 'CHAT1',
      message_id: '101',
      user_id: 'U1',
      user_name: 'alice',
      text: 'check this',
      attachments: [
        { type: 'photo', path: '/inbox/a.jpg' },
        { type: 'photo', path: '/inbox/b.jpg' },
        { type: 'document', file_id: 'DOC1', name: 'foo.pdf', mime: 'application/pdf', size: 12345 },
      ],
      metadata: {
        media_group_id: 'MG_ABC',
        message_ids: ['101', '102', '103'],
      },
    })

    const db = store._dbForTest()
    const rows = db.query('SELECT attachments, metadata FROM messages WHERE chat_id = ?').all('CHAT1') as Array<{ attachments: string; metadata: string }>
    expect(rows).toHaveLength(1)

    const att = JSON.parse(rows[0].attachments)
    expect(att).toHaveLength(3)
    expect(att[0]).toEqual({ type: 'photo', path: '/inbox/a.jpg' })
    expect(att[2]).toEqual({ type: 'document', file_id: 'DOC1', name: 'foo.pdf', mime: 'application/pdf', size: 12345 })

    const meta = JSON.parse(rows[0].metadata)
    expect(meta.media_group_id).toBe('MG_ABC')
    expect(meta.message_ids).toEqual(['101', '102', '103'])

    store.close()
  })

  test('logInbound with empty attachments array stores null (no rows lost)', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    store.logInbound({
      ts: 1700000000001,
      chat_id: 'CHAT2',
      message_id: '201',
      user_id: 'U2',
      user_name: 'bob',
      text: 'no attachments',
    })

    const db = store._dbForTest()
    const rows = db.query('SELECT attachments FROM messages WHERE chat_id = ?').all('CHAT2') as Array<{ attachments: string | null }>
    expect(rows).toHaveLength(1)
    expect(rows[0].attachments).toBeNull()

    store.close()
  })
})

describe('messages-store: logInbound quote_text', () => {
  test('quote_text + quote_is_manual round-trip through metadata column', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    store.logInbound({
      ts: 1700000005000,
      chat_id: 'CHAT_Q',
      message_id: '301',
      user_id: 'U_Q',
      user_name: 'mirza',
      text: 'Ini..',
      reply_to: '300',
      quote_text: 'bagian yang dipilih user',
      quote_is_manual: true,
    })

    const row = store._dbForTest()
      .query('SELECT metadata FROM messages WHERE message_id = ?')
      .get('301') as any
    expect(JSON.parse(row.metadata)).toEqual({
      quote_text: 'bagian yang dipilih user',
      quote_is_manual: true,
    })
    store.close()
  })

  test('quote fields merge with caller-supplied metadata (album case)', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    store.logInbound({
      ts: 1700000005001,
      chat_id: 'CHAT_Q',
      message_id: '302',
      text: 'reply to album',
      quote_text: 'caption album asal',
      quote_is_manual: false,
      metadata: {
        media_group_id: 'MG_X',
        message_ids: ['302', '303'],
      },
    })

    const row = store._dbForTest()
      .query('SELECT metadata FROM messages WHERE message_id = ?')
      .get('302') as any
    expect(JSON.parse(row.metadata)).toEqual({
      media_group_id: 'MG_X',
      message_ids: ['302', '303'],
      quote_text: 'caption album asal',
      quote_is_manual: false,
    })
    store.close()
  })

  test('quote_text omitted → no quote keys in metadata', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    store.logInbound({
      ts: 1700000005002,
      chat_id: 'CHAT_Q',
      message_id: '303',
      text: 'plain reply, no quote captured',
      reply_to: '300',
    })

    const row = store._dbForTest()
      .query('SELECT metadata FROM messages WHERE message_id = ?')
      .get('303') as any
    expect(row.metadata).toBeNull()
    store.close()
  })
})

describe('messages-store: getMessage', () => {
  test('direct hit returns user message with parsed attachments + metadata', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    store.logInbound({
      ts: 1700000010000,
      chat_id: 'CHAT_G',
      message_id: '500',
      user_id: 'U500',
      user_name: 'mirza',
      text: 'pesan dengan foto',
      attachments: [{ type: 'photo', path: '/inbox/x.jpg' }],
      reply_to: '499',
      quote_text: 'sebelumnya',
      quote_is_manual: true,
    })

    const row = store.getMessage('CHAT_G', '500')
    expect(row).not.toBeNull()
    expect(row).toMatchObject({
      chat_id: 'CHAT_G',
      message_id: '500',
      source: 'user',
      ts: 1700000010000,
      text: 'pesan dengan foto',
      reply_to: '499',
      user_id: 'U500',
      user_name: 'mirza',
    })
    expect(row!.attachments).toEqual([{ type: 'photo', path: '/inbox/x.jpg' }])
    expect(row!.metadata).toEqual({ quote_text: 'sebelumnya', quote_is_manual: true })
    store.close()
  })

  test('direct hit returns assistant message', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    store.logOutbound({
      ts: 1700000011000,
      chat_id: 'CHAT_G',
      message_id: '501',
      source: 'assistant',
      text: 'jawaban dari bot',
    })

    const row = store.getMessage('CHAT_G', '501')
    expect(row).not.toBeNull()
    expect(row).toMatchObject({
      message_id: '501',
      source: 'assistant',
      text: 'jawaban dari bot',
      user_id: null,
      user_name: null,
    })
    store.close()
  })

  test('album reply to first item → direct hit succeeds', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    store.logInbound({
      ts: 1700000012000,
      chat_id: 'CHAT_G',
      message_id: '600', // first item
      text: 'caption album',
      attachments: [
        { type: 'photo', path: '/inbox/a.jpg' },
        { type: 'photo', path: '/inbox/b.jpg' },
      ],
      metadata: {
        media_group_id: 'MG_600',
        message_ids: ['600', '601', '602'],
      },
    })

    const row = store.getMessage('CHAT_G', '600')
    expect(row).not.toBeNull()
    expect(row!.attachments).toHaveLength(2)
    expect((row!.metadata as any).message_ids).toEqual(['600', '601', '602'])
    store.close()
  })

  test('album reply to non-first item → fallback finds the same row', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    store.logInbound({
      ts: 1700000013000,
      chat_id: 'CHAT_G',
      message_id: '700', // first item
      text: 'caption album',
      attachments: [
        { type: 'photo', path: '/inbox/c.jpg' },
        { type: 'photo', path: '/inbox/d.jpg' },
        { type: 'photo', path: '/inbox/e.jpg' },
      ],
      metadata: {
        media_group_id: 'MG_700',
        message_ids: ['700', '701', '702'],
      },
    })

    // User quoted item #2 (msgid 701). Fallback should find the album row.
    const row = store.getMessage('CHAT_G', '701')
    expect(row).not.toBeNull()
    expect(row!.message_id).toBe('700') // still the first-item key
    expect(row!.attachments).toHaveLength(3)
    expect((row!.metadata as any).message_ids).toContain('701')
    store.close()
  })

  test('not found → returns null', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()
    expect(store.getMessage('CHAT_G', '9999')).toBeNull()
    store.close()
  })

  test('cross-chat isolation: same message_id in different chat → not returned', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    store.logInbound({
      ts: 1700000014000,
      chat_id: 'CHAT_A',
      message_id: '800',
      text: 'pesan di chat A',
    })

    expect(store.getMessage('CHAT_B', '800')).toBeNull()
    store.close()
  })

  test('LIKE false-positive guard: substring of unrelated metadata value does not match', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    // Row 1 has metadata containing the string "999" but inside an
    // unrelated field — must NOT be returned when looking up message_id 999.
    store.logInbound({
      ts: 1700000015000,
      chat_id: 'CHAT_G',
      message_id: '900',
      text: 'unrelated',
      metadata: { some_field: 'value containing 999 substring' },
    })

    expect(store.getMessage('CHAT_G', '999')).toBeNull()
    store.close()
  })

  test('multi-row safety: when duplicate (chat_id, message_id) exist, returns latest by ts', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    store.logInbound({ ts: 1700000016000, chat_id: 'CHAT_G', message_id: '1000', text: 'older' })
    store.logInbound({ ts: 1700000017000, chat_id: 'CHAT_G', message_id: '1000', text: 'newer' })

    const row = store.getMessage('CHAT_G', '1000')
    expect(row!.text).toBe('newer')
    store.close()
  })

  test('returns null when store disabled', () => {
    const original = process.env.TELEGRAM_DISABLE_MESSAGES_STORE
    process.env.TELEGRAM_DISABLE_MESSAGES_STORE = '1'
    try {
      const store = createMessagesStore({ dbPath: ':memory:' })
      store.init()
      expect(store.getMessage('CHAT_G', '1000')).toBeNull()
    } finally {
      if (original === undefined) delete process.env.TELEGRAM_DISABLE_MESSAGES_STORE
      else process.env.TELEGRAM_DISABLE_MESSAGES_STORE = original
    }
  })
})

describe('messages-store: disable via env var', () => {
  test('TELEGRAM_DISABLE_MESSAGES_STORE=1 → init is no-op, methods silent', () => {
    const original = process.env.TELEGRAM_DISABLE_MESSAGES_STORE
    process.env.TELEGRAM_DISABLE_MESSAGES_STORE = '1'
    try {
      const store = createMessagesStore({ dbPath: ':memory:' })
      store.init()
      expect(() => store.logInbound({ ts: 1, chat_id: 'x', text: 'hi' })).not.toThrow()
      // _dbForTest should throw because db was never opened
      expect(() => store._dbForTest()).toThrow()
    } finally {
      if (original === undefined) delete process.env.TELEGRAM_DISABLE_MESSAGES_STORE
      else process.env.TELEGRAM_DISABLE_MESSAGES_STORE = original
    }
  })
})
