import { buildCardLedger } from './creditCard';
import { addMonths, isoToYMD, monthKey, shortMonth, type YMD } from './dates';
import { budgetUsage } from './budget';
import { loanEmisPaid } from './dues';
import { loanProgress, scheduleFor } from './emi';
import { formatINR, type Paise } from './money';
import { isLive, monthTotals } from './transactions';
import type { Budget, CardStatementOverride, CreditCard, Loan, Transaction } from './types';

export type HealthStatus = 'good' | 'watch' | 'risk' | 'unknown';

export interface HealthMetric {
  key: 'savings_rate' | 'emi_to_income' | 'card_utilisation' | 'budgets';
  label: string;
  /** Display value, e.g. "18%". */
  value: string;
  status: HealthStatus;
  /** One sentence explaining the status, with the figures it is based on. */
  reason: string;
}

export interface HealthInput {
  transactions: Transaction[];
  loans: Loan[];
  cards: CreditCard[];
  cardOverrides: CardStatementOverride[];
  budgets: Budget[];
}

/** Complete months used for averages: a month in progress would understate both income and spend. */
export const HEALTH_MONTHS = 3;

const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;

function lastCompleteMonths(today: YMD, count: number): string[] {
  return Array.from({ length: count }, (_, i) => monthKey(addMonths(`${monthKey(today)}-01`, -(i + 1))));
}

/**
 * Monthly EMI owed on open borrowed loans. A loan whose every EMI is paid no longer costs anything,
 * even if nobody marked it closed. Pass `today` to apply that check (needs the transactions).
 */
export function monthlyEmi(loans: Loan[], transactions: Transaction[] = [], today?: YMD): Paise {
  const live = transactions.filter(isLive);
  const owing = (l: Loan) => !today || l.tenureMonths <= 0 || loanProgress(scheduleFor(l), loanEmisPaid(l, live), today).emisLeft > 0;
  return loans.filter((l) => !l.deletedAt && !l.closed && l.direction === 'borrowed' && l.emi > 0 && owing(l)).reduce((a, l) => a + l.emi, 0);
}

/**
 * Money that is really earned. Repayments of money you lent are saved as income so the account
 * balance is right, but the loan going out was never spending: counting them would inflate income.
 */
const isEarning = (t: Transaction) => !(t.type === 'income' && t.linkType === 'loan');

/**
 * Rule-based financial health. Plain arithmetic with conventional thresholds, so it is exact,
 * instant and works on every phone. The on-device assistant only explains these numbers.
 * `money` formats amounts in the reasons; screens pass useMoneyText() so "Hide amounts" masks them.
 */
export function financialHealth(input: HealthInput, today: YMD, money: (p: Paise) => string = formatINR): HealthMetric[] {
  // Only months since tracking began: averaging over months with no entries at all would make a
  // new user's income look a third of what it is (and their EMIs three times as heavy).
  const live = input.transactions.filter(isLive);
  const first = live.reduce<string | null>((a, t) => (a === null || t.occurredAt < a ? t.occurredAt : a), null);
  const since = first ? monthKey(isoToYMD(first)) : null;
  const months = since ? lastCompleteMonths(today, HEALTH_MONTHS).filter((m) => m >= since) : [];
  const earning = live.filter(isEarning);
  const totals = months.map((m) => monthTotals(earning, m));
  const income = totals.reduce((a, t) => a + t.income, 0);
  const expense = totals.reduce((a, t) => a + t.expense, 0);
  const avgIncome = months.length ? Math.round(income / months.length) : 0;
  const span = months.length === 1 ? `${shortMonth(months[0])} (the only full month tracked)` : `the last ${months.length} full months`;
  // Why there is no figure: nothing recorded yet, or tracking began this month.
  const noData = !since
    ? 'No entries yet.'
    : !months.length
      ? `Tracking started in ${shortMonth(since)}: this needs one full month of entries.`
      : `No income recorded in ${span}.`;
  const out: HealthMetric[] = [];

  // Savings rate: share of income not spent.
  if (income <= 0) {
    out.push({ key: 'savings_rate', label: 'Savings rate', value: '—', status: 'unknown', reason: noData });
  } else {
    const rate = (income - expense) / income;
    out.push({
      key: 'savings_rate',
      label: 'Savings rate',
      value: pct(rate),
      status: rate >= 0.2 ? 'good' : rate >= 0 ? 'watch' : 'risk',
      reason: `Income ${money(income)} and spending ${money(expense)} over ${span}. ${rate >= 0.2 ? 'Saving at least 20% is healthy.' : rate >= 0 ? 'Below the 20% many planners aim for.' : 'Spending more than you earn.'}`,
    });
  }

  // EMI-to-income (lenders' FOIR): above ~50% most banks stop lending.
  const emi = monthlyEmi(input.loans, input.transactions, today);
  if (!emi) {
    out.push({ key: 'emi_to_income', label: 'EMIs vs income', value: '0%', status: 'good', reason: 'No open loan EMIs.' });
  } else if (avgIncome <= 0) {
    out.push({ key: 'emi_to_income', label: 'EMIs vs income', value: '—', status: 'unknown', reason: `EMIs of ${money(emi)} a month. ${noData}` });
  } else {
    const ratio = emi / avgIncome;
    out.push({
      key: 'emi_to_income',
      label: 'EMIs vs income',
      value: pct(ratio),
      status: ratio <= 0.3 ? 'good' : ratio <= 0.5 ? 'watch' : 'risk',
      reason: `EMIs of ${money(emi)} a month against average income of ${money(avgIncome)}. ${ratio <= 0.3 ? 'Comfortable.' : ratio <= 0.5 ? 'Above 30%: little room for new loans.' : 'Above 50%: most lenders treat this as overstretched.'}`,
    });
  }

  // Credit utilisation across cards with a known limit: above 30% starts to hurt a credit score.
  const cards = input.cards.filter((c) => !c.deletedAt && c.creditLimit);
  if (!cards.length) {
    out.push({ key: 'card_utilisation', label: 'Card utilisation', value: '—', status: 'unknown', reason: 'No credit cards with a limit set.' });
  } else {
    const owed = cards.reduce((a, c) => a + Math.max(0, buildCardLedger(c, input.transactions, input.cardOverrides, today).outstanding), 0);
    const limit = cards.reduce((a, c) => a + (c.creditLimit ?? 0), 0);
    const ratio = owed / limit;
    out.push({
      key: 'card_utilisation',
      label: 'Card utilisation',
      value: pct(ratio),
      status: ratio <= 0.3 ? 'good' : ratio <= 0.5 ? 'watch' : 'risk',
      reason: `${money(owed)} owed on limits of ${money(limit)}. ${ratio <= 0.3 ? 'Under 30% is good for your credit score.' : 'Above 30% can lower your credit score.'}`,
    });
  }

  // Budgets this month.
  const usage = budgetUsage(input.budgets, input.transactions, monthKey(today));
  if (!usage.length) {
    out.push({ key: 'budgets', label: 'Budgets', value: '—', status: 'unknown', reason: 'No budgets set for this month.' });
  } else {
    const over = usage.filter((u) => u.level === 'over').length;
    const warn = usage.filter((u) => u.level === 'warn').length;
    out.push({
      key: 'budgets',
      label: 'Budgets',
      value: `${over} of ${usage.length} over`,
      status: over === 0 && warn === 0 ? 'good' : over * 2 > usage.length ? 'risk' : 'watch',
      reason: over ? `${over} of ${usage.length} budgets are already over this month.` : warn ? `${warn} of ${usage.length} budgets are close to the limit.` : `All ${usage.length} budgets are on track.`,
    });
  }
  return out;
}
