import { calcEmi } from '../emi';
import { financialYear, taxSummary } from '../tax';
import type { Loan, Policy } from '../types';
import { base, txn } from './fixtures';

const policy = (over: Partial<Policy>): Policy => ({
  ...base(),
  type: 'health',
  insurer: 'Star Health',
  policyNo: null,
  name: 'Family floater',
  sumAssured: null,
  premium: 30_000_00,
  frequency: 'yearly',
  nextDueDate: '2027-06-01',
  endDate: null,
  coveredMemberIds: null,
  nominee: null,
  autopay: 0,
  active: 1,
  ...over,
});

const homeLoan = (over: Partial<Loan> = {}): Loan => {
  const principal = 40_00_000_00;
  return {
    ...base({ id: 'loan-home' }),
    name: 'SBI home loan',
    direction: 'borrowed',
    kind: 'home',
    lender: 'SBI',
    memberId: null,
    principal,
    ratePa: 8.5,
    interestType: 'reducing',
    tenureMonths: 240,
    firstEmiDate: '2025-05-05',
    emi: calcEmi(principal, 8.5, 240),
    paidBeforeTracking: 0,
    closed: 0,
    upiId: null,
    note: null,
    ...over,
  };
};

describe('financialYear', () => {
  it('runs April to March', () => {
    expect(financialYear('2026-10-01')).toEqual({ start: '2026-04-01', end: '2027-03-31', label: 'FY 2026-27' });
    expect(financialYear('2027-03-31').label).toBe('FY 2026-27');
    expect(financialYear('2027-04-01').label).toBe('FY 2027-28');
  });
});

describe('taxSummary', () => {
  it('caps 80D and only counts premiums paid in this financial year', () => {
    const p = policy({ id: 'pol-1' });
    const s = taxSummary(
      {
        policies: [p],
        loans: [],
        transactions: [
          txn({ amount: 30_000_00, linkType: 'policy', linkId: 'pol-1', occurredAt: '2026-06-01T06:00:00.000Z' }),
          // Last financial year: ignored.
          txn({ amount: 28_000_00, linkType: 'policy', linkId: 'pol-1', occurredAt: '2026-03-20T06:00:00.000Z' }),
        ],
      },
      '2026-10-01',
    );
    const d = s.sections.find((x) => x.section === '80D')!;
    expect(d.lines[0].amount).toBe(30_000_00);
    expect(d.claimed).toBe(25_000_00);
    expect(d.headroom).toBe(0);
  });

  it('splits paid home-loan EMIs into 80C principal and 24(b) interest', () => {
    const loan = homeLoan({ paidBeforeTracking: 18 }); // May 2025 … Oct 2026
    const s = taxSummary({ policies: [], loans: [loan], transactions: [] }, '2026-10-20');
    const c = s.sections.find((x) => x.section === '80C')!;
    const b = s.sections.find((x) => x.section === '24b')!;
    // Apr–Oct 2026: EMIs 12–18, i.e. seven instalments.
    expect(c.lines[0].amount + b.lines[0].amount).toBe(loan.emi * 7);
    expect(b.lines[0].amount).toBeGreaterThan(c.lines[0].amount);
    expect(c.headroom).toBe(1_50_000_00 - c.lines[0].amount);
  });

  it('ignores unpaid EMIs, lent money and non-deductible policies', () => {
    const s = taxSummary(
      {
        policies: [policy({ id: 'car', type: 'vehicle' })],
        loans: [homeLoan({ paidBeforeTracking: 0 }), homeLoan({ id: 'lent', direction: 'lent', paidBeforeTracking: 18 })],
        transactions: [txn({ linkType: 'policy', linkId: 'car', occurredAt: '2026-06-01T06:00:00.000Z' })],
      },
      '2026-10-20',
    );
    expect(s.sections.every((x) => x.lines.length === 0)).toBe(true);
  });
});
