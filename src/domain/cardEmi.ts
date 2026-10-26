import { calcEmi, scheduleFor } from './emi';
import type { YMD } from './dates';
import type { Paise } from './money';
import type { Loan } from './types';

/** GST charged by Indian card issuers on EMI interest and on the processing fee. */
export const GST_RATE = 0.18;

export interface Instalment {
  n: number;
  of: number;
  date: YMD;
  principal: Paise;
  interest: Paise;
  /** GST on this instalment's interest (and on the fee, for the first one). */
  gst: Paise;
  fee: Paise;
  /** What the card bill shows for this instalment. */
  amount: Paise;
  /** Principal still unbilled after this instalment. */
  balance: Paise;
}

const gstOn = (p: Paise) => Math.round(p * GST_RATE);

export const isCardEmi = (loan: Pick<Loan, 'cardId'>): boolean => Boolean(loan.cardId);

/** Live EMI plans billed on one card. */
export const cardEmiPlans = (loans: Loan[], cardId: string): Loan[] => loans.filter((l) => l.cardId === cardId && !l.deletedAt);

/**
 * The instalments a card EMI puts on the card's bills: principal + interest + 18% GST on the
 * interest, plus the processing fee (and its GST) with the first one. A no-cost EMI has no
 * interest here; if the bank still charges GST on the interest it discounted, the statement
 * amount can be corrected on the card screen.
 */
export function instalments(plan: Loan): Instalment[] {
  const rows = scheduleFor(plan);
  return rows.map((r) => {
    const fee = r.n === 1 ? plan.processingFee : 0;
    const gst = gstOn(r.interest) + gstOn(fee);
    return { n: r.n, of: rows.length, date: r.date, principal: r.principal, interest: r.interest, gst, fee, amount: r.emi + fee + gst, balance: r.balance };
  });
}

/** What converting a purchase to EMI will cost, for the form's preview. */
export function emiQuote(principal: Paise, ratePa: number, months: number, fee: Paise) {
  const emi = calcEmi(principal, ratePa, months, ratePa > 0 ? 'reducing' : 'none');
  const plan = { principal, ratePa, tenureMonths: months, firstEmiDate: '2000-01-01', emi, interestType: ratePa > 0 ? 'reducing' : 'none', processingFee: fee } as Loan;
  const list = principal > 0 && months > 0 ? instalments(plan) : [];
  const interest = list.reduce((a, i) => a + i.interest, 0);
  const gst = list.reduce((a, i) => a + i.gst, 0);
  return {
    emi,
    /** Typical monthly bill line (the first one also carries the fee). */
    monthly: list[1]?.amount ?? list[0]?.amount ?? 0,
    first: list[0]?.amount ?? 0,
    interest,
    gst,
    fee,
    /** Paid over the whole plan beyond the purchase price. */
    extra: interest + gst + fee,
  };
}
