import { amortization, calcEmi, loanProgress, simulatePrepayment } from '../emi';

describe('EMI', () => {
  it('matches standard reducing-balance EMI', () => {
    // ₹10,00,000 at 10% for 120 months = ₹13,215 (bank calculators show 13,215.07)
    expect(calcEmi(10_00_000_00, 10, 120)).toBe(13_215_00);
    // ₹50,00,000 at 8.5% for 20 years = ₹43,391
    expect(calcEmi(50_00_000_00, 8.5, 240)).toBe(43_391_00);
    expect(calcEmi(12_000_00, 0, 12)).toBe(1_000_00);
  });

  it('amortises to exactly zero', () => {
    const rows = amortization(10_00_000_00, 10, 120, '2026-01-05');
    expect(rows).toHaveLength(120);
    expect(rows[119].balance).toBe(0);
    expect(rows.reduce((a, r) => a + r.principal, 0)).toBe(10_00_000_00);
    expect(rows[0].interest).toBe(8_333_33);
    expect(rows[1].date).toBe('2026-02-05');
  });

  it('tracks progress and overdue EMIs', () => {
    const rows = amortization(1_20_000_00, 12, 12, '2026-01-10');
    const p = loanProgress(rows, 3, '2026-06-01');
    expect(p.emisPaid).toBe(3);
    expect(p.emisLeft).toBe(9);
    expect(p.nextDue?.date).toBe('2026-04-10');
    expect(p.overdueCount).toBe(2); // Apr and May not paid
  });

  it('shows prepayment saves more interest when reducing tenure', () => {
    const emi = calcEmi(30_00_000_00, 9, 240);
    const tenure = simulatePrepayment(30_00_000_00, 9, 240, emi, 24, 5_00_000_00, 'reduce_tenure');
    const lower = simulatePrepayment(30_00_000_00, 9, 240, emi, 24, 5_00_000_00, 'reduce_emi');
    expect(tenure.monthsSaved).toBeGreaterThan(50);
    expect(lower.newEmi).toBeLessThan(emi);
    expect(tenure.interestSaved).toBeGreaterThan(lower.interestSaved);
  });
});
