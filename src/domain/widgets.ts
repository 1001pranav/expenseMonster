import { budgetUsage } from './budget';
import { monthKey, type YMD } from './dates';
import type { DueItem } from './dues';
import { formatINR, type Paise } from './money';
import { dayTotals, monthTotals } from './transactions';
import type { Budget, Transaction } from './types';

export const HIDDEN = '₹ ••••';

/**
 * What the home-screen widgets show (modules/home-widgets). Amounts are formatted here, so the
 * native side only places text; with "Hide amounts" on every amount is masked, so none is ever
 * written outside the encrypted database. The widgets re-render on their own every 30 minutes:
 * `date` / `month` let them show zero for a new day or month before the app has run again, and
 * dues carry their date so "in 3 days" is worked out on the day it is shown.
 */
export interface WidgetSnapshot {
  v: 1;
  date: YMD;
  month: string;
  hidden: boolean;
  /** Deep links (app scheme) the widgets open. */
  scheme: string;
  zero: string;
  today: { spent: string; payments: number };
  monthly: { spent: string; income: string; net: string; overspent: boolean; hasIncome: boolean };
  /** Share of the month's budget used (0–1+), or null with no budget. */
  budget: { used: number; label: string } | null;
  dues: { title: string; amount: string | null; date: YMD }[];
}

export interface WidgetInput {
  transactions: Transaction[];
  budgets: Budget[];
  dues: DueItem[];
  today: YMD;
  hideAmounts: boolean;
  scheme: string;
}

export function widgetSnapshot({ transactions, budgets, dues, today, hideAmounts, scheme }: WidgetInput): WidgetSnapshot {
  const month = monthKey(today);
  const confirmed = transactions.filter((t) => t.status === 'confirmed');
  const day = dayTotals(confirmed, today);
  const totals = monthTotals(confirmed, month);
  const limit = budgetUsage(budgets, confirmed, month).reduce((a, b) => a + b.limit, 0);
  const inr = (p: Paise) => (hideAmounts ? HIDDEN : formatINR(p, { decimals: 'never' }));
  return {
    v: 1,
    date: today,
    month,
    hidden: hideAmounts,
    scheme,
    zero: inr(0),
    today: { spent: inr(Math.max(0, day.expense)), payments: day.payments },
    monthly: {
      spent: inr(totals.expense),
      income: inr(totals.income),
      net: inr(Math.abs(totals.net)),
      overspent: totals.net < 0,
      hasIncome: totals.income > 0,
    },
    budget: limit
      ? {
          used: totals.expense / limit,
          label: hideAmounts ? `${Math.round((totals.expense / limit) * 100)}% of budget` : `${Math.round((totals.expense / limit) * 100)}% of ${formatINR(limit, { decimals: 'never' })}`,
        }
      : null,
    dues: dues
      .filter((d) => !d.incoming)
      .slice(0, 3)
      .map((d) => ({ title: d.title, amount: d.amount ? inr(d.amount) : null, date: d.date })),
  };
}
