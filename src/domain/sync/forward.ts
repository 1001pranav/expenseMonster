import type { BaseRow } from '../types';
import { isNewer } from './merge';

/**
 * Forward compatibility: data from a newer app version must survive a phone that hasn't updated.
 *
 * - Fields this version doesn't know (a column added later) are kept in the row's `extra` column
 *   as JSON, carried along when the row is edited here, and sent out again with the row. A later
 *   version that knows the column moves them into it (`adoptExtra`).
 * - Records of a table this version doesn't know are kept aside whole (`held_records`) and applied
 *   once an update adds the table, instead of being skipped for good.
 */
export const EXTRA = 'extra';

type Fields = Record<string, unknown>;

function parseExtra(json: unknown): Fields {
  if (typeof json !== 'string' || !json) return {};
  try {
    const v = JSON.parse(json);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/**
 * A received row, ready to store: fields outside `columns` move into `extra`. The row arrived
 * expanded (see `expandExtra`), so its unknown fields are its whole extra; nothing old is merged in.
 */
export function foldUnknown<T extends Fields>(row: T, columns: readonly string[]): T {
  const known = new Set(columns);
  const out: Fields = {};
  const extra: Fields = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === EXTRA) continue;
    if (known.has(k)) out[k] = v;
    else extra[k] = v;
  }
  out[EXTRA] = Object.keys(extra).length ? JSON.stringify(extra) : null;
  return out as T;
}

/** A stored row as it is sent to other phones: `extra` unfolded into plain fields. Known columns win. */
export function expandExtra<T extends Fields>(row: T): T {
  if (!(EXTRA in row)) return row;
  const { [EXTRA]: json, ...rest } = row;
  return { ...parseExtra(json), ...rest } as unknown as T;
}

/** True when some of the row's extra fields are now real columns, i.e. the row should be rewritten. */
export function hasAdoptableExtra(row: Fields, columns: readonly string[]): boolean {
  const known = new Set(columns);
  return Object.keys(parseExtra(row[EXTRA])).some((k) => known.has(k));
}

/** Table names a newer version might use; anything else in a record is damage, not a new table. */
export const isPlausibleTable = (name: unknown): name is string => typeof name === 'string' && /^[a-z][a-z0-9_]{0,39}$/.test(name);

export interface HeldRecord {
  tbl: string;
  row: BaseRow;
}

/**
 * Whether an incoming record of an unknown table replaces the one already held. Cloud records
 * arrive in the server's order, so the later one is the newer version whatever the clocks say;
 * files carry no order, so the newer edit wins.
 */
export const replacesHeld = (held: BaseRow | undefined, incoming: BaseRow, ordered: boolean) => !held || ordered || isNewer(incoming, held);
