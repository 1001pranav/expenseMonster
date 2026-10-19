import { newKey } from '@/domain/sync/crypto';
import { dayRange, isControlTable, isHeldBack, ruleFor, type ScreenContext } from '@/domain/sync/holds';
import { isNewer } from '@/domain/sync/merge';
import { invalidReason } from '@/domain/sync/validate';
import { uuidv7 } from '@/domain/ids';
import type { YMD } from '@/domain/dates';
import { SYNC_TABLES, type BaseRow, type HoldDecision, type HouseholdInfo, type SyncHold, type TableName } from '@/domain/types';
import {
  allRows,
  asideRecords,
  dropLocal,
  historyOf,
  forgetPeers,
  insert,
  loadTables,
  releaseAside,
  remove,
  rowsByIds,
  rowsSavedBy,
  saveIdentity,
  saveSettings,
  setAside,
  setLocalVersion,
  update,
} from '@/db/repo';
import { columnDefsOf } from '@/db/schema';
import { getState } from '@/db/store';
import { setHouseholdKey } from './secure';

/**
 * Household head and review (rules in domain/sync/holds.ts). Rows received from other phones are
 * screened as they arrive (services/sync.ts); this file applies the head's decisions to what is
 * already on the phone, and carries out the head's and the sending phone's actions.
 */

export const HOUSEHOLD_ID = 'household';

const isSyncTable = (t: string): t is TableName => (SYNC_TABLES as string[]).includes(t);

/** Why a row from another phone can't be stored, or null. */
export const invalidRow = (table: string, row: BaseRow) => (isSyncTable(table) ? invalidReason(table, row as never, columnDefsOf(table)) : null);

export async function loadScreenContext(): Promise<ScreenContext> {
  const household = (await allRows('household')).find((h) => h.id === HOUSEHOLD_ID && !h.deletedAt);
  const holds = (await allRows('sync_holds')).filter((h) => !h.deletedAt);
  return { household, holds, invalid: invalidRow };
}

const reloadStore = async () => getState().setAll(await loadTables(), getState().identity, getState().settings);

/**
 * Make what this phone shows follow the head's rules:
 * - rows set aside that are merged now (or whose rule was removed, or that an update made readable)
 *   are applied;
 * - rows from other phones already applied that a rule now holds are set aside, and the version
 *   they replaced is shown again (or the row is hidden, if it was new).
 * All on this phone only: nothing is uploaded, every phone does the same from the same rules.
 */
export async function reconcileHolds(): Promise<{ applied: number; setAside: number }> {
  const ctx = await loadScreenContext();
  const self = getState().identity.deviceId;
  let applied = 0;
  let aside = 0;
  for (const a of await asideRecords()) {
    // A damaged control record isn't applied later without the head's say: the next change re-sends it.
    if (!isSyncTable(a.tbl) || isControlTable(a.tbl) || ctx.invalid(a.tbl, a.row) || isHeldBack(a.tbl, a.row, ctx.holds)) continue;
    const local = (await rowsByIds(a.tbl, [a.row.id])).get(a.row.id);
    if (!local || isNewer(a.row, local)) {
      await setLocalVersion(a.tbl, a.row);
      applied++;
    }
    await releaseAside(a.tbl, a.row.id);
  }
  for (const h of ctx.holds) {
    if (h.decision === 'merge') continue;
    for (const table of SYNC_TABLES) {
      if (isControlTable(table) || (h.tbl && h.tbl !== table)) continue;
      for (const row of await rowsSavedBy(table, h.recordId ? { id: h.recordId } : { deviceId: h.holdDevice, since: h.since, until: h.until })) {
        // This phone's own edits stay on it: its user is asked what to do with them (ownHeld).
        if (row.deviceId === self || !isHeldBack(table, row, ctx.holds)) continue;
        await setAside([{ tbl: table, row, reason: 'held' }], true);
        const earlier = (await historyOf(table, row.id)).find((v) => v.updatedAt < row.updatedAt && !isHeldBack(table, v, ctx.holds));
        if (earlier) await setLocalVersion(table, earlier);
        else await dropLocal(table, row.id);
        aside++;
      }
    }
  }
  if (applied || aside) await reloadStore();
  return { applied, setAside: aside };
}

/** Publish this phone's name to the household, so the head can tell phones apart. */
export async function publishDevice(): Promise<void> {
  const { deviceId, deviceName } = getState().identity;
  if (!deviceId) return;
  const mine = getState().tables.devices.find((d) => d.id === deviceId);
  if (!mine) await insert('devices', { id: deviceId, name: deviceName, scope: 'household' } as never);
  else if (mine.name !== deviceName) await update('devices', deviceId, { name: deviceName });
}

// ── the head ─────────────────────────────────────────────────────────────

const household = () => getState().tables.household.find((h) => h.id === HOUSEHOLD_ID);
export const headDeviceId = () => household()?.headDeviceId ?? null;
export const isHead = () => headDeviceId() === getState().identity.deviceId;

function requireHead() {
  if (!isHead()) throw new Error('Only the household head can do this');
}

/** Take the head role when nobody has it. */
export async function claimHead(): Promise<void> {
  const h = household();
  if (h?.headDeviceId) throw new Error('This household already has a head');
  const self = getState().identity.deviceId;
  if (h) await update('household', HOUSEHOLD_ID, { headDeviceId: self });
  else await insert('household', { id: HOUSEHOLD_ID, headDeviceId: self, scope: 'household' } as never);
}

export async function handOverHead(deviceId: string): Promise<void> {
  requireHead();
  await update('household', HOUSEHOLD_ID, { headDeviceId: deviceId } as Partial<HouseholdInfo>);
}

/** Hold edits from one phone, saved on one local day (any phone when `deviceId` is null), or both. */
export async function holdEdits(by: { deviceId: string | null; day: YMD | null }, note?: string): Promise<void> {
  requireHead();
  if (!by.deviceId && !by.day) throw new Error('Pick a phone or a day');
  const range = by.day ? dayRange(by.day) : { since: null, until: null };
  await insert('sync_holds', { holdDevice: by.deviceId, ...range, tbl: null, recordId: null, decision: 'hold', note: note ?? null, scope: 'household' } as never);
  await reconcileHolds();
}

/** Merge (apply everywhere) or discard (never apply) everything a rule holds. */
export async function decideRule(holdId: string, decision: HoldDecision): Promise<void> {
  requireHead();
  await update('sync_holds', holdId, { decision } as Partial<SyncHold>);
  await reconcileHolds();
}

/** Decide one entry, whatever rule (or check) set it aside. */
export async function decideEntry(table: string, id: string, decision: HoldDecision): Promise<void> {
  requireHead();
  const existing = getState().tables.sync_holds.find((h) => h.tbl === table && h.recordId === id);
  if (existing) await update('sync_holds', existing.id, { decision } as Partial<SyncHold>);
  else await insert('sync_holds', { holdDevice: null, since: null, until: null, tbl: table, recordId: id, decision, note: null, scope: 'household' } as never);
  await reconcileHolds();
}

/** Drop a rule: what it held is applied, unless another rule holds it. */
export async function removeRule(holdId: string): Promise<void> {
  requireHead();
  await remove('sync_holds', holdId);
  await reconcileHolds();
}

// ── the phone whose edits are held ─────────────────────────────────────────

export interface OwnHeld {
  table: TableName;
  row: BaseRow;
  decision: HoldDecision;
}

/** This phone's own entries that the head is holding or has discarded. */
export async function ownHeld(): Promise<OwnHeld[]> {
  const { holds } = await loadScreenContext();
  const self = getState().identity.deviceId;
  const out = new Map<string, OwnHeld>();
  for (const h of holds) {
    if (h.decision === 'merge' || (h.holdDevice && h.holdDevice !== self)) continue;
    for (const table of SYNC_TABLES) {
      if (isControlTable(table) || (h.tbl && h.tbl !== table)) continue;
      for (const row of await rowsSavedBy(table, h.recordId ? { id: h.recordId } : { deviceId: self, since: h.since, until: h.until })) {
        const rule = row.deviceId === self && !row.deletedAt ? ruleFor(table, row, holds) : undefined;
        if (rule && rule.decision !== 'merge') out.set(`${table}:${row.id}`, { table, row, decision: rule.decision });
      }
    }
  }
  return [...out.values()];
}

/** Delete this phone's entries the head discarded (the deletion syncs like any other). */
export async function deleteOwnDiscarded(): Promise<number> {
  const rows = (await ownHeld()).filter((o) => o.decision === 'discard');
  for (const o of rows) await remove(o.table, o.row.id);
  return rows.length;
}

/**
 * Leave the household and keep this phone's data as a household of one: a new household id and
 * key, cloud sync off, paired phones and the old household's head and rules forgotten. Other phones
 * keep what they already received. This phone no longer has the old key; making sure a phone
 * can't read the family's future entries even if it kept the key is the head's "remove a phone".
 */
export async function separateFromHousehold(): Promise<void> {
  await setHouseholdKey(newKey());
  await forgetPeers();
  await saveIdentity({ householdId: uuidv7(), householdName: getState().identity.householdName });
  await saveSettings({ cloudSync: false });
  for (const h of getState().tables.sync_holds) await dropLocal('sync_holds', h.id);
  await dropLocal('household', HOUSEHOLD_ID);
  await reloadStore();
}
