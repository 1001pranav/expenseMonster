import type { BaseRow } from '../types';

/**
 * How to resolve a row that was changed on both phones since they last synced.
 * - ask:      keep both versions aside and let the user pick per entry (default)
 * - newest:   the edit with the later UTC timestamp wins (ties: deviceId)
 * - incoming: whatever is in the file being imported wins
 */
export type ConflictPolicy = 'ask' | 'newest' | 'incoming';

/** Last-write-wins ordering on UTC ISO timestamps; ties broken by deviceId so every phone picks the same winner. */
export function isNewer(a: Pick<BaseRow, 'updatedAt' | 'deviceId'>, b: Pick<BaseRow, 'updatedAt' | 'deviceId'>): boolean {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt;
  return a.deviceId > b.deviceId;
}

const META = new Set(['updatedAt', 'deviceId', 'createdAt']);

/** Same data, ignoring bookkeeping columns. */
export function sameContent(a: BaseRow, b: BaseRow): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (META.has(k)) continue;
    const va = (a as unknown as Record<string, unknown>)[k] ?? null;
    const vb = (b as unknown as Record<string, unknown>)[k] ?? null;
    if (va !== vb) return false;
  }
  return true;
}

/** Columns whose values differ (for showing a conflict to the user). */
export function changedFields(a: BaseRow, b: BaseRow): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => !META.has(k) && ((a as unknown as Record<string, unknown>)[k] ?? null) !== ((b as unknown as Record<string, unknown>)[k] ?? null));
}

export interface Conflict<T extends BaseRow = BaseRow> {
  local: T;
  incoming: T;
}

export interface MergePlan<T extends BaseRow> {
  inserts: T[];
  updates: T[];
  /** Incoming rows older than (or identical to) what we have. */
  skipped: number;
  /** Edited on both phones and left for the user to decide (policy "ask"). */
  conflicts: Conflict<T>[];
  /** Edited on both phones and settled automatically by the policy. */
  autoResolved: number;
}

/**
 * Decide what to apply from an incoming batch. Deletions are rows with deletedAt set, so they
 * merge like edits (tombstones). Applying the same batch twice is a no-op.
 * A conflict is a row changed here after the last sync with this peer AND different in the file.
 */
export function planMerge<T extends BaseRow>(local: Map<string, T>, incoming: T[], lastSyncWithPeer: string | null, policy: ConflictPolicy = 'newest'): MergePlan<T> {
  const plan: MergePlan<T> = { inserts: [], updates: [], skipped: 0, conflicts: [], autoResolved: 0 };
  for (const row of incoming) {
    const mine = local.get(row.id);
    if (!mine) {
      plan.inserts.push(row);
      continue;
    }
    if (sameContent(mine, row)) {
      plan.skipped++;
      continue;
    }
    const editedHere = lastSyncWithPeer !== null && mine.updatedAt > lastSyncWithPeer;
    const editedThere = lastSyncWithPeer === null || row.updatedAt > lastSyncWithPeer;
    const conflict = editedHere && editedThere;

    if (conflict && policy === 'ask') {
      plan.conflicts.push({ local: mine, incoming: row });
      continue;
    }
    const takeIncoming = policy === 'incoming' || isNewer(row, mine);
    if (takeIncoming) plan.updates.push(row);
    else plan.skipped++;
    if (conflict) plan.autoResolved++;
  }
  return plan;
}
