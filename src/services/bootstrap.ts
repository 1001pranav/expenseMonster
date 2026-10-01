import { uuidv7 } from '@/domain/ids';
import { newKey } from '@/domain/sync/crypto';
import { openDatabase } from '@/db/client';
import { getMeta, insertMany, loadIdentity, loadSettings, loadTables, saveIdentity, setMeta } from '@/db/repo';
import { SEED_CATEGORIES } from '@/db/seed';
import { getState } from '@/db/store';
import { generateFixedBills } from '@/data/actions';
import { getHouseholdKey, setHouseholdKey } from './secure';

/** Open the encrypted DB, create this device's identity on first run, seed categories, load everything into memory. */
export async function bootstrap(): Promise<void> {
  await openDatabase();
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
