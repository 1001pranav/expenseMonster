import type { BaseRow } from '../types';

/** Last-write-wins ordering: newer updatedAt wins; ties broken by deviceId so every phone picks the same winner. */
export function isNewer(a: Pick<BaseRow, 'updatedAt' | 'deviceId'>, b: Pick<BaseRow, 'updatedAt' | 'deviceId'>): boolean {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt;
  return a.deviceId > b.deviceId;
}

export interface MergePlan<T extends BaseRow> {
  inserts: T[];
  updates: T[];
  /** Incoming rows older than (or identical to) what we have. */
  skipped: number;
  /** Rows changed on both sides since they last matched; the newer one was kept. */
  conflicts: number;
}

/**
 * Decide what to apply from an incoming batch. Deletions are just rows with deletedAt set,
 * so they merge exactly like edits (tombstones). Applying the same batch twice is a no-op.
 */
export function planMerge<T extends BaseRow>(local: Map<string, T>, incoming: T[], lastSyncWithPeer: string | null): MergePlan<T> {
  const plan: MergePlan<T> = { inserts: [], updates: [], skipped: 0, conflicts: 0 };
  for (const row of incoming) {
    const mine = local.get(row.id);
    if (!mine) {
      plan.inserts.push(row);
      continue;
    }
    if (mine.updatedAt === row.updatedAt && mine.deviceId === row.deviceId) {
      plan.skipped++;
      continue;
    }
    const editedHereSinceSync = lastSyncWithPeer !== null && mine.updatedAt > lastSyncWithPeer;
    if (isNewer(row, mine)) {
      plan.updates.push(row);
      if (editedHereSinceSync) plan.conflicts++;
    } else {
      plan.skipped++;
      if (editedHereSinceSync && row.updatedAt > (lastSyncWithPeer ?? '')) plan.conflicts++;
    }
  }
  return plan;
}
