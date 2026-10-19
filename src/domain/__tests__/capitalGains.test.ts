import { capitalGains, gainKindOf, isLongTerm } from '../capitalGains';
import { ledger } from '../investments';
import { financialYear } from '../tax';
import type { Holding, Trade } from '../types';
import { base } from './fixtures';

const holding = (over: Partial<Holding>): Holding => ({
  ...base(),
  assetClass: 'equity',
  form: null,
  fundType: null,
  name: 'INFY',
  symbol: null,
  unit: 'share',
  purity: null,
  memberId: null,
  priceNow: null,
  priceAsOf: null,
  priceSource: null,
  faceValue: null,
  couponRate: null,
  maturityDate: null,
  closed: 0,
  note: null,
  ...over,
});
const trade = (over: Partial<Trade>): Trade => ({ ...base(), holdingId: 'h', side: 'buy', tradeDate: '2025-01-10', amount: 0, quantity: null, unitPrice: null, charges: 0, taxes: 0, refRate: null, refSource: null, txnId: null, ...over });
const fy = financialYear('2026-10-01'); // FY 2026-27

describe('capital gains', () => {
  it('is long term only after more than the holding period', () => {
    expect(isLongTerm('2025-01-10', '2026-01-10', 12)).toBe(false);
    expect(isLongTerm('2025-01-10', '2026-01-11', 12)).toBe(true);
    expect(isLongTerm('2024-12-01', '2026-12-01', 24)).toBe(false);
  });

  it('splits one sale into short and long term by the purchases it used (FIFO)', () => {
    const infy = holding({});
    const s = ledger(infy, [
      trade({ tradeDate: '2025-01-10', amount: 1_00_000_00, quantity: 100_000 }), // 100 at ₹1,000
      trade({ tradeDate: '2026-06-01', amount: 1_50_000_00, quantity: 100_000 }), // 100 at ₹1,500
      // 150 sold at ₹2,000 on 1 Sep 2026: 100 long term (gain ₹1,00,000), 50 short term (gain ₹25,000).
      trade({ side: 'sell', tradeDate: '2026-09-01', amount: 3_00_000_00, quantity: 150_000 }),
    ]);
    const g = capitalGains([s], fy);
    expect(g.listedEquity).toEqual({ short: 25_000_00, long: 1_00_000_00 });
    // 20% of ₹25,000; 12.5% of (₹1,00,000 − ₹1,25,000 exempt) = 0.
    expect(g.tax).toEqual({ equityShort: 5_000_00, equityLong: 0, otherLong: 0 });
  });

  it('applies 24 months to physical gold; short-term gold goes to the slab rate', () => {
    const gold = holding({ assetClass: 'gold', form: 'jewellery', unit: 'g', name: '22K gold' });
    const s = ledger(gold, [
      trade({ tradeDate: '2024-05-01', amount: 6_00_000_00, quantity: 100_000 }),
      trade({ tradeDate: '2025-12-01', amount: 1_20_000_00, quantity: 10_000 }),
      trade({ side: 'sell', tradeDate: '2026-11-01', amount: 9_90_000_00, quantity: 110_000 }),
    ]);
    const g = capitalGains([s], fy);
    expect(g.otherAsset).toEqual({ long: 3_00_000_00, short: -30_000_00 });
    expect(g.tax.otherLong).toBe(37_500_00);
    expect(g.atSlabRate).toBe(0);
  });

  it("lists what it can't estimate, with the reason, instead of guessing", () => {
    const sale = [trade({ amount: 1_000_00, quantity: 1_000 }), trade({ side: 'sell', tradeDate: '2026-08-01', amount: 2_000_00, quantity: 1_000 })];
    const etf = ledger(holding({ assetClass: 'gold', form: 'etf', unit: 'unit' }), sale);
    const debt = ledger(holding({ assetClass: 'mf', fundType: 'debt', unit: 'unit' }), sale);
    const unknownFund = ledger(holding({ assetClass: 'mf', unit: 'unit' }), sale);
    const g = capitalGains([etf, debt, unknownFund], fy);
    expect(g.unestimated.map((u) => [u.gain, u.reason])).toEqual([
      [1_000_00, 'ETF and fund rules are unsettled'],
      [1_000_00, 'Tax depends on the fund and when it was bought'],
      [1_000_00, 'Set what the fund invests in'],
    ]);
    expect(g.listedEquity).toEqual({ short: 0, long: 0 });
    expect(gainKindOf(holding({ assetClass: 'mf', fundType: 'equity' }))).toBe('listedEquity');
    expect(gainKindOf(holding({ assetClass: 'gold', form: 'digital' }))).toBe('otherAsset');
  });

  it('only counts sales in the year, and not those under the older rules', () => {
    const s = ledger(holding({}), [
      trade({ tradeDate: '2023-01-01', amount: 1_000_00, quantity: 1_000 }),
      trade({ side: 'sell', tradeDate: '2024-07-01', amount: 2_000_00, quantity: 1_000 }),
    ]);
    expect(capitalGains([s], fy).unestimated).toEqual([]);
    expect(capitalGains([s], financialYear('2024-07-01')).unestimated[0].reason).toBe('Sold before 23 July 2024: older rules');
  });
});
