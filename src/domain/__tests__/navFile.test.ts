import { findScheme, navDate, navPaise, parseNavFile, searchSchemes } from '../navFile';

// Shape of AMFI's file: header, blank lines, category and fund-house lines between scheme rows.
const NEW = `Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date

Open Ended Schemes(Equity Scheme - Flexi Cap Fund)

PPFAS Mutual Fund

122639;INF879O01027;-;Parag Parikh Flexi Cap Fund - Direct Plan - Growth;Direct;Growth;92.4567;17-Oct-2026
122640;INF879O01035;INF879O01043;Parag Parikh Flexi Cap Fund - Regular Plan - IDCW;Regular;IDCW;N.A.;17-Oct-2026
`;
const OLD = `Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date
Open Ended Schemes(Debt Scheme - Liquid Fund)
Axis Mutual Fund
120389;INF846K01CH7;-;Axis Liquid Fund - Direct Plan - Growth Option;2801.1234;14-May-2025
`;

describe('AMFI NAV file', () => {
  it('reads the current layout (Plan and Option before the NAV) by column name', () => {
    expect(parseNavFile(NEW)).toEqual([{ code: '122639', name: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth', isins: ['INF879O01027'], nav: 92_46, date: '2026-10-17' }]);
  });

  it('still reads the older six-column layout', () => {
    expect(parseNavFile(OLD)).toEqual([{ code: '120389', name: 'Axis Liquid Fund - Direct Plan - Growth Option', isins: ['INF846K01CH7'], nav: 2801_12, date: '2025-05-14' }]);
  });

  it('refuses something that is not the NAV file, and a file missing a needed column', () => {
    expect(() => parseNavFile('<html>Service unavailable</html>')).toThrow('Not an AMFI NAV file');
    expect(() => parseNavFile('Scheme Code;Scheme Name;Net Asset Value\n1;X;10')).toThrow('a column is missing');
  });

  it('parses NAVs and dates strictly', () => {
    expect(navPaise('106.7901')).toBe(106_79);
    expect(navPaise('N.A.')).toBeNull();
    expect(navPaise('0')).toBeNull();
    expect(navDate('1-Aug-2026')).toBe('2026-08-01');
    expect(navDate('2026-08-01')).toBeNull();
  });

  it('finds a scheme by code or ISIN, and by words of its name', () => {
    const s = [...parseNavFile(NEW), ...parseNavFile(OLD)];
    expect(findScheme(s, '122639')?.code).toBe('122639');
    expect(findScheme(s, ' inf846k01ch7 ')?.code).toBe('120389');
    expect(findScheme(s, null)).toBeUndefined();
    expect(searchSchemes(s, 'flexi parag direct').map((x) => x.code)).toEqual(['122639']);
    expect(searchSchemes(s, 'a')).toEqual([]);
  });
});
