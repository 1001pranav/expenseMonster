import { applyFormat, buildPattern, describeFormat, isSafePattern, tokenize, type TokenRole } from '../parsers/custom';

const R = '2026-09-12';

function teach(sample: string, tagged: Record<string, TokenRole>) {
  const tokens = tokenize(sample);
  const tags = tokens.map((t) => tagged[t] ?? null);
  return { tokens, ...buildPattern(tokens, tags) };
}

describe('user-taught SMS formats', () => {
  // A made-up co-operative bank format the built-in parser doesn't know.
  const sample = 'MyCoop: Rs.1,250.00 withdrawn from SB XX4321 towards RAMESH KIRANA on 12-09-26. Txn 778899001122';
  const { pattern, roles } = teach(sample, {
    'Rs.1,250.00': 'amount',
    XX4321: 'account',
    RAMESH: 'payee',
    KIRANA: 'payee',
    '12-09-26.': 'date',
    '778899001122': 'ref',
  });
  const format = { pattern, roles: JSON.stringify(roles), direction: 'debit' as const, isCard: 0 as const, sender: 'MYCOOP', active: 1 as const };

  it('builds a safe pattern from tapped words', () => {
    expect(roles).toEqual(['amount', 'account', 'payee', 'date', 'ref']);
    expect(isSafePattern(pattern)).toBe(true);
  });

  it('parses other messages in the same format', () => {
    const p = applyFormat(format, 'VM-MYCOOP', 'MyCoop: Rs.89.50 withdrawn from SB XX4321 towards CITY MEDICAL STORE on 03-10-26. Txn 112233445566', R)!;
    expect(p).toMatchObject({ amount: 8950, payee: 'City Medical Store', accountLast4: '4321', date: '2026-10-03', ref: '112233445566', direction: 'debit' });
  });

  it('ignores other senders and non-matching messages', () => {
    expect(applyFormat(format, 'VM-HDFCBK', sample, R)).toBeNull();
    expect(applyFormat(format, 'VM-MYCOOP', 'MyCoop: your OTP is 123456', R)).toBeNull();
    expect(applyFormat({ ...format, active: 0 }, 'VM-MYCOOP', sample, R)).toBeNull();
  });

  it('reads a pasted message, which has no sender, by its pattern alone', () => {
    expect(applyFormat(format, '', sample, R)).toMatchObject({ amount: 125000, accountLast4: '4321' });
  });

  it('says in words what it looks for', () => {
    expect(describeFormat(pattern, roles)).toEqual([
      { role: 'amount', after: 'MyCoop:', skip: 0 },
      { role: 'account', after: 'from SB', skip: 0 },
      { role: 'payee', after: 'towards', skip: 0 },
      { role: 'date', after: 'on', skip: 0 },
      { role: 'ref', after: 'Txn', skip: 0 },
    ]);
    const hdfc = teach('Txn Rs.300.00 On HDFC Bank Card 6306 At *5905@pty', { 'Rs.300.00': 'amount', '*5905@pty': 'payee' });
    expect(describeFormat(hdfc.pattern, JSON.stringify(hdfc.roles))).toEqual([
      { role: 'amount', after: 'Txn', skip: 0 },
      { role: 'payee', after: 'At', skip: 0 },
    ]);
    expect(describeFormat('Rs\\s+\\S+\\s+(\\S+)', ['amount'])).toEqual([{ role: 'amount', after: 'Rs', skip: 1 }]);
    expect(describeFormat('x', 'not json')).toEqual([]);
  });

  it('rejects patterns outside the generated grammar', () => {
    expect(isSafePattern('(a+)+$')).toBe(false);
    expect(isSafePattern('(.*)*')).toBe(false);
    expect(isSafePattern('Spent\\s+(\\S+)\\s+at\\s+(.+?)\\s+on')).toBe(true);
    expect(applyFormat({ ...format, pattern: '(a+)+$' }, 'VM-MYCOOP', sample, R)).toBeNull();
  });
});
