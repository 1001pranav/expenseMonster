/**
 * Two phones syncing through a fake server that follows the same rules as
 * supabase/migrations/20261010000000_emx_records.sql (shared seq, compare-and-swap on the base seq,
 * write token). Each phone gets its own copy of the services and its own in-memory "database".
 */
import { newKey } from '@/domain/sync/crypto';
import type { ConflictPolicy } from '@/domain/sync/merge';
import type { BaseRow, TableName } from '@/domain/types';
import { DEFAULT_SETTINGS, EMPTY_TABLES } from '@/db/store';
import { txn } from '../../domain/__tests__/fixtures';

type Row = BaseRow & Record<string, unknown>;

let tick = 0;
const nextTime = () => new Date(Date.UTC(2026, 0, 1) + ++tick * 1000).toISOString();

// ── fake server ────────────────────────────────────────────────────────────

const server = {
  spaces: new Map<string, { token: string; head: number }>(),
  records: new Map<string, Map<string, { seq: number; payload: string }>>(),
  calls: [] as string[],
  offline: false,
  reset() {
    this.offline = false;
    this.spaces.clear();
    this.records.clear();
    this.calls = [];
  },
  check(space: string, token: string) {
    const s = this.spaces.get(space);
    if (s && s.token !== token) throw new Error('Not allowed');
    return s?.head ?? 0;
  },
  handle(fn: string, a: Record<string, never>): unknown {
    this.calls.push(fn);
    if (fn === 'emx_space_head') return this.check(a.p_space, a.p_token);
    if (fn === 'emx_records_pull') {
      this.check(a.p_space, a.p_token);
      return [...(this.records.get(a.p_space) ?? new Map()).entries()]
        .map(([record_key, r]) => ({ record_key, seq: r.seq, payload: r.payload }))
        .filter((r) => r.seq > a.p_after)
        .sort((x, y) => x.seq - y.seq)
        .slice(0, a.p_limit);
    }
    if (fn === 'emx_records_push') {
      if (!this.spaces.has(a.p_space)) this.spaces.set(a.p_space, { token: a.p_token, head: 0 });
      const space = this.spaces.get(a.p_space)!;
      if (space.token !== a.p_token) throw new Error('Not allowed');
      const recs = this.records.get(a.p_space) ?? new Map();
      this.records.set(a.p_space, recs);
      const applied: { k: string; s: number }[] = [];
      const conflicts: string[] = [];
      for (const r of a.p_records as { k: string; b: number; p: string }[]) {
        const current = recs.get(r.k);
        if (current && current.seq !== r.b) {
          conflicts.push(r.k);
          continue;
        }
        space.head++;
        recs.set(r.k, { seq: space.head, payload: r.p });
        applied.push({ k: r.k, s: space.head });
      }
      return { head: space.head, applied, conflicts };
    }
    throw new Error(`unknown function ${fn}`);
  },
};

globalThis.fetch = (async (url: string, init: { body: string }) => {
  const fn = url.split('/rpc/')[1];
  // What fetch does with no network.
  if (server.offline) throw new TypeError('Network request failed');
  try {
    const body = server.handle(fn, JSON.parse(init.body));
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
  } catch (e) {
    const body = JSON.stringify({ code: 'P0001', message: (e as Error).message });
    return { ok: false, status: 400, headers: { get: () => null }, json: async () => JSON.parse(body), text: async () => body };
  }
}) as unknown as typeof fetch;

// ── a phone ────────────────────────────────────────────────────────────────

function fakeRepo(db: { tables: Map<string, Map<string, Row>>; marks: Map<string, { seq: number; updatedAt: string }>; meta: Map<string, string> }, device: string) {
  const table = (t: string) => db.tables.get(t) ?? db.tables.set(t, new Map()).get(t)!;
  const markKey = (space: string, t: string, id: string) => `${space}|${t}|${id}`;
  return {
    dirtyRows: async (space: string, t: TableName, afterId: string, limit: number) =>
      [...table(t).values()]
        .filter((r) => r.scope === 'household' && r.id > afterId)
        .filter((r) => db.marks.get(markKey(space, t, r.id))?.updatedAt !== r.updatedAt)
        .sort((x, y) => (x.id < y.id ? -1 : 1))
        .slice(0, limit)
        .map((r) => ({ row: { ...r }, base: db.marks.get(markKey(space, t, r.id))?.seq ?? 0 })),
    getSyncMarks: async (space: string, t: string, ids: string[]) =>
      new Map(ids.filter((id) => db.marks.has(markKey(space, t, id))).map((id) => [id, db.marks.get(markKey(space, t, id))!])),
    setSyncMarks: async (space: string, marks: { table: string; id: string; seq: number; updatedAt: string }[]) => {
      for (const m of marks) db.marks.set(markKey(space, m.table, m.id), { seq: m.seq, updatedAt: m.updatedAt });
    },
    rowsByIds: async (t: string, ids: string[]) => new Map(ids.filter((id) => table(t).has(id)).map((id) => [id, { ...table(t).get(id)! }])),
    applyRemote: async (t: string, rows: Row[]) => rows.forEach((r) => table(t).set(r.id, { ...r })),
    update: async (t: string, id: string, patch: Partial<Row>) => {
      const row = { ...table(t).get(id)!, ...patch, updatedAt: nextTime(), deviceId: device };
      table(t).set(id, row);
      return row;
    },
    getMeta: async (k: string) => db.meta.get(k) ?? null,
    setMeta: async (k: string, v: string | null) => void (v === null ? db.meta.delete(k) : db.meta.set(k, v)),
    listPeers: async () => [],
    allRows: async (t: string) => [...table(t).values()],
    loadTables: async () => EMPTY_TABLES,
    saveIdentity: async () => {},
    upsertPeer: async () => {},
  };
}

function makePhone(device: string, key: Uint8Array, policy: ConflictPolicy) {
  const db = { tables: new Map<string, Map<string, Row>>(), marks: new Map(), meta: new Map<string, string>() };
  const repo = fakeRepo(db, device);
  let cloud!: typeof import('../cloud');
  let sync!: typeof import('../sync');
  jest.isolateModules(() => {
    jest.doMock('expo-sharing', () => ({}));
    jest.doMock('expo-file-system', () => ({ File: class {}, Paths: {} }));
    jest.doMock('@/config/supabase', () => ({ SUPABASE: { url: 'https://test.supabase.co', anonKey: 'sb_publishable_test' } }));
    jest.doMock('../diagnostics', () => ({ logFailure: jest.fn(), logWarn: jest.fn(), logInfo: jest.fn(), logError: jest.fn() }));
    jest.doMock('../files', () => ({ writeCacheFile: jest.fn() }));
    jest.doMock('../secure', () => ({ getHouseholdKey: async () => key, setHouseholdKey: async () => {} }));
    jest.doMock('@/db/repo', () => repo);
    /* eslint-disable @typescript-eslint/no-require-imports -- each phone needs its own module instances */
    cloud = require('../cloud');
    sync = require('../sync');
    const { getState } = require('@/db/store');
    /* eslint-enable @typescript-eslint/no-require-imports */
    getState().setAll(EMPTY_TABLES, { deviceId: device, deviceName: device, householdId: 'house', householdName: 'Home', selfMemberId: '', onboarded: true }, { ...DEFAULT_SETTINGS, cloudSync: true, syncConflictPolicy: policy });
  });
  const txns = () => db.tables.get('transactions') ?? db.tables.set('transactions', new Map()).get('transactions')!;
  return {
    sync: () => cloud.cloudSyncNow(),
    /** What the app does after an edit (the 10 s timer is not awaited here). */
    edited: () => cloud.cloudSyncSoon(60_000),
    check: () => cloud.cloudPullNow(),
    add: (over: Partial<Row>) => {
      const row = txn({ updatedAt: nextTime(), deviceId: device, ...over }) as unknown as Row;
      txns().set(row.id, row);
      return row;
    },
    edit: (id: string, patch: Partial<Row>) => repo.update('transactions', id, patch),
    get: (id: string) => txns().get(id),
    conflicts: () => sync.loadConflicts(),
    resolve: (keys: string[], choice: 'mine' | 'theirs') => sync.resolveConflicts(keys, choice),
  };
}

const records = () => [...server.records.values()][0] ?? new Map();

describe('per-record cloud sync between two phones', () => {
  let key: Uint8Array;
  afterEach(() => jest.clearAllTimers());
  beforeEach(() => {
    server.reset();
    key = newKey();
  });

  it('sends each record once and pulls only what is new', async () => {
    const a = makePhone('A', key, 'ask');
    const b = makePhone('B', key, 'ask');
    const r1 = a.add({ amount: 100 });
    a.add({ amount: 200 });
    expect((await a.sync()).sent).toBe(2);
    // Its own uploads are not downloaded again.
    server.calls = [];
    expect(await a.check()).toBeNull();
    expect(server.calls).toEqual(['emx_space_head']);

    const got = await b.sync();
    expect(got).toMatchObject({ received: 2, sent: 0 });
    expect(b.get(r1.id)?.amount).toBe(100);
    // B uploaded nothing back: no echo of what it received.
    expect(records().size).toBe(2);
    expect(Math.max(...[...records().values()].map((r) => r.seq))).toBe(2);

    // Nothing changed: the 30 s check costs one head request and no download.
    server.calls = [];
    expect(await b.check()).toBeNull();
    expect(server.calls).toEqual(['emx_space_head']);
    expect((await a.sync()).sent).toBe(0);
  });

  it('applies an edit made on the other phone, whatever the clocks say', async () => {
    const a = makePhone('A', key, 'newest');
    const b = makePhone('B', key, 'newest');
    const r1 = a.add({ amount: 100 });
    await a.sync();
    await b.sync();
    // B's edit carries an *older* timestamp (wrong clock): it is still the newer version.
    await b.edit(r1.id, { amount: 150, updatedAt: '2020-01-01T00:00:00.000Z' });
    b.get(r1.id)!.updatedAt = '2020-01-01T00:00:00.000Z';
    await b.sync();
    expect((await a.check())?.received).toBe(1);
    expect(a.get(r1.id)?.amount).toBe(150);
  });

  it('detects edits on both phones and lets "newest edit" pick one, ending identical', async () => {
    const a = makePhone('A', key, 'newest');
    const b = makePhone('B', key, 'newest');
    const r1 = a.add({ amount: 100 });
    await a.sync();
    await b.sync();
    await a.edit(r1.id, { amount: 111 }); // offline on A
    await b.edit(r1.id, { amount: 222 }); // later, offline on B
    await a.sync(); // A's edit reaches the server first
    await b.sync(); // B sees the conflict, its edit is newer: kept and pushed on top
    await a.sync();
    expect(a.get(r1.id)?.amount).toBe(222);
    expect(b.get(r1.id)?.amount).toBe(222);
  });

  it('with "ask me", holds the conflict back until the user picks, then syncs the choice', async () => {
    const a = makePhone('A', key, 'ask');
    const b = makePhone('B', key, 'ask');
    const r1 = a.add({ amount: 100 });
    await a.sync();
    await b.sync();
    await a.edit(r1.id, { amount: 111 });
    await b.edit(r1.id, { amount: 222 });
    await a.sync();
    expect((await b.sync()).pendingConflicts).toBe(1);
    // Nothing overwritten while waiting: B still shows its edit, the server still has A's.
    expect(b.get(r1.id)?.amount).toBe(222);
    await a.sync();
    expect(a.get(r1.id)?.amount).toBe(111);

    await b.resolve([`transactions:${r1.id}`], 'mine');
    await b.sync();
    await a.sync();
    expect(a.get(r1.id)?.amount).toBe(222);
    expect(await b.conflicts()).toHaveLength(0);
  });

  it('syncs deletions and never uploads private entries', async () => {
    const a = makePhone('A', key, 'ask');
    const b = makePhone('B', key, 'ask');
    const r1 = a.add({ amount: 100 });
    a.add({ amount: 999, scope: 'personal' });
    await a.sync();
    expect(records().size).toBe(1);
    await b.sync();
    await a.edit(r1.id, { deletedAt: nextTime() });
    await a.sync();
    await b.sync();
    expect(b.get(r1.id)?.deletedAt).toBeTruthy();
  });

  it('uploads entries made offline as soon as the network is back, on the next 30 s check', async () => {
    const a = makePhone('A', key, 'ask');
    const b = makePhone('B', key, 'ask');
    await a.sync();
    await b.sync();
    // Phone A: no network. The entry is saved locally and the sync after it fails.
    server.offline = true;
    const r1 = a.add({ amount: 300 });
    a.edited();
    await expect(a.sync()).rejects.toThrow("Can't reach the cloud server");
    // Back online, no new edit, app still open: the periodic check uploads it.
    server.offline = false;
    expect((await a.check())?.sent).toBe(1);
    await b.check();
    expect(b.get(r1.id)?.amount).toBe(300);
    // Once everything went out, the check is back to a single cheap request.
    server.calls = [];
    expect(await a.check()).toBeNull();
    expect(server.calls).toEqual(['emx_space_head']);
  });

  it('keeps other households out', async () => {
    const a = makePhone('A', key, 'ask');
    a.add({ amount: 100 });
    await a.sync();
    const stranger = makePhone('X', newKey(), 'ask');
    stranger.add({ amount: 5 });
    await stranger.sync();
    // A different key means a different space: nothing crosses over.
    expect(server.spaces.size).toBe(2);
    expect((await a.sync()).received).toBe(0);
  });
});
