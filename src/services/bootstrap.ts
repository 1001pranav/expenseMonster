import { setClockOffset } from '@/domain/clock';
import { uuidv7 } from '@/domain/ids';
import { newKey } from '@/domain/sync/crypto';
import { openDatabase } from '@/db/client';
import { adoptForwardData, getMeta, insertMany, pruneHistory, loadIdentity, loadSettings, loadTables, saveIdentity, setMeta } from '@/db/repo';
import { SEED_CATEGORIES } from '@/db/seed';
import { getState } from '@/db/store';
import { generateFixedBills } from '@/data/actions';
import { CLOCK_META } from './cloud';
import { getHouseholdKey, setHouseholdKey } from './secure';

/** Open the encrypted DB, create this device's identity on first run, seed categories, load everything into memory. */
export async function bootstrap(): Promise<void> {
  await openDatabase();
  // Last known server clock correction (services/cloud.ts), before anything is stamped.
  setClockOffset(Number((await getMeta(CLOCK_META)) ?? 0));
  // After an update: apply family data that arrived before this version could show it.
  await adoptForwardData();
  // Versions replaced by other phones' edits, kept so the household head can undo them (services/holds.ts).
  await pruneHistory(90);
  let identity = await loadIdentity();

  if (!identity.deviceId) {
    identity = {
      deviceId: uuidv7(),
      deviceName: 'My phone',
      householdId: uuidv7(),
      householdName: 'Our home',
      selfMemberId: '',
      onboarded: false,
    };
    await saveIdentity(identity);
  }
  if (!(await getHouseholdKey())) await setHouseholdKey(newKey());

  const settings = await loadSettings();
  const tables = await loadTables();
  getState().setAll(tables, identity, settings);

  if ((await getMeta('seeded')) !== '1') {
    const existing = new Set(tables.categories.map((c) => c.id));
    await insertMany(
      'categories',
      SEED_CATEGORIES.filter((c) => !existing.has(c.id)).map((c, i) => ({
        ...c,
        parentId: null,
        sortOrder: i,
        scope: 'household' as const,
        // A fixed timestamp so seeded rows never "win" over a renamed category from another phone.
        createdAt: '2000-01-01T00:00:00.000Z',
        updatedAt: '2000-01-01T00:00:00.000Z',
        deviceId: 'seed',
      })),
    );
    await setMeta('seeded', '1');
  }

  await generateFixedBills();
}
