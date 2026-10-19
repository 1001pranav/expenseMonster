import type { Paise } from './money';
import { flagsOf, isLive } from './transactions';
import type { YMD } from './dates';
import type { AssetClass, Holding, QuantityUnit, Trade, Transaction } from './types';

/**
 * Investments (docs/INVESTMENTS_PLAN.md). Money put into an investment is a transfer to something
 * the family still owns, not spending: the cash side is a transaction (type transfer, linkType
 * 'investment', linkId = the trade), the trade records what was bought, the holding what it is.
 * Quantities are integer thousandths of the unit (milli-units), for the same reason money is in
 * paise: sums and splits must not drift.
 */

export interface Choice {
  value: string;
  label: string;
}

export interface AssetMeta {
  label: string;
  icon: string;
  unit: QuantityUnit;
  forms: Choice[];
  purities: Choice[];
  /** What the extra costs are called for this class. */
  chargesLabel: string;
  taxesLabel: string;
}

const NO_CHOICES: Choice[] = [];

export const ASSET_CLASSES: Record<AssetClass, AssetMeta> = {
  gold: {
    label: 'Gold',
    icon: 'diamond',
    unit: 'g',
    forms: [
      { value: 'jewellery', label: 'Jewellery' },
      { value: 'coin', label: 'Coin / bar' },
      { value: 'digital', label: 'Digital gold' },
      { value: 'sgb', label: 'SGB' },
      { value: 'etf', label: 'ETF / fund' },
    ],
    purities: [
      { value: '999', label: '24K (999)' },
      { value: '916', label: '22K (916)' },
      { value: '750', label: '18K (750)' },
    ],
    chargesLabel: 'Making charges',
    taxesLabel: 'GST',
  },
  silver: {
    label: 'Silver',
    icon: 'ellipse',
    unit: 'g',
    forms: [
      { value: 'jewellery', label: 'Jewellery / article' },
      { value: 'coin', label: 'Coin / bar' },
      { value: 'digital', label: 'Digital silver' },
      { value: 'etf', label: 'ETF / fund' },
    ],
    purities: [
      { value: '999', label: '999' },
      { value: '925', label: 'Sterling (925)' },
    ],
    chargesLabel: 'Making charges',
    taxesLabel: 'GST',
  },
  equity: { label: 'Shares', icon: 'trending-up', unit: 'share', forms: NO_CHOICES, purities: NO_CHOICES, chargesLabel: 'Brokerage', taxesLabel: 'STT, stamp duty & GST' },
  mf: {
    label: 'Mutual fund',
    icon: 'pie-chart',
    unit: 'unit',
    forms: [
      { value: 'sip', label: 'SIP instalment' },
      { value: 'lumpsum', label: 'Lump sum' },
    ],
    purities: NO_CHOICES,
    chargesLabel: 'Charges',
    taxesLabel: 'Stamp duty',
  },
  fixed: {
    label: 'Deposits & schemes',
    icon: 'business',
    unit: 'none',
    forms: [
      { value: 'fd', label: 'FD' },
      { value: 'rd', label: 'RD' },
      { value: 'ppf', label: 'PPF' },
      { value: 'nps', label: 'NPS' },
      { value: 'bonds', label: 'Bonds' },
    ],
    purities: NO_CHOICES,
    chargesLabel: 'Charges',
    taxesLabel: 'Taxes',
  },
  other: { label: 'Other', icon: 'cube', unit: 'none', forms: NO_CHOICES, purities: NO_CHOICES, chargesLabel: 'Charges', taxesLabel: 'Taxes' },
};

export const ASSET_ORDER: AssetClass[] = ['gold', 'silver', 'equity', 'mf', 'fixed', 'other'];

/** Gold and silver ETFs and funds are counted in units, not grams. */
export const unitFor = (assetClass: AssetClass, form: string | null): QuantityUnit => (form === 'etf' ? 'unit' : ASSET_CLASSES[assetClass].unit);

const UNIT_LABEL: Record<QuantityUnit, [string, string]> = { g: ['g', 'g'], share: ['share', 'shares'], unit: ['unit', 'units'], none: ['', ''] };
export const unitLabel = (unit: QuantityUnit, plural = true) => UNIT_LABEL[unit][plural ? 1 : 0];

// ── quantities in thousandths ───────────────────────────────────────────────

/** "10.5" → 10500. Empty → null (not entered); not a number or more than 3 decimals → undefined. */
export function parseQuantity(text: string): number | null | undefined {
  const t = text.trim().replace(/,/g, '');
  if (!t) return null;
  if (!/^\d*(\.\d{0,3})?$/.test(t) || t === '.') return undefined;
  const [int, dec = ''] = t.split('.');
  return Number(int || '0') * 1000 + Number(dec.padEnd(3, '0'));
}

/** 10500 → "10.5" (no grouping, for editing). */
export function quantityText(milli: number | null): string {
  if (milli === null) return '';
  const int = Math.floor(milli / 1000);
  const dec = String(milli % 1000).padStart(3, '0').replace(/0+$/, '');
  return dec ? `${int}.${dec}` : String(int);
}

/** 10500, g → "10.5 g"; 3000, share → "3 shares". */
export function formatQuantity(milli: number, unit: QuantityUnit): string {
  if (unit === 'none') return quantityText(milli);
  const plural = milli !== 1000;
  return unit === 'g' ? `${quantityText(milli)} g` : `${quantityText(milli)} ${unitLabel(unit, plural)}`;
}

// ── amount, quantity and price: enter two, get the third ──────────────────────

export type TradeField = 'amount' | 'quantity' | 'unitPrice';

export interface TradeNumbers {
  /** Total paid (paise), charges and taxes included. */
  amount: Paise | null;
  quantity: number | null;
  /** Paise per unit, before charges and taxes. */
  unitPrice: Paise | null;
  charges: Paise;
  taxes: Paise;
}

/**
 * The field to calculate: the one of amount / quantity / price the user touched least recently,
 * once the other two have values. `recent` lists edited fields, most recent first.
 */
export function fieldToDerive(recent: TradeField[], n: TradeNumbers): TradeField | null {
  const all: TradeField[] = ['amount', 'quantity', 'unitPrice'];
  const touched = [...new Set(recent)].slice(0, 2);
  if (touched.length < 2 || touched.some((f) => !n[f])) return null;
  return all.find((f) => !touched.includes(f)) ?? null;
}

/**
 * The value of `field` from the other numbers. Buying: amount = quantity × price + charges + taxes.
 * Selling: amount (what you receive) = quantity × price − charges − taxes. Null when it can't be worked out.
 */
export function derive(field: TradeField, n: TradeNumbers, side: 'buy' | 'sell' = 'buy'): number | null {
  const extra = (n.charges + n.taxes) * (side === 'buy' ? 1 : -1);
  if (field === 'amount') {
    const amount = n.quantity && n.unitPrice ? Math.round((n.quantity * n.unitPrice) / 1000) + extra : null;
    return amount !== null && amount > 0 ? amount : null;
  }
  const goods = (n.amount ?? 0) - extra;
  if (goods <= 0) return null;
  if (field === 'unitPrice') return n.quantity ? Math.round((goods * 1000) / n.quantity) : null;
  return n.unitPrice ? Math.round((goods * 1000) / n.unitPrice) : null;
}

// ── what the family holds ─────────────────────────────────────────────────────

export interface Realised {
  trade: Trade;
  /** What was received. */
  proceeds: Paise;
  /** Cost of what was sold, earliest purchases first (FIFO); null when it can't be known. */
  cost: Paise | null;
  /** proceeds − cost; null with cost. */
  gain: Paise | null;
  /** Sold more than the recorded purchases: the cost covers only what was recorded ("at least" this gain). */
  beyondRecorded: boolean;
  /**
   * The purchases this sale used up, with their share of what it brought in: one sale can be partly
   * short-term and partly long-term for tax. Empty when the cost is unknown.
   */
  parts: SalePart[];
}

export interface SalePart {
  boughtOn: YMD;
  quantity: number | null;
  cost: Paise;
  proceeds: Paise;
}

/** Share `total` across `weights` in proportion, the last taking the rounding remainder. */
function shareOut(total: Paise, weights: number[]): Paise[] {
  const sum = weights.reduce((a, w) => a + w, 0);
  if (!sum) return weights.map((_, i) => (i === weights.length - 1 ? total : 0));
  let given = 0;
  return weights.map((w, i) => {
    if (i === weights.length - 1) return total - given;
    const v = Math.round((total * w) / sum);
    given += v;
    return v;
  });
}

export interface HoldingSummary {
  holding: Holding;
  /** Cost of what is still held (charges included): net worth on cost basis. */
  invested: Paise;
  /** Making charges, brokerage, taxes on purchases still held: paid, not recovered on sale. */
  costs: Paise;
  /** Thousandths still held, from the quantities entered. */
  quantity: number;
  /** False when some purchase still held has no quantity: the total is incomplete and can't be valued. */
  quantityComplete: boolean;
  /** At the last price entered, when the quantity is complete. */
  value: Paise | null;
  /** Gains and losses of sales, in date order. */
  realised: Realised[];
  /** Nothing left (sold all, or quantity down to zero). */
  soldOut: boolean;
  trades: Trade[];
}

/** A trade counts while it and its money transaction (if any) are live. */
export function liveTrades(trades: Trade[], transactions: Transaction[]): Trade[] {
  const txns = new Map(transactions.map((t) => [t.id, t]));
  return trades.filter((tr) => !tr.deletedAt && (!tr.txnId || (txns.has(tr.txnId) && isLive(txns.get(tr.txnId)!))));
}

interface Lot {
  date: YMD;
  quantity: number | null;
  cost: Paise;
  charges: Paise;
}

/**
 * Replay a holding's trades in date order. Purchases open lots; a sale uses up the earliest lots
 * first (FIFO). A sale with no quantity means "sold all of it". When a lot it needs has no
 * quantity, the share it used can't be known: the sale's cost is unknown, never guessed.
 */
export function ledger(holding: Holding, trades: Trade[]): HoldingSummary {
  const ordered = [...trades].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.createdAt.localeCompare(b.createdAt));
  let lots: Lot[] = [];
  const realised: Realised[] = [];
  for (const tr of ordered) {
    if (tr.side === 'buy') {
      lots.push({ date: tr.tradeDate, quantity: tr.quantity, cost: tr.amount, charges: tr.charges + tr.taxes });
      continue;
    }
    let cost: Paise | null = 0;
    let beyondRecorded = false;
    const used: Omit<SalePart, 'proceeds'>[] = [];
    if (tr.quantity === null) {
      // "Sold all of it": everything still held. With nothing recorded, the cost is unknown, not zero.
      cost = lots.length ? lots.reduce((a, l) => a + l.cost, 0) : null;
      used.push(...lots.map((l) => ({ boughtOn: l.date, quantity: l.quantity, cost: l.cost })));
      lots = [];
    } else {
      let need = tr.quantity;
      while (need > 0 && lots.length) {
        const lot = lots[0];
        if (lot.quantity === null) {
          // How much of an unmeasured purchase this sale used is unknown.
          cost = null;
          break;
        }
        const take = Math.min(lot.quantity, need);
        const part = take === lot.quantity ? lot.cost : Math.round((lot.cost * take) / lot.quantity);
        const partCharges = take === lot.quantity ? lot.charges : Math.round((lot.charges * take) / lot.quantity);
        if (cost !== null) cost += part;
        used.push({ boughtOn: lot.date, quantity: take, cost: part });
        lot.cost -= part;
        lot.charges -= partCharges;
        lot.quantity -= take;
        need -= take;
        if (lot.quantity === 0) lots.shift();
      }
      if (need > 0 && cost !== null) beyondRecorded = true;
    }
    // What each purchase's share brought in: by quantity when every quantity is known, else by cost.
    // Beyond what was recorded, the rest of the proceeds belong to purchases the app doesn't know.
    const byQuantity = used.every((u) => u.quantity !== null) && tr.quantity !== null;
    const covered = byQuantity && beyondRecorded ? Math.round((tr.amount * used.reduce((a, u) => a + (u.quantity ?? 0), 0)) / tr.quantity!) : tr.amount;
    const shares = shareOut(covered, used.map((u) => (byQuantity ? (u.quantity ?? 0) : u.cost)));
    const parts = cost === null ? [] : used.map((u, i) => ({ ...u, proceeds: shares[i] }));
    realised.push({ trade: tr, proceeds: tr.amount, cost, gain: cost === null ? null : tr.amount - cost, beyondRecorded, parts });
  }
  const quantity = lots.reduce((a, l) => a + (l.quantity ?? 0), 0);
  const quantityComplete = holding.unit !== 'none' && lots.length > 0 && lots.every((l) => l.quantity !== null);
  return {
    holding,
    invested: lots.reduce((a, l) => a + l.cost, 0),
    costs: lots.reduce((a, l) => a + l.charges, 0),
    quantity,
    quantityComplete,
    value: quantityComplete && holding.priceNow !== null ? Math.round((quantity * holding.priceNow) / 1000) : null,
    realised,
    soldOut: !lots.length && ordered.length > 0,
    trades: ordered,
  };
}

export function summarizeHoldings(holdings: Holding[], trades: Trade[], transactions: Transaction[]): HoldingSummary[] {
  const byHolding = new Map<string, Trade[]>();
  for (const tr of liveTrades(trades, transactions)) byHolding.set(tr.holdingId, [...(byHolding.get(tr.holdingId) ?? []), tr]);
  return holdings.filter((h) => !h.deletedAt).map((h) => ledger(h, byHolding.get(h.id) ?? []));
}

/** Money invested in total, per member, and held jointly (memberId null): net worth on cost basis. */
export function investedByOwner(summaries: HoldingSummary[]): { total: Paise; joint: Paise; byMember: Record<string, Paise> } {
  const byMember: Record<string, Paise> = {};
  let joint = 0;
  for (const s of summaries) {
    if (s.holding.memberId) byMember[s.holding.memberId] = (byMember[s.holding.memberId] ?? 0) + s.invested;
    else joint += s.invested;
  }
  return { total: joint + Object.values(byMember).reduce((a, v) => a + v, 0), joint, byMember };
}

export const isInvestment = (t: Pick<Transaction, 'type' | 'linkType'>) => t.type === 'transfer' && t.linkType === 'investment';

/** Flag on the cash transaction of a sale: money coming back from an investment. */
export const SALE_FLAG = 'sale';
export const isInvestmentSale = (t: Pick<Transaction, 'type' | 'linkType' | 'flags'>) => isInvestment(t) && flagsOf(t).includes(SALE_FLAG);

/** Older entries filed as spending under the Investments category: offered for conversion, never converted silently. */
export const LEGACY_INVEST_CATEGORY = 'cat_invest';
export const legacyInvestmentExpenses = (transactions: Transaction[]) => transactions.filter((t) => isLive(t) && t.type === 'expense' && t.categoryId === LEGACY_INVEST_CATEGORY);

/** "22K gold", "Silver coin": a sensible name for a new holding. */
export function defaultHoldingName(assetClass: AssetClass, form: string | null, purity: string | null): string {
  const meta = ASSET_CLASSES[assetClass];
  if (assetClass === 'gold' || assetClass === 'silver') {
    const p = meta.purities.find((x) => x.value === purity)?.label.split(' ')[0];
    const f = meta.forms.find((x) => x.value === form)?.label.split(' ')[0].toLowerCase();
    return [p && assetClass === 'gold' ? p : null, meta.label.toLowerCase(), f && f !== 'jewellery' ? f : null].filter(Boolean).join(' ').replace(/^./, (c) => c.toUpperCase());
  }
  return meta.forms.find((x) => x.value === form)?.label ?? '';
}

// ── current value and what went over the metal ───────────────────────────────

export interface PortfolioValue {
  /** Cost of everything held. */
  invested: Paise;
  /** Current value of the holdings that have a price and a complete quantity. */
  value: Paise;
  /** Cost of those same holdings: value − valuedCost is the gain not yet taken. */
  valuedCost: Paise;
  /** Holdings that can't be valued (no price, or a purchase with no quantity). */
  unvalued: number;
}

export function portfolioValue(summaries: HoldingSummary[]): PortfolioValue {
  const out: PortfolioValue = { invested: 0, value: 0, valuedCost: 0, unvalued: 0 };
  for (const s of summaries) {
    if (s.soldOut) continue;
    out.invested += s.invested;
    if (s.value === null) out.unvalued++;
    else {
      out.value += s.value;
      out.valuedCost += s.invested;
    }
  }
  return out;
}

/**
 * For jewellery and coins bought with the day's market rate noted: how much of the price went over
 * the metal's worth (making charges, GST, the jeweller's margin), which isn't recovered on sale.
 */
export function premiumOverMetal(t: Trade): { metal: Paise; premium: Paise; share: number } | null {
  if (t.side !== 'buy' || !t.refRate || !t.quantity) return null;
  const metal = Math.round((t.quantity * t.refRate) / 1000);
  if (!metal) return null;
  return { metal, premium: t.amount - metal, share: (t.amount - metal) / metal };
}

/** Holdings that one metal rate applies to: same metal and purity, by weight (not ETFs or bonds). */
export const sameMetal = (a: Holding, b: Holding) =>
  (a.assetClass === 'gold' || a.assetClass === 'silver') && a.assetClass === b.assetClass && a.purity === b.purity && a.unit === 'g' && b.unit === 'g' && a.form !== 'sgb' && b.form !== 'sgb';
