import { addMonths, type YMD } from './dates';
import type { HoldingSummary } from './investments';
import type { Paise } from './money';
import type { Holding } from './types';
import type { FinancialYear } from './tax';

/**
 * Capital gains on investments sold, split short/long term, with an estimate of the tax. An
 * estimate to plan with, not tax advice.
 *
 * Only rules the app is sure of are applied. Everything else is listed with its gain and a reason,
 * never guessed:
 * - Gold/silver ETFs and funds: their treatment changed for units bought from April 2023, and
 *   sources disagree on the current position.
 * - Sovereign Gold Bonds: redemption at maturity and a sale on the exchange are taxed differently.
 * - Debt, hybrid and international funds: depend on the fund's equity share and the purchase date.
 * - Deposits: their return is interest (income), not a capital gain.
 * Rules change in budgets: they live here, with the date they apply from and where they come from.
 */
export const CAPITAL_GAINS_RULES = {
  /** Sales before this date followed older rules (15%/10%, 36 months, indexation): not estimated. */
  effectiveFrom: '2024-07-23' as YMD,
  source:
    'Finance (No. 2) Act 2024, for transfers from 23 July 2024, as published by the Income Tax Department. Reported unchanged by the 2025 and 2026 budgets and carried into the Income-tax Act 2025.',
  /** Listed shares, and equity mutual funds. */
  listedEquity: { longAfterMonths: 12, shortRate: 0.2, longRate: 0.125, longExemption: 1_25_000_00 as Paise },
  /** Physical and digital gold or silver, and other assets: short-term gains are taxed at your slab rate. */
  otherAsset: { longAfterMonths: 24, longRate: 0.125 },
} as const;

export type GainKind = 'listedEquity' | 'otherAsset';

/** Which rule a holding follows, or why the app doesn't estimate it. */
export function gainKindOf(h: Holding): GainKind | { reason: string } {
  if (h.assetClass === 'equity') return 'listedEquity';
  if (h.assetClass === 'mf') {
    if (h.fundType === 'equity') return 'listedEquity';
    return { reason: h.fundType ? 'Tax depends on the fund and when it was bought' : 'Set what the fund invests in' };
  }
  if (h.assetClass === 'gold' || h.assetClass === 'silver') {
    if (h.form === 'etf') return { reason: 'ETF and fund rules are unsettled' };
    if (h.form === 'sgb') return { reason: 'Sovereign Gold Bonds: maturity and market sales differ' };
    return 'otherAsset';
  }
  if (h.assetClass === 'fixed') return { reason: 'Returns are interest, taxed as income' };
  return { reason: "The app doesn't know this kind of asset" };
}

/** Held for more than `months`: bought on `bought`, sold on `sold`. */
export const isLongTerm = (bought: YMD, sold: YMD, months: number) => sold > addMonths(bought, months);

export interface GainSplit {
  short: Paise;
  long: Paise;
}

export interface Unestimated {
  holding: Holding;
  soldOn: YMD;
  gain: Paise | null;
  reason: string;
}

export interface CapitalGains {
  fy: FinancialYear;
  listedEquity: GainSplit;
  otherAsset: GainSplit;
  /** Estimated tax: equity short and long term, and other assets long term. Others' short-term gains are added to income (slab rate). */
  tax: { equityShort: Paise; equityLong: Paise; otherLong: Paise };
  /** Other assets' short-term gain, taxed at your slab rate (not estimated). */
  atSlabRate: Paise;
  unestimated: Unestimated[];
}

/**
 * Gains on sales in the financial year. Losses net off within each line only; the actual set-off
 * rules (a short-term loss can reduce long-term gains, losses carry forward) are left to the return.
 */
export function capitalGains(summaries: HoldingSummary[], fy: FinancialYear): CapitalGains {
  const R = CAPITAL_GAINS_RULES;
  const lines: Record<GainKind, GainSplit> = { listedEquity: { short: 0, long: 0 }, otherAsset: { short: 0, long: 0 } };
  const unestimated: Unestimated[] = [];
  for (const s of summaries) {
    const kind = gainKindOf(s.holding);
    for (const r of s.realised) {
      const soldOn = r.trade.tradeDate;
      if (soldOn < fy.start || soldOn > fy.end) continue;
      const skip = (reason: string) => unestimated.push({ holding: s.holding, soldOn, gain: r.gain, reason });
      if (typeof kind !== 'string') skip(kind.reason);
      else if (soldOn < R.effectiveFrom) skip('Sold before 23 July 2024: older rules');
      else if (r.gain === null) skip('Cost unknown: some purchases have no quantity');
      else if (r.beyondRecorded) skip('Some of what was sold was bought before it was recorded here');
      else {
        const months = R[kind].longAfterMonths;
        for (const p of r.parts) lines[kind][isLongTerm(p.boughtOn, soldOn, months) ? 'long' : 'short'] += p.proceeds - p.cost;
      }
    }
  }
  const pos = (v: Paise) => Math.max(0, v);
  return {
    fy,
    ...lines,
    tax: {
      equityShort: Math.round(pos(lines.listedEquity.short) * R.listedEquity.shortRate),
      equityLong: Math.round(pos(lines.listedEquity.long - R.listedEquity.longExemption) * R.listedEquity.longRate),
      otherLong: Math.round(pos(lines.otherAsset.long) * R.otherAsset.longRate),
    },
    atSlabRate: pos(lines.otherAsset.short),
    unestimated,
  };
}
