/**
 * Is a row received from another phone fit to store? A phone with a bug, a damaged file or a
 * tampered record can send rows that would break screens (an amount that is text, a missing date).
 * Such rows are set aside for review (services/holds.ts) instead of being applied.
 *
 * Checks follow each column's SQL type in db/schema.ts, plus the few values code switches on.
 */

/** Column type as declared in db/schema.ts. */
export type ColumnDef = string;

// A value added by a newer app version fails here on purpose: this version can't show it. It waits
// with the other set-aside rows and is applied after an update (services/holds.ts re-checks them).
const ENUMS: Record<string, Record<string, readonly string[]>> = {
  transactions: {
    type: ['expense', 'income', 'transfer', 'settlement'],
    status: ['pending', 'confirmed', 'rejected'],
    method: ['upi', 'bank', 'cash', 'card', 'wallet'],
  },
};

const SCOPES = ['personal', 'household'];

/** Why the row can't be stored, or null when it is fine. Fields this version doesn't know are not checked. */
export function invalidReason(table: string, row: Record<string, unknown>, columns: Record<string, ColumnDef>): string | null {
  if (!row || typeof row !== 'object') return 'not a record';
  for (const [col, def] of Object.entries(columns)) {
    const v = row[col];
    const notNull = def.includes('NOT NULL');
    // A column the sender's version didn't have: the database default fills it.
    if (v === undefined && (!notNull || def.includes('DEFAULT'))) continue;
    if (v === null || v === undefined) {
      if (notNull) return `${col} is missing`;
      continue;
    }
    if (def.startsWith('TEXT') && typeof v !== 'string') return `${col} is not text`;
    if (def.startsWith('INTEGER') && !Number.isSafeInteger(v)) return `${col} is not a whole number`;
    if (def.startsWith('REAL') && (typeof v !== 'number' || !Number.isFinite(v))) return `${col} is not a number`;
    const allowed = ENUMS[table]?.[col];
    if (allowed && !allowed.includes(v as string)) return `${col} "${String(v).slice(0, 20)}" is unknown`;
  }
  if (!SCOPES.includes(row.scope as string)) return 'scope is unknown';
  if (Number.isNaN(Date.parse(row.updatedAt as string))) return 'updatedAt is not a date';
  if (typeof row.occurredAt === 'string' && Number.isNaN(Date.parse(row.occurredAt))) return 'occurredAt is not a date';
  return null;
}
