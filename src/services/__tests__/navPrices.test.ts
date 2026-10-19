import type { Holding } from '@/domain/types';
import { DEFAULT_SETTINGS, EMPTY_TABLES } from '@/db/store';
import { base } from '../../domain/__tests__/fixtures';

jest.mock('../diagnostics', () => ({ logFailure: jest.fn(), logInfo: jest.fn() }));

const FILE = `Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date
Open Ended Schemes(Equity Scheme - Flexi Cap Fund)
PPFAS Mutual Fund
122639;INF879O01027;-;Parag Parikh Flexi Cap Fund - Direct Plan - Growth;Direct;Growth;92.4567;17-Oct-2026
`;
const fund = (over: Partial<Holding>): Holding => ({
  ...base(),
  assetClass: 'mf',
  form: 'sip',
  fundType: 'equity',
  name: 'PPFAS',
  symbol: null,
  unit: 'unit',
  purity: null,
  memberId: null,
  priceNow: null,
  priceAsOf: null,
  priceSource: null,
  closed: 0,
  note: null,
  ...over,
});

let calls: string[] = [];
const respond = (byUrl: Record<string, { status: number; body: string } | 'offline'>) => {
  globalThis.fetch = (async (url: string) => {
    calls.push(url);
    const r = byUrl[url];
    if (!r || r === 'offline') throw new TypeError('Network request failed');
    return { ok: r.status === 200, status: r.status, text: async () => r.body };
  }) as unknown as typeof fetch;
};

/** A fresh service (its download cache starts empty) with its own store, holding the family's funds. */
function load() {
  let mod!: typeof import('../navPrices');
  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-require-imports -- fresh module instances */
    mod = require('../navPrices');
    const { getState } = require('@/db/store');
    /* eslint-enable @typescript-eslint/no-require-imports */
    getState().setAll(
      { ...EMPTY_TABLES, holdings: [fund({ id: 'a', symbol: '122639', priceNow: 90_00 }), fund({ id: 'b', symbol: 'INF879O01027' }), fund({ id: 'c', name: 'Unlinked' }), fund({ id: 'g', assetClass: 'gold', symbol: '122639' })] },
      { deviceId: 'me', deviceName: 'Me', householdId: 'h', householdName: 'Home', selfMemberId: '', onboarded: true },
      DEFAULT_SETTINGS,
    );
  });
  return mod;
}

beforeEach(() => {
  calls = [];
});

describe('fund prices from AMFI', () => {
  it('matches funds by scheme code or ISIN and proposes, without saving', async () => {
    respond({ 'https://www.amfiindia.com/spages/NAVAll.txt': { status: 200, body: FILE } });
    const { proposals, unmatched } = await load().proposeFundPrices();
    expect(proposals.map((p) => [p.holding.id, p.current, p.scheme.nav, p.scheme.date])).toEqual([
      ['a', 90_00, 92_46, '2026-10-17'],
      ['b', null, 92_46, '2026-10-17'],
    ]);
    expect(unmatched.map((h) => h.id)).toEqual(['c']);
    // Proposed only: the holding still has its old price.
    expect(proposals[0].holding.priceNow).toBe(90_00);
  });

  it('downloads once for a few hours, and falls back to the second address', async () => {
    respond({ 'https://www.amfiindia.com/spages/NAVAll.txt': 'offline', 'https://portal.amfiindia.com/spages/NAVAll.txt': { status: 200, body: FILE } });
    const m = load();
    await m.loadSchemes();
    await m.loadSchemes();
    expect(calls).toEqual(['https://www.amfiindia.com/spages/NAVAll.txt', 'https://portal.amfiindia.com/spages/NAVAll.txt']);
  });

  it('says what went wrong in words a person can act on', async () => {
    respond({});
    await expect(load().loadSchemes()).rejects.toThrow("Couldn't reach AMFI. Check the connection, or enter prices by hand.");
    respond({ 'https://www.amfiindia.com/spages/NAVAll.txt': { status: 200, body: '<html>maintenance</html>' }, 'https://portal.amfiindia.com/spages/NAVAll.txt': { status: 200, body: 'Scheme Code;Net Asset Value\n1;2' } });
    await expect(load().loadSchemes()).rejects.toThrow('a column is missing. Enter prices by hand until the app is updated.');
  });
});
