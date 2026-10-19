import type { CasRow } from '../cas';
import { byIsin, matchCas } from '../casImport';
import type { Holding } from '../types';
import { base } from './fixtures';

const row = (over: Partial<CasRow>): CasRow => ({ isin: 'INE009A01021', name: 'INFOSYS', kind: 'equity', quantity: 10_000, price: 1500_00, value: 15_000_00, invested: null, folio: null, ...over });
const holding = (over: Partial<Holding>): Holding => ({
  ...base(),
  assetClass: 'equity',
  form: null,
  fundType: null,
  name: 'Infosys',
  symbol: null,
  unit: 'share',
  purity: null,
  memberId: null,
  priceNow: null,
  priceAsOf: null,
  priceSource: null,
  closed: 0,
  note: null,
  ...over,
});

describe('importing a statement', () => {
  it('adds up one ISIN held in two accounts or folios', () => {
    const lines = byIsin([row({ quantity: 10_000, value: 15_000_00 }), row({ quantity: 5_000, value: 7_500_00 }), row({ isin: 'INF879O01027', kind: 'fund', invested: 90_00 })]);
    expect(lines.map((l) => [l.isin, l.quantity, l.value])).toEqual([
      ['INE009A01021', 15_000, 22_500_00],
      ['INF879O01027', 10_000, 15_000_00],
    ]);
    expect(byIsin([row({ kind: 'fund', invested: 100 }), row({ kind: 'fund', invested: null })])[0].invested).toBeNull();
  });

  it("matches by ISIN to this person's or joint holdings, never another member's", () => {
    const [line] = byIsin([row({})]);
    const theirs = holding({ id: 'theirs', symbol: 'INE009A01021', memberId: 'priya' });
    const joint = holding({ id: 'joint', symbol: 'ine009a01021' });
    const mine = holding({ id: 'mine', symbol: 'INE009A01021', memberId: 'me' });
    expect(matchCas([line], [theirs, joint, mine], [], 'me')[0].holding?.id).toBe('mine');
    expect(matchCas([line], [theirs, joint], [], 'me')[0].holding?.id).toBe('joint');
    expect(matchCas([line], [theirs], [], 'me')[0].holding).toBeNull();
  });

  it('offers same-kind holdings without an ISIN to link by hand', () => {
    const [line] = byIsin([row({ isin: 'INF879O01027', kind: 'fund' })]);
    const fundByAmfiCode = holding({ id: 'f', assetClass: 'mf', unit: 'unit', symbol: '122639' });
    const share = holding({ id: 's' });
    const linked = holding({ id: 'l', assetClass: 'mf', unit: 'unit', symbol: 'INF846K01CH7' });
    expect(matchCas([line], [fundByAmfiCode, share, linked], [], null)[0].linkable.map((h) => h.id)).toEqual(['f']);
  });

  it("shows the app's quantity only when it is complete", () => {
    const [line] = byIsin([row({})]);
    const h = holding({ id: 'h', symbol: 'INE009A01021' });
    const complete = { holding: h, quantity: 8_000, quantityComplete: true } as never;
    expect(matchCas([line], [h], [complete], null)[0].appQuantity).toBe(8_000);
    expect(matchCas([line], [h], [{ ...(complete as object), quantityComplete: false } as never], null)[0].appQuantity).toBeNull();
  });
});
