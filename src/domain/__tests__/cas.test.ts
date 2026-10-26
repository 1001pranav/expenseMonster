import { anonymise, anonymiseText, casDate, closingTriple, kindOf, parseCas, statementDate, toLines, type Word } from '../cas';

/** Words of one printed line: [x, text] pairs, 7pt type, each character about 3.5pt wide. */
const line = (page: number, y: number, cells: [number, string][]): Word[] =>
  cells.flatMap(([x, text]) => {
    // A cell's words, as the PDF reader reports them: one per word, a space apart.
    let at = x;
    return text.split(' ').map((w) => {
      const word: Word = [page, at, y, w.length * 3.5, 7, w];
      at += w.length * 3.5 + 2;
      return word;
    });
  });

const CDSL: Word[] = [
  ...line(1, 40, [[40, 'Central Depository Services (India) Limited'], [300, 'Consolidated Account Statement']]),
  ...line(1, 60, [[40, 'Statement for the period from 01-10-2026 to 31-10-2026']]),
  ...line(2, 100, [[40, 'HOLDING STATEMENT AS ON 31-10-2026']]),
  ...line(2, 120, [[40, 'ISIN'], [110, 'Security'], [260, 'Current Bal'], [320, 'Frozen Bal'], [380, 'Free Bal'], [440, 'Market Price'], [500, 'Value (`)']]),
  // Shares: quantity first, then balances, then price and value.
  ...line(2, 135, [[40, 'INE009A01021'], [110, 'INFOSYS LIMITED - EQ'], [260, '25.000'], [320, '--'], [380, '25.000'], [440, '1,520.40'], [500, '38,010.00']]),
  // Pledged: the pledged sub-balance printed before the total; only the total adds up.
  ...line(2, 150, [[40, 'INE040A01034'], [110, 'HDFC BANK LIMITED'], [260, '10.000'], [320, '40.000'], [380, '30.000'], [440, '1,700.00'], [500, '68,000.00']]),
  // Damaged by the overlay: the numbers don't add up, so the row is not used.
  ...line(2, 165, [[40, 'INE002A01018'], [110, 'RELIANCE INDUSTRIES'], [260, '12.000'], [440, '2,950.00'], [500, '9,999.00']]),
  ...line(2, 180, [[40, 'Sub Total'], [500, '1,06,010.00']]),
  ...line(3, 100, [[40, 'MUTUAL FUND UNITS HELD AS ON 31-10-2026']]),
  // Fund: name, ISIN, folio, ARN/DIRECT, units, NAV, cost, value, TER…
  ...line(3, 120, [[40, 'PARAG PARIKH FLEXI CAP - DIRECT GROWTH'], [200, 'INF879O01027'], [260, '12345678/90'], [310, 'DIRECT'], [350, '1,234.567'], [400, '92.4567'], [450, '1,00,000.00'], [510, '1,14,144.21'], [570, '0.63']]),
  // A long name wraps: its numbers sit on the line just below.
  ...line(3, 140, [[40, 'AXIS LIQUID FUND - DIRECT PLAN -'], [200, 'INF846K01CH7']]),
  ...line(3, 147, [[40, 'GROWTH OPTION'], [350, '10.000'], [400, '2,801.1234'], [510, '28,011.23']]),
];

const NSDL: Word[] = [
  ...line(1, 40, [[40, 'National Securities Depository Limited'], [300, 'Consolidated Account Statement']]),
  ...line(1, 60, [[40, 'Holdings as on 30-Sep-2026']]),
  // Summary form: face value, quantity, price, value.
  ...line(1, 100, [[40, 'INE009A01021'], [110, 'INFOSYS LIMITED'], [260, '5.00'], [320, '25'], [380, '1,500.00'], [440, '37,500.00']]),
  // The same holding again in the detailed table.
  ...line(2, 100, [[40, 'INE009A01021'], [110, 'INFOSYS LIMITED'], [260, '25'], [320, '25'], [380, '1,500.00'], [440, '37,500.00']]),
];

describe('reading a consolidated account statement', () => {
  it('reads shares and funds whose numbers add up, and nothing else', () => {
    const s = parseCas(CDSL);
    expect(s).toMatchObject({ depository: 'CDSL', asOf: '2026-10-31', unreadable: 1 });
    expect(s.rows).toEqual([
      { isin: 'INE009A01021', name: 'INFOSYS LIMITED - EQ', kind: 'equity', quantity: 25_000, price: 1520_40, value: 38_010_00, invested: null, folio: null, maturity: null },
      { isin: 'INE040A01034', name: 'HDFC BANK LIMITED', kind: 'equity', quantity: 40_000, price: 1700_00, value: 68_000_00, invested: null, folio: null, maturity: null },
      { isin: 'INF879O01027', name: 'PARAG PARIKH FLEXI CAP - DIRECT GROWTH', kind: 'fund', quantity: 1_234_567, price: 92_46, value: 1_14_144_21, invested: 1_00_000_00, folio: '12345678/90', maturity: null },
      { isin: 'INF846K01CH7', name: 'AXIS LIQUID FUND - DIRECT PLAN - GROWTH OPTION', kind: 'fund', quantity: 10_000, price: 2801_12, value: 28_011_23, invested: null, folio: null, maturity: null },
    ]);
  });

  it('reads NSDL summary rows and counts a holding printed twice once', () => {
    const s = parseCas(NSDL);
    expect(s).toMatchObject({ depository: 'NSDL', asOf: '2026-09-30', unreadable: 0 });
    expect(s.rows.map((r) => [r.isin, r.quantity, r.value])).toEqual([['INE009A01021', 25_000, 37_500_00]]);
  });

  it('finds the quantity, price and value among a row of numbers', () => {
    expect(closingTriple([5, 25, 1500, 37500])).toEqual({ q: 25, p: 1500, v: 37500, invested: null });
    expect(closingTriple([1234.567, 92.4567, 100000, 114144.21, 0.63])).toMatchObject({ q: 1234.567, v: 114144.21, invested: 100000 });
    expect(closingTriple([12, 2950, 9999])).toBeNull();
    expect(closingTriple([1, 2])).toBeNull();
  });

  it('keeps words a character apart in one cell, and splits at column gaps', () => {
    const [l] = toLines(line(1, 10, [[40, 'INFOSYS LIMITED'], [200, '25']]));
    expect(l.cells.map((c) => c.text)).toEqual(['INFOSYS LIMITED', '25']);
  });

  it('reads the dates statements use', () => {
    expect(casDate('31-10-2026')).toBe('2026-10-31');
    expect(casDate('5/1/2026')).toBe('2026-01-05');
    expect(casDate('30-Sep-2026')).toBe('2026-09-30');
    expect(casDate('31-13-2026')).toBeNull();
    expect(statementDate('Statement for the period from 01-10-2026 to 31-10-2026')).toBe('2026-10-31');
    expect(statementDate('as on 30-09-2026 … AS ON : 31-10-2026')).toBe('2026-10-31');
  });

  it('anonymises: the layout and amounts stay, the person goes', () => {
    expect(anonymiseText('INE009A01021')).toBe('INE009A01021');
    expect(anonymiseText('HOLDING STATEMENT AS ON 31-10-2026')).toBe('HOLDING STATEMENT AS ON 31-10-2026');
    expect(anonymiseText('PRANAV KUMAR (PAN: ABCDE1234F)')).toBe('xxxxxx xxxxx (PAN: **********)');
    expect(anonymiseText('Client Id : 12345678 BO ID 1208160012345678')).toBe('Client Id : ######## BO ID ################');
    expect(anonymiseText('Folio 12345678/90 1,14,144.21 25.000')).toBe('Folio ########/## 1,14,144.21 25.000');
    expect(anonymiseText('DP ID IN301549 someone@mail.com 9876543210')).toBe('DP ID ######## *******@****.*** ##########');
    expect(anonymise([[1, 2, 3, 4, 7, 'RAJ']])).toEqual([[1, 2, 3, 4, 7, 'xxx']]);
  });

  it('tells shares, funds and bonds apart: by section heading, else by the ISIN, else not at all', () => {
    expect(kindOf('INE009A01021', null)).toBe('equity'); // type 01: equity shares
    expect(kindOf('INF879O01027', null)).toBe('fund');
    expect(kindOf('INE020B08443', null)).toBe('bond'); // type 08: debenture
    expect(kindOf('IN0020230010', null)).toBe('bond'); // issuer 0: central government security
    expect(kindOf('INE040A03010', null)).toBe('other'); // type 03: preference share
    expect(kindOf('INE0CCU25019', null)).toBe('other'); // type 25: REIT
    expect(kindOf('INE009A01021', 'other')).toBe('other'); // listed under, say, Preference Shares
    // Heading and security type disagree: left for the person, not picked.
    expect(kindOf('INE009A01021', 'bond')).toBe('other');
    // An ISIN of an unlisted type: the heading says what it is.
    expect(kindOf('INE0CCU25019', 'equity')).toBe('equity');
    // What the ISIN says outright wins over any heading.
    expect(kindOf('IN0020230010', 'equity')).toBe('bond');
    expect(kindOf('INF879O01027', 'equity')).toBe('fund');
  });

  it('reads bonds under their heading, with the maturity date, and leaves unsupported sections for review', () => {
    const s = parseCas([
      ...line(1, 40, [[40, 'National Securities Depository Limited'], [300, 'Consolidated Account Statement']]),
      ...line(1, 60, [[40, 'Holdings as on 31-10-2026']]),
      ...line(1, 100, [[40, 'Corporate Bonds (C)']]),
      // ISIN | name | frequency | coupon % | maturity | number | face value | value
      ...line(1, 120, [[40, 'INE020B07HN6'], [110, 'REC LIMITED 8.10% NCD'], [230, 'Once a year'], [290, '8.10'], [330, '15-03-2030'], [400, '10'], [440, '1,000.00'], [500, '10,000.00']]),
      ...line(1, 160, [[40, 'Preference Shares (P)']]),
      ...line(1, 180, [[40, 'INE040A03010'], [110, 'SOME CO 7% PREF'], [400, '5'], [440, '100.00'], [500, '500.00']]),
      ...line(2, 100, [[40, 'Equity Shares']]),
      // A government security in a table with no bond heading: the ISIN says so.
      ...line(2, 120, [[40, 'IN0020230010'], [110, 'GOI 7.18% 2033'], [400, '100'], [440, '101.25'], [500, '10,125.00']]),
    ]);
    expect(s.rows.map((r) => [r.isin, r.kind, r.name, r.quantity, r.price, r.value, r.maturity])).toEqual([
      ['INE020B07HN6', 'bond', 'REC LIMITED 8.10% NCD', 10_000, 1000_00, 10_000_00, '2030-03-15'],
      ['INE040A03010', 'other', 'SOME CO 7% PREF', 5_000, 100_00, 500_00, null],
      ['IN0020230010', 'bond', 'GOI 7.18% 2033', 100_000, 101_25, 10_125_00, null],
    ]);
  });
});

