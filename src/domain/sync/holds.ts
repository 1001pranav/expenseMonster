import type { BaseRow, HouseholdInfo, SyncHold } from '../types';

/**
 * The household head can hold back edits for review: everything from one phone, everything saved on
 * one day (by one phone or any), or one entry. Every phone sets matching rows aside instead of
 * applying them, until the head merges them (applied everywhere) or discards them (kept aside,
 * never applied). Nothing is deleted and nothing is written to the server: each phone just decides
 * what it shows. Only the head's rules are followed; that is enforced by every phone, not the server.
 */

/** Tables that run the household itself: never held (the head must always be able to change rules). */
export const CONTROL_TABLES = ['devices', 'household', 'sync_holds'] as const;
export const isControlTable = (table: string) => (CONTROL_TABLES as readonly string[]).includes(table);

/** A local calendar day as the UTC range a hold stores: its midnight to the next (DST-safe). */
export function dayRange(day: string): { since: string; until: string } {
  const [y, m, d] = day.split('-').map(Number);
  return { since: new Date(y, m - 1, d).toISOString(), until: new Date(y, m - 1, d + 1).toISOString() };
}

const inRange = (h: SyncHold, at: string) => (!h.since || at >= h.since) && (!h.until || at < h.until);

/** How specific a rule is: a rule about one entry beats one about a phone's day, which beats a day or a phone. */
function specificity(h: SyncHold): number {
  if (h.recordId) return 3;
  return (h.holdDevice ? 1 : 0) + (h.since || h.until ? 1 : 0);
}

function matches(h: SyncHold, table: string, row: BaseRow): boolean {
  if (h.recordId) return h.tbl === table && h.recordId === row.id;
  if (!h.holdDevice && !h.since && !h.until) return false;
  return (!h.holdDevice || h.holdDevice === row.deviceId) && inRange(h, row.updatedAt);
}

/**
 * The rule that decides this version of a row, if any. Private entries are never covered: they
 * reach only their owner's other phones (cloud backup), and are no business of the household.
 */
export function ruleFor(table: string, row: BaseRow, holds: SyncHold[]): SyncHold | undefined {
  if (isControlTable(table) || row.scope === 'personal') return undefined;
  let best: SyncHold | undefined;
  for (const h of holds) {
    if (h.deletedAt || !matches(h, table, row)) continue;
    if (!best || specificity(h) > specificity(best) || (specificity(h) === specificity(best) && h.updatedAt > best.updatedAt)) best = h;
  }
  return best;
}

/** True when this version must stay aside: held for review or discarded. */
export const isHeldBack = (table: string, row: BaseRow, holds: SyncHold[]) => {
  const r = ruleFor(table, row, holds);
  return Boolean(r && r.decision !== 'merge');
};

/**
 * Whether a change to a control record is accepted. The head runs the household: rules and the
 * household record (who is head) are followed only when the head made them. Each phone publishes
 * only its own device record.
 */
export function acceptsControl(table: string, incoming: BaseRow, household: HouseholdInfo | undefined): boolean {
  if (table === 'devices') return incoming.id === incoming.deviceId;
  const head = household?.headDeviceId ?? null;
  if (table === 'sync_holds') return Boolean(head) && incoming.deviceId === head;
  if (!household || !head || incoming.deviceId === head) return true;
  // Two phones claimed the free role before hearing of each other: the earlier claim wins, on every phone.
  const firstClaim = (h: BaseRow) => h.createdAt === h.updatedAt && (h as HouseholdInfo).headDeviceId === h.deviceId;
  return firstClaim(incoming) && firstClaim(household) && (incoming.createdAt < household.createdAt || (incoming.createdAt === household.createdAt && incoming.deviceId < household.deviceId));
}

/** Why a received row is set aside. */
export type AsideReason = 'invalid' | 'held';

export interface ScreenContext {
  household: HouseholdInfo | undefined;
  holds: SyncHold[];
  /** Why the row can't be stored (domain/sync/validate.ts), or null. */
  invalid: (table: string, row: BaseRow) => string | null;
}

export type Screening = { kind: 'apply' } | { kind: 'aside'; reason: AsideReason } | { kind: 'ignore' };

/** What to do with a row received from another phone. */
export function screenIncoming(table: string, row: BaseRow, ctx: ScreenContext): Screening {
  if (ctx.invalid(table, row)) return { kind: 'aside', reason: 'invalid' };
  if (isControlTable(table)) return acceptsControl(table, row, ctx.household) ? { kind: 'apply' } : { kind: 'ignore' };
  return isHeldBack(table, row, ctx.holds) ? { kind: 'aside', reason: 'held' } : { kind: 'apply' };
}

/** The screening context after a control row was applied (a page can change the head, then add rules). */
export function withControlRow(ctx: ScreenContext, table: string, row: BaseRow): ScreenContext {
  if (table === 'household') return { ...ctx, household: row as HouseholdInfo };
  if (table === 'sync_holds') return { ...ctx, holds: [...ctx.holds.filter((h) => h.id !== row.id), row as SyncHold] };
  return ctx;
}
