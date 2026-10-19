/**
 * The database queue (db/client.ts) against a fake expo-sqlite that logs every native call and
 * how many statements are alive at once.
 */
import { getDb, openDatabase } from '../client';

// jest.mock factories may only use variables named mock*.
const mock = { log: [] as string[], inFlight: 0, maxInFlight: 0 };
const mockTick = () => new Promise((r) => setTimeout(r, 1));

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: async () => ({
    execAsync: async (sql: string) => {
      mock.log.push(sql.split(' ')[0]);
      await mockTick();
    },
    prepareAsync: async (sql: string) => {
      mock.inFlight++;
      mock.maxInFlight = Math.max(mock.maxInFlight, mock.inFlight);
      await mockTick();
      return {
        executeAsync: async () => {
          if (sql.includes('FAIL')) throw new Error('boom');
          mock.log.push(sql);
          await mockTick();
          return { getAllAsync: async () => [{ user_version: 99 }], getFirstAsync: async () => ({ user_version: 99 }) };
        },
        finalizeAsync: async () => {
          await mockTick();
          mock.inFlight--;
        },
      };
    },
    closeAsync: async () => {},
  }),
  deleteDatabaseAsync: async () => {},
}));
jest.mock('@/services/secure', () => ({ getDatabaseKey: async () => 'ab' }));


describe('database queue', () => {
  beforeAll(async () => {
    await openDatabase();
  });
  beforeEach(() => {
    mock.log.length = 0;
    mock.maxInFlight = 0;
  });

  it('runs one statement at a time, finalizing each before the next starts', async () => {
    const db = getDb();
    await Promise.all([db.runAsync('W1'), db.getAllAsync('R1'), db.runAsync('W2'), db.getFirstAsync('R2')]);
    expect(mock.log).toEqual(['W1', 'R1', 'W2', 'R2']);
    expect(mock.maxInFlight).toBe(1);
  });

  it('gives a transaction the database to itself: queries asked for meanwhile run after COMMIT', async () => {
    const db = getDb();
    const tx = db.transaction(async (t) => {
      await t.runAsync('T1');
      await mockTick();
      await t.runAsync('T2');
    });
    const outside = db.runAsync('OUTSIDE');
    const second = db.transaction((t) => t.runManyAsync('M', [[1], [2]]));
    await Promise.all([tx, outside, second]);
    expect(mock.log).toEqual(['BEGIN', 'T1', 'T2', 'COMMIT', 'OUTSIDE', 'BEGIN', 'M', 'M', 'COMMIT']);
  });

  it('a failed transaction rolls back only itself and the queue keeps going', async () => {
    const db = getDb();
    const bad = db.transaction((t) => t.runAsync('FAIL'));
    const after = db.runAsync('AFTER');
    await expect(bad).rejects.toThrow('boom');
    await after;
    expect(mock.log).toEqual(['BEGIN', 'ROLLBACK', 'AFTER']);
    expect(mock.maxInFlight).toBe(1);
  });
});
