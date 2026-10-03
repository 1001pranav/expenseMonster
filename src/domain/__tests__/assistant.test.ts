import { answer, factLines, SYSTEM_PROMPT } from '../assistant/answer';
import { checkGrounding, numbersIn } from '../assistant/grounding';
import { financeTools, type FinanceSnapshot } from '../assistant/tools';
import { financialHealth, monthlyEmi } from '../health';
import type { Budget, Category, Loan } from '../types';
import { base, card, txn } from './fixtures';

const TODAY = '2026-09-20';

const loan = (over: Partial<Loan> = {}): Loan => ({
  ...base(),
  name: 'Home loan',
  direction: 'borrowed',
  kind: 'home',
  lender: 'SBI',
  memberId: null,
  principal: 20_00_000_00,
  ratePa: 8.5,
  interestType: 'reducing',
  tenureMonths: 240,
  firstEmiDate: '2024-01-05',
  emi: 17_356_00,
  paidBeforeTracking: 0,
  closed: 0,
  upiId: null,
  note: null,
  ...over,
});

const category = (id: string, name: string): Category => ({ ...base({ id }), name, icon: 'x', color: '#000', kind: 'expense', parentId: null, sortOrder: 0 });
const budget = (categoryId: string, amount: number): Budget => ({ ...base(), categoryId, month: '*', amount });

const salary = (month: string, amount = 1_00_000_00) => txn({ type: 'income', amount, occurredAt: `${month}-01T04:00:00.000Z`, method: 'bank' as never });

function snapshot(over: Partial<FinanceSnapshot> = {}): FinanceSnapshot {
  return { transactions: [], loans: [], cards: [], cardOverrides: [], billers: [], bills: [], policies: [], incomes: [], categories: [], budgets: [], ...over };
}

describe('grounding', () => {
  it('reads Indian-formatted amounts, percents and dates', () => {
    expect(numbersIn('You spent ₹1,20,000.50, up 12% since 2026-09-01')).toEqual([120000.5, 12, 2026, 9, 1]);
  });

  it('accepts a reply whose numbers all come from tool results', () => {
    const src = JSON.stringify({ spending: '₹12,400', change: 'up 8%', month: '2026-09' });
    expect(checkGrounding('September spending is ₹12,400, up 8%.', [src]).ok).toBe(true);
  });

  it('rejects a number the model made up or computed itself', () => {
    const src = JSON.stringify({ food: '₹4,000', travel: '₹2,500' });
    const g = checkGrounding('Food and travel together were ₹6,500.', [src]);
    expect(g.ok).toBe(false);
    expect(g.unsupported).toEqual([6500]);
  });

  it('allows numbers the user typed and trivial ones', () => {
    expect(checkGrounding('Saving ₹5,000 a month is possible with 1 change.', ['Can I save 5000 a month?']).ok).toBe(true);
  });
});

describe('financial health', () => {
  const months = ['2026-06', '2026-07', '2026-08'];

  it('uses only complete months for the savings rate', () => {
    const transactions = [
      ...months.map((m) => salary(m)),
      ...months.map((m) => txn({ amount: 70_000_00, occurredAt: `${m}-10T06:00:00.000Z` })),
      // The month in progress is ignored even though it would look terrible.
      txn({ amount: 5_00_000_00, occurredAt: '2026-09-05T06:00:00.000Z' }),
    ];
    const rate = financialHealth({ transactions, loans: [], cards: [], cardOverrides: [], budgets: [] }, TODAY).find((m) => m.key === 'savings_rate')!;
    expect(rate.value).toBe('30%');
    expect(rate.status).toBe('good');
  });

  it('rates EMIs against average income', () => {
    const transactions = months.map((m) => salary(m, 60_000_00));
    const loans = [loan({ emi: 35_000_00 })];
    const emi = financialHealth({ transactions, loans, cards: [], cardOverrides: [], budgets: [] }, TODAY).find((m) => m.key === 'emi_to_income')!;
    expect(emi.value).toBe('58%');
    expect(emi.status).toBe('risk');
  });

  it('ignores closed, lent and deleted loans in monthly EMI', () => {
    expect(monthlyEmi([loan({ emi: 100 }), loan({ emi: 200, closed: 1 }), loan({ emi: 300, direction: 'lent' }), loan({ emi: 400, deletedAt: 'x' })])).toBe(100);
  });

  it('reports unknown instead of guessing when there is no data', () => {
    const all = financialHealth({ transactions: [], loans: [], cards: [], cardOverrides: [], budgets: [] }, TODAY);
    expect(all.find((m) => m.key === 'savings_rate')!.status).toBe('unknown');
    expect(all.find((m) => m.key === 'card_utilisation')!.status).toBe('unknown');
  });

  it('computes card utilisation from the ledger', () => {
    const transactions = [txn({ amount: 40_000_00, method: 'card', cardId: 'card-1', occurredAt: '2026-09-18T06:00:00.000Z' })];
    const util = financialHealth({ transactions, loans: [], cards: [card({ createdAt: '2026-01-01T00:00:00.000Z' })], cardOverrides: [], budgets: [] }, TODAY).find((m) => m.key === 'card_utilisation')!;
    expect(util.value).toBe('40%');
    expect(util.status).toBe('watch');
  });
});

describe('finance tools', () => {
  const food = category('cat-food', 'Food');
  const fuel = category('cat-fuel', 'Fuel');
  const snap = snapshot({
    categories: [food, fuel],
    budgets: [budget('cat-food', 5_000_00)],
    transactions: [
      txn({ amount: 4_500_00, categoryId: 'cat-food', payee: 'Swiggy', occurredAt: '2026-09-05T06:00:00.000Z' }),
      txn({ amount: 1_200_00, categoryId: 'cat-food', payee: 'Swiggy', occurredAt: '2026-08-15T06:00:00.000Z' }),
      txn({ amount: 2_000_00, categoryId: 'cat-fuel', payee: 'HP Petrol', occurredAt: '2026-09-07T06:00:00.000Z' }),
      txn({ amount: 9_999_00, categoryId: 'cat-fuel', payee: 'Deleted', occurredAt: '2026-09-08T06:00:00.000Z', deletedAt: 'x' }),
      txn({ amount: 3_000_00, categoryId: 'cat-food', payee: 'Draft', occurredAt: '2026-09-09T06:00:00.000Z', status: 'pending' as never }),
    ],
  });
  const tools = financeTools(snap, TODAY);

  it('returns pre-formatted figures and ignores deleted and unconfirmed rows', () => {
    const r = tools.spending_by_category.run({}) as { total_spending: string; categories: { category: string; amount: string; share: string }[] };
    expect(r.total_spending).toBe('₹6,500');
    expect(r.categories[0]).toEqual({ category: 'Food', amount: '₹4,500', share: '69%' });
  });

  it('searches payees across months with a total', () => {
    const r = tools.find_transactions.run({ query: 'swiggy' }) as { match_count: number; total: string };
    expect(r.match_count).toBe(2);
    expect(r.total).toBe('₹5,700');
  });

  it('reports budget usage', () => {
    const r = tools.budget_status.run({}) as { budgets: { category: string; used: string; status: string }[] };
    expect(r.budgets[0]).toMatchObject({ category: 'Food', used: '90%', status: 'close to limit' });
  });

  it('clamps and sanitises arguments instead of trusting the model', () => {
    const r = tools.spending_by_category.run({ month: 'last month', top: 500 }) as { month: string; categories: unknown[] };
    expect(r.month).toBe('2026-09');
    expect(r.categories.length).toBeLessThanOrEqual(10);
  });

  it('clips long text from payees and notes', () => {
    const t = financeTools(snapshot({ transactions: [txn({ payee: 'x'.repeat(300), occurredAt: '2026-09-02T06:00:00.000Z' })] }), TODAY);
    const r = t.find_transactions.run({}) as { transactions: { payee: string }[] };
    expect(r.transactions[0].payee.length).toBe(40);
  });

  it('describes loans from the amortisation schedule', () => {
    const r = financeTools(snapshot({ loans: [loan()] }), TODAY).loans.run({}) as { loan_count: number; loans: { emi: string; direction: string }[] };
    expect(r.loan_count).toBe(1);
    expect(r.loans[0]).toMatchObject({ emi: '₹17,356', direction: 'you owe' });
  });

  it('every tool runs on an empty database', () => {
    const empty = financeTools(snapshot(), TODAY);
    for (const [name, tool] of Object.entries(empty)) expect(() => tool.run({})).not.toThrow(name);
  });
});

describe('answer loop', () => {
  const monthRun = { toolName: 'month_summary', result: { month: '2026-09', spending: '₹12,400', saved: '₹3,100' } };

  it('returns a verified answer when the numbers come from tools', async () => {
    const gen = jest.fn().mockResolvedValueOnce({ text: 'You spent ₹12,400 in September.', toolResults: [monthRun] });
    const a = await answer(gen, 'How much did I spend?', [], []);
    expect(a).toMatchObject({ verified: true, toolsUsed: ['month_summary'], text: 'You spent ₹12,400 in September.' });
    expect(gen).toHaveBeenCalledTimes(1);
    expect(gen.mock.calls[0][0][0]).toEqual({ role: 'system', content: SYSTEM_PROMPT });
  });

  it('retries once, naming the made-up number', async () => {
    const gen = jest
      .fn()
      .mockResolvedValueOnce({ text: 'You spent ₹15,500.', toolResults: [monthRun] })
      .mockResolvedValueOnce({ text: 'You spent ₹12,400.', toolResults: [] });
    const a = await answer(gen, 'How much did I spend?', [], []);
    expect(a.verified).toBe(true);
    const retry = gen.mock.calls[1][0];
    expect(retry[retry.length - 1].content).toContain('15500');
  });

  it('falls back to the tool figures when the model keeps inventing numbers', async () => {
    const gen = jest.fn().mockResolvedValue({ text: 'About ₹99,999.', toolResults: [monthRun] });
    const a = await answer(gen, 'How much did I spend?', [], []);
    expect(a.verified).toBe(false);
    expect(a.text).not.toContain('99,999');
    expect(a.text).toContain('spending: ₹12,400');
  });

  it('lets follow-ups repeat figures from earlier verified answers', async () => {
    const gen = jest.fn().mockResolvedValueOnce({ text: 'Yes, ₹3,100 is what you saved.', toolResults: [] });
    const a = await answer(gen, 'Was that what I saved?', [], [JSON.stringify(monthRun.result)]);
    expect(a.verified).toBe(true);
  });

  it('keeps only recent history', async () => {
    const history = Array.from({ length: 20 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content: `m${i}` }));
    const gen = jest.fn().mockResolvedValueOnce({ text: 'Ok.', toolResults: [] });
    await answer(gen, 'q', history, []);
    expect(gen.mock.calls[0][0]).toHaveLength(1 + 6 + 1);
  });

  it('factLines lists only top-level scalar figures', () => {
    expect(factLines({ a_b: '₹1', n: 2, list: [1], obj: {} })).toEqual(['a b: ₹1', 'n: 2']);
  });
});

describe('financial health with hidden amounts', () => {
  it('formats every amount through the given formatter', () => {
    const transactions = ['2026-06', '2026-07', '2026-08'].map((m) => txn({ type: 'income', amount: 50_000_00, occurredAt: `${m}-01T04:00:00.000Z` }));
    const all = financialHealth({ transactions, loans: [loan()], cards: [], cardOverrides: [], budgets: [] }, TODAY, () => '₹ ••••');
    const text = all.map((m) => m.reason).join(' ');
    expect(text).toContain('₹ ••••');
    expect(text).not.toMatch(/₹\d/);
  });
});
