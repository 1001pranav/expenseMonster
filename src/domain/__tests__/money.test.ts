import { formatINR, parseAmount, splitEvenly } from '../money';

describe('money', () => {
  it('formats with Indian grouping', () => {
    expect(formatINR(12345678900)).toBe('₹12,34,56,789');
    expect(formatINR(123456)).toBe('₹1,234.56');
    expect(formatINR(-50000)).toBe('-₹500');
    expect(formatINR(50000, { signed: true })).toBe('+₹500');
    expect(formatINR(100, { decimals: 'always' })).toBe('₹1.00');
  });

  it('formats compactly in lakh / crore', () => {
    expect(formatINR(150000_00, { compact: true })).toBe('₹1.5L');
    expect(formatINR(2_50_00_000_00, { compact: true })).toBe('₹2.5Cr');
    expect(formatINR(12_500_00, { compact: true })).toBe('₹12.5K');
  });

  it('parses amounts from messy text', () => {
    expect(parseAmount('₹1,23,456.50')).toBe(12345650);
    expect(parseAmount('Rs. 1840')).toBe(184000);
    expect(parseAmount('INR 99.9')).toBe(9990);
    expect(parseAmount('abc')).toBeNull();
  });

  it('splits without losing paise', () => {
    const parts = splitEvenly(1000, 3);
    expect(parts).toEqual([334, 333, 333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
  });
});
