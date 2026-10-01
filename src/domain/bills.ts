import { addDays, clampedDate, diffDays, parts, type YMD } from './dates';
import type { Paise } from './money';
import { FREQUENCY_MONTHS, advance } from './recurrence';
import type { Bill, Biller, BillerType, Transaction } from './types';

export const BILLER_TYPES: { type: BillerType; label: string; icon: string; unit: string | null; mode: Biller['amountMode'] }[] = [
  { type: 'electricity', label: 'Electricity', icon: 'flash', unit: 'kWh', mode: 'variable' },
  { type: 'water', label: 'Water', icon: 'water', unit: 'kL', mode: 'variable' },
  { type: 'gas', label: 'Piped gas', icon: 'flame', unit: 'SCM', mode: 'variable' },
  { type: 'lpg', label: 'LPG cylinder', icon: 'bonfire', unit: null, mode: 'on_demand' },
  { type: 'broadband', label: 'Internet', icon: 'wifi', unit: 'GB', mode: 'fixed' },
  { type: 'postpaid', label: 'Postpaid mobile', icon: 'call', unit: null, mode: 'variable' },
  { type: 'prepaid', label: 'Prepaid mobile', icon: 'phone-portrait', unit: null, mode: 'prepaid' },
  { type: 'dth', label: 'DTH / Cable', icon: 'tv', unit: null, mode: 'prepaid' },
  { type: 'fastag', label: 'FASTag', icon: 'car', unit: null, mode: 'prepaid' },
  { type: 'rent', label: 'Rent', icon: 'home', unit: null, mode: 'fixed' },
  { type: 'maintenance', label: 'Society maintenance', icon: 'business', unit: null, mode: 'fixed' },
  { type: 'school', label: 'School fees', icon: 'school', unit: null, mode: 'fixed' },
  { type: 'salary', label: 'Maid / driver salary', icon: 'people', unit: null, mode: 'fixed' },
  { type: 'subscription', label: 'Subscription', icon: 'play-circle', unit: null, mode: 'fixed' },
  { type: 'other', label: 'Other', icon: 'receipt', unit: null, mode: 'variable' },
];
export const billerMeta = (type: BillerType) => BILLER_TYPES.find((b) => b.type === type) ?? BILLER_TYPES[BILLER_TYPES.length - 1];

export type BillState = 'draft' | 'upcoming' | 'due' | 'part_paid' | 'paid' | 'overdue' | 'skipped';

export interface BillView {
  bill: Bill;
  totalDue: Paise;
  paid: Paise;
  remaining: Paise;
  state: BillState;
  daysToDue: number;
}

const live = (t: Transaction) => t.status === 'confirmed' && !t.deletedAt;

export function paidForBill(billId: string, transactions: Transaction[]): Paise {
  return transactions.filter((t) => live(t) && t.linkType === 'bill' && t.linkId === billId).reduce((a, t) => a + t.amount, 0);
}

export function billState(bill: Bill, paid: Paise, today: YMD, dueSoonDays = 7): BillState {
  if (bill.status === 'draft') return 'draft';
  if (bill.status === 'skipped') return 'skipped';
  const total = bill.amount + bill.lateFee;
  if (bill.status === 'paid' || (total > 0 && paid >= total)) return 'paid';
  if (bill.dueDate < today) return 'overdue';
  if (paid > 0) return 'part_paid';
  return diffDays(bill.dueDate, today) <= dueSoonDays ? 'due' : 'upcoming';
}

export function viewBill(bill: Bill, transactions: Transaction[], today: YMD): BillView {
  const paid = paidForBill(bill.id, transactions);
  const totalDue = bill.amount + bill.lateFee;
  return {
    bill,
    totalDue,
    paid,
    remaining: Math.max(totalDue - paid, 0),
    state: billState(bill, paid, today),
    daysToDue: diffDays(bill.dueDate, today),
  };
}

/** Bill date for the cycle that contains `date`, aligned to the biller's bill day and frequency. */
function billDatesUntil(biller: Biller, from: YMD, until: YMD): YMD[] {
  const { y, m } = parts(from);
  let d = clampedDate(y, m, biller.billDay);
  const out: YMD[] = [];
  for (let i = 0; i < 60 && d <= until; i++) {
    if (d >= from) out.push(d);
    d = advance(d, biller.frequency, biller.billDay);
  }
  return out;
}

/**
 * Fixed billers (rent, broadband, maintenance…) get their bill created automatically.
 * Returns bill drafts for cycles between the last known bill (or `since`) and `today + lookaheadDays`
 * that don't exist yet. Variable billers are entered by the user; prepaid/on-demand have no cycle.
 */
export function pendingFixedBills(
  biller: Biller,
  existing: Bill[],
  today: YMD,
  since: YMD,
  lookaheadDays = 7,
): Pick<Bill, 'billerId' | 'billDate' | 'dueDate' | 'amount' | 'periodFrom' | 'periodTo'>[] {
  if (biller.amountMode !== 'fixed' || !biller.active || !biller.fixedAmount) return [];
  const mine = existing.filter((b) => b.billerId === biller.id && !b.deletedAt);
  const lastDate = mine.reduce<YMD | null>((acc, b) => (acc === null || b.billDate > acc ? b.billDate : acc), null);
  const from = lastDate ? addDays(lastDate, 1) : since;
  const have = new Set(mine.map((b) => b.billDate));
  return billDatesUntil(biller, from, addDays(today, lookaheadDays))
    .filter((d) => !have.has(d))
    .map((billDate) => ({
      billerId: biller.id,
      billDate,
      dueDate: addDays(billDate, biller.dueOffsetDays),
      amount: biller.fixedAmount!,
      periodFrom: billDate,
      periodTo: addDays(advance(billDate, biller.frequency, biller.billDay), -1),
    }));
}

/** When a variable biller's next bill is expected (to prompt "Enter this month's bill"). */
export function nextExpectedBillDate(biller: Biller, bills: Bill[], today: YMD): YMD {
  const mine = bills.filter((b) => b.billerId === biller.id && !b.deletedAt);
  if (mine.length) {
    const last = mine.reduce((a, b) => (b.billDate > a ? b.billDate : a), mine[0].billDate);
    return advance(last, biller.frequency, biller.billDay);
  }
  const { y, m } = parts(today);
  const thisMonth = clampedDate(y, m, biller.billDay);
  return thisMonth;
}

export interface PrepaidStatus {
  validUntil: YMD | null;
  daysLeft: number | null;
  state: 'active' | 'expiring' | 'expired' | 'unknown';
}

export function prepaidStatus(bills: Bill[], billerId: string, today: YMD, warnDays = 5): PrepaidStatus {
  const recharges = bills.filter((b) => b.billerId === billerId && !b.deletedAt && b.validUntil);
  if (!recharges.length) return { validUntil: null, daysLeft: null, state: 'unknown' };
  const validUntil = recharges.reduce((a, b) => (b.validUntil! > a ? b.validUntil! : a), recharges[0].validUntil!);
  const daysLeft = diffDays(validUntil, today);
  return { validUntil, daysLeft, state: daysLeft < 0 ? 'expired' : daysLeft <= warnDays ? 'expiring' : 'active' };
}

/** A new recharge extends from the later of today or the current expiry. */
export function rechargeValidity(current: YMD | null, today: YMD, validityDays: number): YMD {
  const start = current && current >= today ? addDays(current, 1) : today;
  return addDays(start, validityDays - 1);
}

/** Autopay bills where no payment was seen 2+ days after the due date. */
export function autopayMissing(biller: Biller, view: BillView, today: YMD, graceDays = 2): boolean {
  return Boolean(biller.autopay) && view.remaining > 0 && diffDays(today, view.bill.dueDate) >= graceDays;
}

/** Average days between LPG bookings → predicted next booking date. */
export function predictNextLpg(bookingDates: YMD[]): { averageDays: number; nextDate: YMD } | null {
  const sorted = [...bookingDates].sort();
  if (sorted.length < 2) return null;
  const gaps = sorted.slice(1).map((d, i) => diffDays(d, sorted[i]));
  const averageDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  return { averageDays, nextDate: addDays(sorted[sorted.length - 1], averageDays) };
}

export interface UsageInsight {
  costPerUnit: number | null;
  averageAmount: Paise;
  changeVsAverage: number | null;
}

/** Compare the latest bill with the average of up to 6 previous bills. */
export function usageInsight(bills: Bill[]): UsageInsight {
  const sorted = bills.filter((b) => !b.deletedAt && b.status !== 'draft').sort((a, b) => a.billDate.localeCompare(b.billDate));
  if (!sorted.length) return { costPerUnit: null, averageAmount: 0, changeVsAverage: null };
  const latest = sorted[sorted.length - 1];
  const previous = sorted.slice(-7, -1);
  const averageAmount = previous.length ? Math.round(previous.reduce((a, b) => a + b.amount, 0) / previous.length) : latest.amount;
  return {
    costPerUnit: latest.usage ? latest.amount / 100 / latest.usage : null,
    averageAmount,
    changeVsAverage: previous.length && averageAmount ? (latest.amount - averageAmount) / averageAmount : null,
  };
}

const GENERIC_WORDS = new Set(['home', 'house', 'flat', 'office', 'bill', 'bills', 'payment', 'mobile', 'rent', 'main', 'limited', 'ltd', 'bank', 'india', 'online', 'recharge', 'monthly', 'services']);

/** Find which biller a captured text (SMS / screenshot) refers to, by consumer number or provider/name. */
export function matchBiller(text: string, billers: Biller[]): Biller | null {
  const t = text.toLowerCase();
  const compact = t.replace(/\s+/g, '');
  const byConsumer = billers.find((b) => b.consumerNo && b.consumerNo.length >= 4 && compact.includes(b.consumerNo.toLowerCase().replace(/\s+/g, '')));
  if (byConsumer) return byConsumer;
  const words = (s: string) =>
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !GENERIC_WORDS.has(w));
  return (
    billers.find((b) => b.provider && words(b.provider).some((w) => t.includes(w))) ??
    billers.find((b) => words(b.name).some((w) => t.includes(w))) ??
    null
  );
}

export const periodsPerYear = (b: Pick<Biller, 'frequency'>) => 12 / FREQUENCY_MONTHS[b.frequency];
