/**
 * Saving investments (data/investments.ts) against an in-memory stand-in for db/repo: the store
 * holds live rows as the app's does, `all` keeps deleted ones for restore.
 */
import { summarizeHoldings } from '@/domain/investments';
import { monthTotals } from '@/domain/transactions';
import { DEFAULT_SETTINGS, EMPTY_TABLES, getState } from '@/db/store';
import { at, txn } from '../../domain/__tests__/fixtures';

const mockAll = new Map<string, Record<string, unknown>>();
let mockN = 0;
jest.mock('@/db/repo', () => {
  const { getState: state } = jest.requireActual('@/db/store');
  const put = (table: string, row: Record<string, unknown>) => {
    mockAll.set(`${table}:${row.id}`, row);
    state().putRow(table, row);
    return row;
  };
  return {
    insert: async (table: string, data: Record<string, unknown>) =>
      put(table, { scope: 'household', ...data, id: data.id ?? `${table}-${++mockN}`, createdAt: `2026-10-01T00:00:${String(++mockN).padStart(2, '0')}Z`, updatedAt: String(++mockN), deletedAt: null, deviceId: 'me' }),
    update: async (table: string, id: string, patch: Record<string, unknown>) => put(table, { ...mockAll.get(`${table}:${id}`)!, ...patch, updatedAt: String(++mockN) }),
    remove: async (table: string, id: string) => void put(table, { ...mockAll.get(`${table}:${id}`)!, deletedAt: 'now' }),
    restore: async (table: string, id: string) => put(table, { ...mockAll.get(`${table}:${id}`)!, deletedAt: null }),
    findById: (table: string, id: string) => (state().tables[table] as { id: string }[]).find((r) => r.id === id),
    insertMany: async () => [],
  };
});

// Imported after the mock.
/* eslint-disable import/first */
import { deleteTransaction, restoreTransaction } from '../actions';
import { deleteInvestment, saveExchange, saveInvestment, setPrice, type InvestmentInput } from '../investments';
/* eslint-enable import/first */

const tables = () => getState().tables;
const gold: InvestmentInput = {
  side: 'buy',
  holding: { assetClass: 'gold', form: 'coin', fundType: null, name: '24K gold coin', symbol: null, unit: 'g', purity: '999', memberId: null },
  tradeDate: '2026-10-12',
  amount: 75_000_00,
  quantity: 10_000,
  unitPrice: 7_400_00,
  charges: 0,
  taxes: 1_000_00,
  refRate: null,
  cash: { amount: 75_000_00, method: 'upi', accountId: null, cardId: null },
  note: null,
  scope: 'household',
};

beforeEach(() => {
  mockAll.clear();
  getState().setAll(EMPTY_TABLES, { deviceId: 'me', deviceName: 'Me', householdId: 'h', householdName: 'Home', selfMemberId: '', onboarded: true }, DEFAULT_SETTINGS);
});

describe('saving investments', () => {
  it('links the holding, the trade and the money both ways, and the money is not spending', async () => {
    const trade = await saveInvestment(gold);
    const [holding] = tables().holdings;
    const [money] = tables().transactions;
    expect(holding).toMatchObject({ name: '24K gold coin', unit: 'g', memberId: null });
    expect(trade).toMatchObject({ holdingId: holding.id, txnId: money.id, amount: 75_000_00, quantity: 10_000 });
    expect(money).toMatchObject({ type: 'transfer', linkType: 'investment', linkId: trade.id, amount: 75_000_00, payee: '24K gold coin', categoryId: null, flags: null });
    expect(monthTotals(tables().transactions, '2026-10')).toMatchObject({ expense: 0, invested: 75_000_00 });
  });

  it('records a sale as money taken out, and a gift with no money at all', async () => {
    const buy = await saveInvestment(gold);
    await saveInvestment({ ...gold, side: 'sell', holding: { id: buy.holdingId }, amount: 40_000_00, quantity: 5_000, taxes: 0, cash: { ...gold.cash!, amount: 40_000_00 } });
    expect(tables().transactions.find((t) => t.flags === 'sale')).toMatchObject({ amount: 40_000_00, linkType: 'investment' });
    expect(monthTotals(tables().transactions, '2026-10').invested).toBe(35_000_00);

    const gift = await saveInvestment({ ...gold, holding: { id: buy.holdingId }, amount: 30_000_00, quantity: 4_000, cash: null });
    expect(gift.txnId).toBeNull();
    const [s] = summarizeHoldings(tables().holdings, tables().trades, tables().transactions);
    // 10 g bought, 5 g sold (cost ₹37,500), 4 g received: 9 g held at ₹37,500 + ₹30,000.
    expect(s).toMatchObject({ quantity: 9_000, invested: 67_500_00 });
    expect(s.realised[0].gain).toBe(2_500_00);
  });

  it('edits in place, and drops the money when it becomes a gift', async () => {
    const buy = await saveInvestment(gold);
    await saveInvestment({ ...gold, holding: { id: buy.holdingId }, amount: 76_000_00, cash: { ...gold.cash!, amount: 76_000_00 } }, { tradeId: buy.id });
    expect(tables().trades).toHaveLength(1);
    expect(tables().transactions).toEqual([expect.objectContaining({ id: buy.txnId, amount: 76_000_00 })]);
    await saveInvestment({ ...gold, holding: { id: buy.holdingId }, cash: null }, { tradeId: buy.id });
    expect(tables().transactions).toHaveLength(0);
    expect(tables().trades[0].txnId).toBeNull();
  });

  it('turns an older expense filed under Investments into the purchase, without a second payment', async () => {
    const old = txn({ id: 'old', categoryId: 'cat_invest', amount: 75_000_00, occurredAt: at('2026-09-01') });
    mockAll.set('transactions:old', old as never);
    getState().putRow('transactions', old);
    const trade = await saveInvestment(gold, { fromTxnId: 'old' });
    expect(tables().transactions).toEqual([expect.objectContaining({ id: 'old', type: 'transfer', linkType: 'investment', linkId: trade.id, categoryId: null })]);
  });

  it('deletes the trade with its money, and undo brings both back', async () => {
    const buy = await saveInvestment(gold);
    await deleteTransaction(buy.txnId!);
    expect(tables().trades).toHaveLength(0);
    await restoreTransaction(buy.txnId!);
    expect(tables().trades).toHaveLength(1);
    await deleteInvestment(buy.id);
    expect(tables().transactions).toHaveLength(0);
  });

  it('trades in old jewellery: only the difference is paid, the new piece costs its full price', async () => {
    const old = await saveInvestment({ ...gold, holding: { ...(gold.holding as object), form: 'jewellery', name: 'Old chain' } as never, amount: 40_000_00, quantity: 10_000 });
    const x = await saveExchange({
      date: '2026-10-15',
      old: { holdingId: old.holdingId, quantity: null, value: 70_000_00, deductions: 2_000_00 },
      buy: { ...gold, holding: { ...(gold.holding as object), form: 'jewellery', name: 'New necklace' } as never, amount: 1_10_000_00, quantity: 14_000 },
      pay: { method: 'card', accountId: null, cardId: 'c1' },
      note: null,
      scope: 'household',
    });
    expect(x.cash).toBe(40_000_00);
    expect(x.sale.txnId).toBeNull();
    const paid = tables().transactions.find((t) => t.id === x.purchase.txnId)!;
    expect(paid).toMatchObject({ amount: 40_000_00, method: 'card', cardId: 'c1', flags: null });
    const [necklace, chain] = ['New necklace', 'Old chain'].map((n) => summarizeHoldings(tables().holdings, tables().trades, tables().transactions).find((s) => s.holding.name === n)!);
    expect(necklace).toMatchObject({ invested: 1_10_000_00, quantity: 14_000 });
    expect(chain).toMatchObject({ soldOut: true });
    expect(chain.realised[0].gain).toBe(30_000_00);
  });

  it('when the old piece is worth more, the difference comes back with the sale', async () => {
    const old = await saveInvestment({ ...gold, amount: 1_00_000_00 });
    const x = await saveExchange({
      date: '2026-10-15',
      old: { holdingId: old.holdingId, quantity: null, value: 1_20_000_00, deductions: 0 },
      buy: { ...gold, holding: { id: old.holdingId }, amount: 1_00_000_00 },
      pay: { method: 'card', accountId: 'a1', cardId: 'c1' },
      note: null,
      scope: 'household',
    });
    expect(x.purchase.txnId).toBeNull();
    expect(tables().transactions.find((t) => t.id === x.sale.txnId)).toMatchObject({ amount: 20_000_00, method: 'bank', flags: 'sale' });
  });

  it('sets one gold rate for every holding of that purity', async () => {
    const a = await saveInvestment(gold);
    await saveInvestment({ ...gold, holding: { ...(gold.holding as object), name: 'Another coin' } as never });
    await saveInvestment({ ...gold, holding: { ...(gold.holding as object), name: '22K chain', purity: '916' } as never });
    expect(await setPrice(a.holdingId, 7_800_00, { sameMetal: true })).toBe(2);
    expect(tables().holdings.filter((h) => h.priceNow === 7_800_00).map((h) => h.name).sort()).toEqual(['24K gold coin', 'Another coin']);
  });
});

