import { applyAmountKey, groupAmount, toGroupedIndex, toRawIndex } from '../amountInput';

const at = (pos: number) => ({ start: pos, end: pos });

describe('amount input', () => {
  it('groups the Indian way', () => {
    expect(groupAmount('')).toBe('');
    expect(groupAmount('100')).toBe('100');
    expect(groupAmount('1000')).toBe('1,000');
    expect(groupAmount('100000.5')).toBe('1,00,000.5');
    expect(groupAmount('12345678.')).toBe('1,23,45,678.');
  });

  it('maps cursor positions across the commas', () => {
    const g = groupAmount('100000'); // 1,00,000
    expect(toRawIndex(g, 2)).toBe(1); // after "1,"
    expect(toRawIndex(g, g.length)).toBe(6);
    expect(toGroupedIndex(g, 1)).toBe(1);
    expect(toGroupedIndex(g, 2)).toBe(3);
    expect(toGroupedIndex(g, 6)).toBe(g.length);
  });

  it('edits in the middle instead of only at the end', () => {
    // 100 → 200: put the cursor after the 1, delete it, type 2.
    const del = applyAmountKey('100', at(1), 'del');
    expect(del).toEqual({ raw: '00', cursor: 0 });
    expect(applyAmountKey(del.raw, at(del.cursor), '2')).toEqual({ raw: '200', cursor: 1 });
    expect(applyAmountKey('100', at(1), '5')).toEqual({ raw: '1500', cursor: 2 });
    expect(applyAmountKey('1500', { start: 1, end: 3 }, '9')).toEqual({ raw: '190', cursor: 2 });
  });

  it('keeps the amount well-formed', () => {
    expect(applyAmountKey('12.5', at(1), '.')).toEqual({ raw: '12.5', cursor: 1 });
    expect(applyAmountKey('12.50', at(5), '1')).toEqual({ raw: '12.50', cursor: 5 });
    expect(applyAmountKey('', at(0), '.')).toEqual({ raw: '0.', cursor: 2 });
    expect(applyAmountKey('0', at(1), '7')).toEqual({ raw: '7', cursor: 1 });
    expect(applyAmountKey('999999999', at(9), '9')).toEqual({ raw: '999999999', cursor: 9 });
    expect(applyAmountKey('25', at(0), 'del')).toEqual({ raw: '25', cursor: 0 });
    expect(applyAmountKey('25', at(1), 'clear')).toEqual({ raw: '', cursor: 0 });
  });
});
