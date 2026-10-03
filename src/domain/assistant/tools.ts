import { budgetUsage, spendByCategory } from '../budget';
import { buildCardLedger } from '../creditCard';
import { addMonths, isoToYMD, monthKey, type YMD } from '../dates';
import { computeDues, loanEmisPaid, type DuesInput } from '../dues';
import { loanProgress, scheduleFor } from '../emi';
import { financialHealth } from '../health';
import { formatINR, type Paise } from '../money';
import { comparableChange, isLive, monthTotals } from '../transactions';
import type { Budget, Category } from '../types';

/**
 * Read-only tools the on-device assistant may call. Every figure is computed here by the same
 * domain code the screens use and returned pre-formatted ("₹12,400", "34%") so the model only
 * copies numbers, never calculates them. Nothing here writes, pays or sends anything.
 *
 * The JSON-schema shape matches expo-ai-kit's tool `parameters` (type/properties/enum/items);
 * ranges are not validated by the runtime, so every argument is clamped here.
 */

export interface FinanceSnapshot extends DuesInput {
  categories: Category[];
  budgets: Budget[];
}

export interface FinanceTool {
  description: string;
  parameters: Record<string, unknown>;
  run: (args: Record<string, unknown>) => unknown;
}

const MAX_TEXT = 40;
/** Payee names and notes come from SMS/OCR/other people: keep them short and plainly data. */
const clip = (s: string | null | undefined) => (s ? s.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT) : null);
const money = (p: Paise) => formatINR(p);
const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;

function monthArg(value: unknown, today: YMD): string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : monthKey(today);
}

function intArg(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, n));
}

const MONTH_PARAM = { type: 'string', description: 'Month as YYYY-MM. Omit for the current month.' };

export function financeTools(snap: FinanceSnapshot, today: YMD): Record<string, FinanceTool> {
  const catName = new Map(snap.categories.map((c) => [c.id, c.name]));
  const nameOf = (id: string | null) => (id ? (catName.get(id) ?? 'Uncategorised') : 'Uncategorised');
  const live = snap.transactions.filter(isLive);

  return {
    month_summary: {
      description: 'Income, spending and savings for one month, compared with the month before.',
      parameters: { type: 'object', properties: { month: MONTH_PARAM } },
      run: (args) => {
        const month = monthArg(args.month, today);
        const inProgress = month === monthKey(today);
        const uptoDay = inProgress ? Number(today.slice(8)) : 31;
        const cur = monthTotals(live, month, uptoDay);
        const prevMonth = monthKey(addMonths(`${month}-01`, -1));
        const prev = monthTotals(live, prevMonth, uptoDay);
        const change = comparableChange(cur.expense, prev.expense);
        return {
          month,
          in_progress: inProgress,
          income: money(cur.income),
          spending: money(cur.expense),
          saved: money(cur.net),
          credit_card_spending: money(cur.cardSpend),
          previous_month: prevMonth,
          previous_month_spending_same_days: money(prev.expense),
          spending_change: change === null ? 'no data for previous month' : `${change >= 0 ? 'up' : 'down'} ${pct(Math.abs(change))}`,
        };
      },
    },

    spending_by_category: {
      description: 'Where money went in a month, biggest categories first.',
      parameters: { type: 'object', properties: { month: MONTH_PARAM, top: { type: 'integer', description: 'How many categories (1-10).' } } },
      run: (args) => {
        const month = monthArg(args.month, today);
        const top = intArg(args.top, 5, 1, 10);
        const rows = [...spendByCategory(live, month)].sort((a, b) => b[1] - a[1]);
        const total = rows.reduce((a, [, v]) => a + v, 0);
        return {
          month,
          total_spending: money(total),
          categories: rows.slice(0, top).map(([id, v]) => ({ category: nameOf(id), amount: money(v), share: total ? pct(v / total) : '0%' })),
          other_categories: Math.max(0, rows.length - top),
        };
      },
    },

    budget_status: {
      description: 'Budget limits and how much of each is used this month.',
      parameters: { type: 'object', properties: { month: MONTH_PARAM } },
      run: (args) => {
        const month = monthArg(args.month, today);
        const usage = budgetUsage(snap.budgets, live, month);
        return {
          month,
          budget_count: usage.length,
          budgets: usage.map((u) => ({
            category: nameOf(u.categoryId),
            limit: money(u.limit),
            spent: money(u.spent),
            left: money(Math.max(0, u.limit - u.spent)),
            used: pct(u.ratio),
            status: u.level === 'over' ? 'over budget' : u.level === 'warn' ? 'close to limit' : 'on track',
          })),
        };
      },
    },

    upcoming_dues: {
      description: 'Bills, EMIs, credit card payments and premiums that are overdue or due soon.',
      parameters: { type: 'object', properties: { days: { type: 'integer', description: 'Look this many days ahead (1-45).' } } },
      run: (args) => {
        const days = intArg(args.days, 14, 1, 45);
        const dues = computeDues(snap, today, days).filter((d) => !d.incoming);
        const known = dues.filter((d) => d.amount !== null);
        return {
          today,
          due_count: dues.length,
          overdue_count: dues.filter((d) => d.state === 'overdue').length,
          total_known_amount: money(known.reduce((a, d) => a + (d.amount ?? 0), 0)),
          dues: dues.slice(0, 15).map((d) => ({
            name: clip(d.title),
            amount: d.amount === null ? 'unknown' : money(d.amount),
            date: d.date,
            status: d.state,
          })),
        };
      },
    },

    loans: {
      description: 'Open loans: EMI, amount still owed, EMIs left, interest left and payoff date.',
      parameters: { type: 'object', properties: {} },
      run: () => {
        const open = snap.loans.filter((l) => !l.deletedAt && !l.closed && l.tenureMonths > 0);
        return {
          loan_count: open.length,
          loans: open.map((l) => {
            const p = loanProgress(scheduleFor(l), loanEmisPaid(l, live), today);
            return {
              name: clip(l.name),
              direction: l.direction === 'borrowed' ? 'you owe' : 'owed to you',
              emi: money(l.emi),
              interest_rate: `${l.ratePa}%`,
              outstanding_principal: money(p.outstanding),
              emis_left: p.emisLeft,
              interest_left: money(p.interestLeft),
              payoff_date: p.payoffDate,
              overdue_emis: p.overdueCount,
            };
          }),
        };
      },
    },

    credit_cards: {
      description: 'Credit cards: amount owed, limit, utilisation and days until the payment is due.',
      parameters: { type: 'object', properties: {} },
      run: () => {
        const cards = snap.cards.filter((c) => !c.deletedAt);
        return {
          card_count: cards.length,
          cards: cards.map((c) => {
            const ledger = buildCardLedger(c, live, snap.cardOverrides, today);
            return {
              name: clip(c.name),
              owed: money(Math.max(0, ledger.outstanding)),
              limit: c.creditLimit ? money(c.creditLimit) : 'not set',
              utilisation: ledger.utilisation === null ? 'unknown' : pct(ledger.utilisation),
              days_until_due: ledger.daysToDue,
            };
          }),
        };
      },
    },

    find_transactions: {
      description: 'Search transactions by payee, note or category name, optionally in one month. Returns the total and the latest matches.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Text to look for, e.g. "swiggy" or "fuel". Omit to list all.' },
          month: { type: 'string', description: 'Month as YYYY-MM. Omit to search the last 12 months.' },
          type: { type: 'string', enum: ['expense', 'income', 'any'] },
          limit: { type: 'integer', description: 'How many to list (1-20).' },
        },
      },
      run: (args) => {
        const q = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
        const month = typeof args.month === 'string' ? monthArg(args.month, today) : null;
        const since = monthKey(addMonths(`${monthKey(today)}-01`, -11));
        const type = args.type === 'income' || args.type === 'expense' ? args.type : null;
        const limit = intArg(args.limit, 10, 1, 20);
        const hits = live
          .filter((t) => (type ? t.type === type : t.type === 'expense' || t.type === 'income'))
          .filter((t) => {
            const m = monthKey(isoToYMD(t.occurredAt));
            return month ? m === month : m >= since;
          })
          .filter((t) => !q || [t.payee, t.note, t.vpa, nameOf(t.categoryId)].some((s) => s?.toLowerCase().includes(q)))
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
        return {
          period: month ?? `${since} to ${monthKey(today)}`,
          match_count: hits.length,
          total: money(hits.reduce((a, t) => a + (t.type === 'income' ? -t.amount : t.amount), 0)),
          note: type ? undefined : 'total is spending minus income among matches',
          transactions: hits.slice(0, limit).map((t) => ({
            date: isoToYMD(t.occurredAt),
            type: t.type,
            amount: money(t.amount),
            payee: clip(t.payee),
            category: nameOf(t.categoryId),
            note: clip(t.note),
          })),
        };
      },
    },

    financial_health: {
      description: 'Overall financial health: savings rate, EMIs versus income, credit card utilisation and budgets, each rated good, watch or risk.',
      parameters: { type: 'object', properties: {} },
      run: () => ({
        today,
        metrics: financialHealth(snap, today).map((m) => ({
          name: m.label,
          value: m.value,
          status: m.status,
          why: m.reason,
        })),
      }),
    },
  };
}
