import * as SQLite from 'expo-sqlite';
import { getDatabaseKey } from '@/services/secure';
import { MIGRATIONS } from './schema';

const DB_NAME = 'expensemonster.db';
let conn: SQLite.SQLiteDatabase | null = null;

type Params = SQLite.SQLiteBindParams;

/** Queries usable inside a transaction (and, queued, outside one). */
export interface Queries {
  getAllAsync<T>(sql: string, params?: Params): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: Params): Promise<T | null>;
  runAsync(sql: string, params?: Params): Promise<void>;
  /** One prepared statement run once per parameter list. */
  runManyAsync(sql: string, rows: Params[]): Promise<void>;
}

export interface Db extends Queries {
  /**
   * Runs `task` as one transaction with the database to itself: nothing else runs until it commits
   * or rolls back. Inside, use only `tx` — a getDb() call there would wait for the transaction
   * that is waiting for it.
   */
  transaction(task: (tx: Queries) => Promise<void>): Promise<void>;
}

/*
 * Why every query goes through one queue:
 * - expo-sqlite's withTransactionAsync is a plain BEGIN/COMMIT on the shared connection. Two at
 *   once (sync, backup and a save when the app comes back) make the second BEGIN fail, and its
 *   ROLLBACK undoes the first one's writes.
 * - Each query is a native statement object. Android frees one when its JavaScript handle is
 *   garbage-collected, even if a native call on it is still running on another thread; the GC runs
 *   hardest right after the app returns from the background. Statements are therefore kept
 *   referenced until finalized, and only one is in flight at a time.
 * SQLite serialises access to the one connection anyway, so the queue costs no throughput.
 */
let lane: Promise<unknown> = Promise.resolve();
const live = new Set<SQLite.SQLiteStatement>();

function queued<T>(work: () => Promise<T>): Promise<T> {
  const run = lane.then(work);
  lane = run.catch(() => {});
  return run;
}

async function withStatement<T>(c: SQLite.SQLiteDatabase, sql: string, work: (s: SQLite.SQLiteStatement) => Promise<T>): Promise<T> {
  const statement = await c.prepareAsync(sql);
  live.add(statement);
  try {
    return await work(statement);
  } finally {
    try {
      await statement.finalizeAsync();
    } finally {
      live.delete(statement);
    }
  }
}

function direct(c: SQLite.SQLiteDatabase): Queries {
  return {
    getAllAsync: <T>(sql: string, params: Params = []) => withStatement(c, sql, async (s) => (await s.executeAsync<T>(params)).getAllAsync()),
    getFirstAsync: <T>(sql: string, params: Params = []) => withStatement(c, sql, async (s) => (await s.executeAsync<T>(params)).getFirstAsync()),
    runAsync: (sql: string, params: Params = []) => withStatement(c, sql, async (s) => void (await s.executeAsync(params))),
    runManyAsync: (sql: string, rows: Params[]) =>
      withStatement(c, sql, async (s) => {
        for (const params of rows) await s.executeAsync(params);
      }),
  };
}

let db: Db | null = null;

function wrap(c: SQLite.SQLiteDatabase): Db {
  const raw = direct(c);
  return {
    getAllAsync: (sql, params) => queued(() => raw.getAllAsync(sql, params)),
    getFirstAsync: (sql, params) => queued(() => raw.getFirstAsync(sql, params)),
    runAsync: (sql, params) => queued(() => raw.runAsync(sql, params)),
    runManyAsync: (sql, rows) => queued(() => raw.runManyAsync(sql, rows)),
    transaction: (task) =>
      queued(async () => {
        await c.execAsync('BEGIN');
        try {
          await task(raw);
          await c.execAsync('COMMIT');
        } catch (e) {
          await c.execAsync('ROLLBACK').catch(() => {});
          throw e;
        }
      }),
  };
}

export function getDb(): Db {
  if (!db) throw new Error('Database not opened yet');
  return db;
}

/**
 * Opens the SQLCipher-encrypted database. `PRAGMA key` must be the first statement;
 * the key lives only in the Android Keystore / iOS Keychain.
 */
let opening: Promise<Db> | null = null;

/** Concurrent callers (the app re-mounting while coming back from a share) share one open. */
export function openDatabase(): Promise<Db> {
  if (db) return Promise.resolve(db);
  opening ??= openOnce().finally(() => {
    opening = null;
  });
  return opening;
}

async function openOnce(): Promise<Db> {
  const key = await getDatabaseKey();
  const c = await SQLite.openDatabaseAsync(DB_NAME);
  await c.execAsync(`PRAGMA key = "x'${key}'";`);
  await c.execAsync('PRAGMA journal_mode = WAL;');
  await migrate(c);
  conn = c;
  db = wrap(c);
  return db;
}

async function migrate(conn: SQLite.SQLiteDatabase) {
  const row = await direct(conn).getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    // Runs before any other query, so a plain transaction is enough.
    await conn.withTransactionAsync(async () => {
      await conn.execAsync(sql);
    });
    version += 1;
    await conn.execAsync(`PRAGMA user_version = ${version};`);
  }
}

/** Irreversibly delete the database file (used by "Erase all data"). */
export async function destroyDatabase(): Promise<void> {
  if (conn) {
    // Let queued queries finish first; closing under them is what crashes.
    await queued(async () => {});
    db = null;
    await conn.closeAsync();
    conn = null;
  }
  await SQLite.deleteDatabaseAsync(DB_NAME);
}
