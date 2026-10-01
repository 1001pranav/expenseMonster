import * as SQLite from 'expo-sqlite';
import { getDatabaseKey } from '@/services/secure';
import { MIGRATIONS } from './schema';

const DB_NAME = 'expensemonster.db';
let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) throw new Error('Database not opened yet');
  return db;
}

/**
 * Opens the SQLCipher-encrypted database. `PRAGMA key` must be the first statement;
 * the key lives only in the Android Keystore / iOS Keychain.
 */
export async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  const key = await getDatabaseKey();
  const conn = await SQLite.openDatabaseAsync(DB_NAME);
  await conn.execAsync(`PRAGMA key = "x'${key}'";`);
  await conn.execAsync('PRAGMA journal_mode = WAL;');
  await migrate(conn);
  db = conn;
  return conn;
}

async function migrate(conn: SQLite.SQLiteDatabase) {
  const row = await conn.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    await conn.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(sql);
    });
    version += 1;
    await conn.execAsync(`PRAGMA user_version = ${version};`);
  }
}

/** Irreversibly delete the database file (used by "Erase all data"). */
export async function destroyDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
  }
  await SQLite.deleteDatabaseAsync(DB_NAME);
}
