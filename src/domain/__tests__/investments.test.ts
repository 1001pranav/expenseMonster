import { buildCardLedger } from '../creditCard';
import {
  defaultHoldingName,
  derive,
  fieldToDerive,
  formatQuantity,
  investedByOwner,
  ledger,
  legacyInvestmentExpenses,
  parseQuantity,
  portfolioValue,
  premiumOverMetal,
  quantityText,
  sameMetal,
  summarizeHoldings,
  unitFor,
} from '../investments';
import { monthTotals } from '../transactions';
import type { Holding, Trade } from '../types';
import { at, base, card, txn } from './fixtures';

const holding = (over: Partial<Holding>): Holding => ({
  ...base(),
  assetClass: 'gold',
  form: 'jewellery',
  fundType: null,
  name: '22K gold',
  symbol: null,
  unit: 'g',
  purity: '916',
  memberId: null,
  priceNow: null,
  priceAsOf: null,
  closed: 0,
  note: null,
  ...over,
});
const trade = (over: Partial<Trade>): Trade => ({
  ...base(),
  holdingId: 'h',
  side: 'buy',
  tradeDate: '2026-10-12',
  amount: 0,
  quantity: null,
  unitPrice: null,
  charges: 0,
  taxes: 0,
  refRate: null,
  refSource: null,
  txnId: null,
  ...over,
});

describe('quantities', () => {
  it('are kept in thousandths, so grams and fund units add up exactly', () => {
    expect(parseQuantity('10.5')).toBe(10_500);
    expect(parseQuantity('0.001')).toBe(1);
    expect(parseQuantity('12.345')).toBe(12_345);
    expect(parseQuantity('')).toBeNull();
    expect(parseQuantity('1.2345')).toBeUndefined();
    expect(parseQuantity('abc')).toBeUndefined();
    expect(quantityText(10_500)).toBe('10.5');
    expect(formatQuantity(10_500, 'g')).toBe('10.5 g');
    expect(formatQuantity(1000, 'share')).toBe('1 share');
    expect(formatQuantity(3000, 'share')).toBe('3 shares');
    expect(unitFor('gold', 'etf')).toBe('unit');
    expect(unitFor('gold', 'coin')).toBe('g');
  });
});

describe('amount, quantity and price', () => {
  const n = { amount: null, quantity: 10_000, unitPrice: 7_000_00, charges: 0, taxes: 0 };

  it('fills in the field touched least recently once two are set', () => {
    expect(fieldToDerive(['unitPrice', 'quantity'], n)).toBe('amount');
    expect(fieldToDerive(['quantity'], n)).toBeNull();
    expect(fieldToDerive(['amount', 'quantity'], { ...n, amount: 70_000_00 })).toBe('unitPrice');
    // Touching the same field twice doesn't count as two.
    expect(fieldToDerive(['quantity', 'quantity'], n)).toBeNull();
  });

  it('includes charges and taxes in the amount, not in the price', () => {
    // 10 g at ₹7,000/g, ₹8,000 making charges, 3% GST on ₹78,000.
    const jewellery = { ...n, charges: 8_000_00, taxes: 2_340_00 };
    expect(derive('amount', jewellery)).toBe(80_340_00);
    expect(derive('unitPrice', { ...jewellery, amount: 80_340_00, unitPrice: null })).toBe(7_000_00);
    expect(derive('quantity', { ...jewellery, amount: 80_340_00, quantity: null })).toBe(10_000);
    expect(derive('unitPrice', { ...jewellery, amount: 5_000_00, unitPrice: null })).toBeNull(); // less than the charges
    expect(derive('unitPrice', { ...n, amount: 1_000_00, quantity: null })).toBeNull();
  });
});

describe('holdings', () => {
  const gold = holding({ id: 'h', priceNow: 7_500_00 });
  const buy1 = txn({ id: 't1', type: 'transfer', linkType: 'investment', amount: 70_000_00, occurredAt: at('2026-09-10') });
  const buy2 = txn({ id: 't2', type: 'transfer', linkType: 'investment', amount: 36_000_00, occurredAt: at('2026-10-12') });
  const b1 = trade({ txnId: 't1', tradeDate: '2026-09-10', amount: 70_000_00, quantity: 10_000 });
  const b2 = trade({ txnId: 't2', tradeDate: '2026-10-12', amount: 36_000_00, quantity: 5_000, charges: 1_000_00 });

  it('adds up what was put in, and values it only when every quantity is known', () => {
    const [s] = summarizeHoldings([gold], [b1, b2], [buy1, buy2]);
    expect(s).toMatchObject({ invested: 106_000_00, costs: 1_000_00, quantity: 15_000, quantityComplete: true, value: 112_500_00, soldOut: false });
    const [partial] = summarizeHoldings([gold], [b1, { ...b2, quantity: null }], [buy1, buy2]);
    expect(partial).toMatchObject({ invested: 106_000_00, quantity: 10_000, quantityComplete: false, value: null });
  });

  it('drops trades whose money was deleted or rejected, and keeps trades with no money (a gift)', () => {
    const gift = trade({ tradeDate: '2026-08-01', amount: 30_000_00, quantity: 5_000 });
    const [s] = summarizeHoldings([gold], [b1, b2, gift], [buy1, { ...buy2, deletedAt: 'x' }]);
    expect(s).toMatchObject({ invested: 100_000_00, quantity: 15_000 });
  });

  it('splits net worth by member, joint holdings on their own', () => {
    const mine = holding({ id: 'm', memberId: 'me' });
    const s = summarizeHoldings([gold, mine], [b1, { ...b2, holdingId: 'm' }], [buy1, buy2]);
    expect(investedByOwner(s)).toEqual({ total: 106_000_00, joint: 70_000_00, byMember: { me: 36_000_00 } });
  });

  it('names new holdings sensibly', () => {
    expect(defaultHoldingName('gold', 'jewellery', '916')).toBe('22K gold');
    expect(defaultHoldingName('gold', 'coin', '999')).toBe('24K gold coin');
    expect(defaultHoldingName('silver', 'coin', '999')).toBe('Silver coin');
    expect(defaultHoldingName('mf', 'sip', null)).toBe('SIP instalment');
  });
});

describe('selling', () => {
  const shares = holding({ id: 's', assetClass: 'equity', unit: 'share', form: null, purity: null, name: 'INFY' });
  // 10 shares at ₹1,000, then 10 at ₹1,500.
  const buys = [trade({ tradeDate: '2026-01-10', amount: 10_000_00, quantity: 10_000 }), trade({ tradeDate: '2026-03-10', amount: 15_000_00, quantity: 10_000 })];
  const sell = (over: Partial<Trade>) => trade({ side: 'sell', tradeDate: '2026-06-01', ...over });

  it('takes the cost from the earliest purchases first', () => {
    // 15 sold for ₹27,000: cost = 10 × ₹1,000 + 5 × ₹1,500 = ₹17,500.
    const s = ledger(shares, [...buys, sell({ amount: 27_000_00, quantity: 15_000 })]);
    expect(s.realised[0]).toMatchObject({ proceeds: 27_000_00, cost: 17_500_00, gain: 9_500_00, beyondRecorded: false });
    expect(s).toMatchObject({ quantity: 5_000, invested: 7_500_00, soldOut: false });
  });

  it('closes the holding when everything is sold, and records a loss as a negative gain', () => {
    const s = ledger(shares, [...buys, sell({ amount: 20_000_00, quantity: 20_000 })]);
    expect(s.realised[0].gain).toBe(-5_000_00);
    expect(s).toMatchObject({ quantity: 0, invested: 0, soldOut: true });
  });

  it('"sold all of it" works even when quantities were never entered', () => {
    const jewellery = holding({ id: 'j' });
    const s = ledger(jewellery, [trade({ tradeDate: '2026-01-10', amount: 80_000_00 }), sell({ amount: 95_000_00, quantity: null })]);
    expect(s.realised[0]).toMatchObject({ cost: 80_000_00, gain: 15_000_00 });
    expect(s.soldOut).toBe(true);
    // With no purchase recorded, the cost is unknown, not zero.
    expect(ledger(jewellery, [sell({ amount: 95_000_00, quantity: null })]).realised[0]).toMatchObject({ cost: null, gain: null });
  });

  it("doesn't guess the cost of part of a purchase whose quantity is unknown", () => {
    const s = ledger(holding({ id: 'j' }), [trade({ tradeDate: '2026-01-10', amount: 80_000_00 }), sell({ amount: 40_000_00, quantity: 5_000 })]);
    expect(s.realised[0]).toMatchObject({ cost: null, gain: null });
  });

  it('marks a sale of more than was recorded: the gain is at least this much', () => {
    const s = ledger(shares, [buys[0], sell({ amount: 30_000_00, quantity: 15_000 })]);
    expect(s.realised[0]).toMatchObject({ cost: 10_000_00, gain: 20_000_00, beyondRecorded: true });
    expect(s.soldOut).toBe(true);
  });

  it('takes charges out of what a sale receives', () => {
    expect(derive('amount', { amount: null, quantity: 10_000, unitPrice: 1_500_00, charges: 20_00, taxes: 5_00 }, 'sell')).toBe(14_975_00);
  });

  it('counts sale proceeds as taken out of investments, not as income', () => {
    const t = [
      txn({ type: 'transfer', linkType: 'investment', amount: 10_000_00, occurredAt: at('2026-10-02') }),
      txn({ type: 'transfer', linkType: 'investment', flags: 'sale', amount: 25_000_00, occurredAt: at('2026-10-20') }),
    ];
    expect(monthTotals(t, '2026-10')).toMatchObject({ income: 0, expense: 0, invested: -15_000_00 });
  });
});

describe('investments are not spending', () => {
  it('count as invested, leave spending and the savings figure alone', () => {
    const t = [
      txn({ type: 'income', amount: 1_00_000_00, method: 'bank', occurredAt: at('2026-10-01') }),
      txn({ amount: 30_000_00, occurredAt: at('2026-10-02') }),
      txn({ type: 'transfer', linkType: 'investment', amount: 20_000_00, occurredAt: at('2026-10-05') }),
    ];
    expect(monthTotals(t, '2026-10')).toMatchObject({ income: 1_00_000_00, expense: 30_000_00, invested: 20_000_00, net: 70_000_00 });
  });

  it('still appear on the credit card bill when paid by card', () => {
    const c = card({ id: 'c', statementDay: 20, dueDay: 8, createdAt: '2026-09-01T00:00:00.000Z' });
    const goldOnCard = txn({ type: 'transfer', linkType: 'investment', method: 'card', cardId: 'c', amount: 50_000_00, occurredAt: at('2026-10-12') });
    expect(buildCardLedger(c, [goldOnCard], [], '2026-10-15').current.total).toBe(50_000_00);
  });

  it('finds older entries filed under Investments as spending', () => {
    const old = txn({ categoryId: 'cat_invest' });
    expect(legacyInvestmentExpenses([old, txn({ categoryId: 'cat_food' }), { ...old, id: 'x', deletedAt: 'y' }])).toEqual([old]);
  });
});

describe('value and making charges', () => {
  it('values only what has a price and a complete quantity, and says how many it could not', () => {
    const priced = { invested: 70_000_00, value: 75_000_00, soldOut: false };
    const noPrice = { invested: 20_000_00, value: null, soldOut: false };
    const sold = { invested: 0, value: null, soldOut: true };
    expect(portfolioValue([priced, noPrice, sold] as never)).toEqual({ invested: 90_000_00, value: 75_000_00, valuedCost: 70_000_00, unvalued: 1 });
  });

  it('shows how much went over the metal when the day rate was noted', () => {
    // 10 g at a ₹7,000 board rate (₹70,000 of metal), paid ₹80,340.
    expect(premiumOverMetal(trade({ amount: 80_340_00, quantity: 10_000, refRate: 7_000_00 }))).toEqual({ metal: 70_000_00, premium: 10_340_00, share: 10_340_00 / 70_000_00 });
    expect(premiumOverMetal(trade({ amount: 80_340_00, quantity: 10_000 }))).toBeNull();
    expect(premiumOverMetal(trade({ side: 'sell', amount: 1, quantity: 1, refRate: 1 }))).toBeNull();
  });

  it('applies one rate to the same metal and purity, by weight only', () => {
    const g22 = holding({});
    expect(sameMetal(g22, holding({ form: 'coin' }))).toBe(true);
    expect(sameMetal(g22, holding({ purity: '999' }))).toBe(false);
    expect(sameMetal(g22, holding({ form: 'etf', unit: 'unit' }))).toBe(false);
    expect(sameMetal(g22, holding({ form: 'sgb' }))).toBe(false);
  });
});
