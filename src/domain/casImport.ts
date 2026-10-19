import type { CasRow } from './cas';
import type { HoldingSummary } from './investments';
import type { Paise } from './money';
import type { Holding } from './types';

/**
 * Matching a statement's holdings with the app's. A CAS is one person's (one PAN): its rows match
 * that person's holdings, or joint ones, never another member's. The link is the ISIN, kept in the
 * holding's `symbol` (a fund's AMFI daily price works with its ISIN too).
 */

export interface CasHolding {
  isin: string;
  name: string;
  kind: CasRow['kind'];
  quantity: number;
  price: Paise;
  value: Paise;
  /** Cost, when every row of it printed one. */
  invested: Paise | null;
}

/** One line per ISIN: the same holding in two demat accounts or two folios is added up. */
export function byIsin(rows: CasRow[]): CasHolding[] {
  const out = new Map<string, CasHolding>();
  for (const r of rows) {
    const h = out.get(r.isin);
    if (!h) out.set(r.isin, { isin: r.isin, name: r.name, kind: r.kind, quantity: r.quantity, price: r.price, value: r.value, invested: r.invested });
    else {
      h.quantity += r.quantity;
      h.value += r.value;
      h.invested = h.invested !== null && r.invested !== null ? h.invested + r.invested : null;
      if (!h.name) h.name = r.name;
    }
  }
  return [...out.values()];
}

export interface CasMatch {
  line: CasHolding;
  /** The app's holding with this ISIN for this person (or joint). */
  holding: Holding | null;
  /** What the app records as held, when every purchase has a quantity. */
  appQuantity: number | null;
  /** Holdings of the same kind for this person without an ISIN yet: candidates to link by hand. */
  linkable: Holding[];
}

const isinOf = (h: Holding) => h.symbol?.trim().toUpperCase() ?? '';

export function matchCas(lines: CasHolding[], holdings: Holding[], summaries: HoldingSummary[], owner: string | null): CasMatch[] {
  const mine = holdings.filter((h) => !h.deletedAt && (h.memberId === owner || h.memberId === null));
  const summaryOf = new Map(summaries.map((s) => [s.holding.id, s]));
  const kindOf = (h: Holding): CasHolding['kind'] | null => (h.assetClass === 'equity' ? 'equity' : h.assetClass === 'mf' || h.form === 'etf' ? 'fund' : null);
  return lines.map((line) => {
    const found = mine.filter((h) => isinOf(h) === line.isin).sort((a, b) => Number(b.memberId === owner) - Number(a.memberId === owner))[0] ?? null;
    const s = found ? summaryOf.get(found.id) : undefined;
    return {
      line,
      holding: found,
      appQuantity: s && s.quantityComplete ? s.quantity : null,
      linkable: found ? [] : mine.filter((h) => kindOf(h) === line.kind && !/^IN[EF9][0-9A-Z]{8}\d$/.test(isinOf(h))),
    };
  });
}
