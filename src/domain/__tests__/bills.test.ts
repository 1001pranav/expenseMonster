import { autopayMissing, matchBiller, pendingFixedBills, predictNextLpg, prepaidStatus, rechargeValidity, usageInsight, viewBill } from '../bills';
import { bill, biller, txn } from './fixtures';

describe('bills', () => {
  it('generates fixed bills for each missing cycle', () => {
    const rent = biller({ id: 'rent', type: 'rent', amountMode: 'fixed', fixedAmount: 25_000_00, billDay: 1, dueOffsetDays: 5 });
    const drafts = pendingFixedBills(rent, [], '2026-09-20', '2026-08-01');
    expect(drafts.map((d) => d.billDate)).toEqual(['2026-08-01', '2026-09-01']);
    expect(drafts[0].dueDate).toBe('2026-08-06');
    const again = pendingFixedBills(rent, [bill({ billerId: 'rent', billDate: '2026-09-01' })], '2026-09-28', '2026-08-01');
    expect(again.map((d) => d.billDate)).toEqual(['2026-10-01']);
  });

  it('tracks part payments and overdue state', () => {
    const b = bill({ amount: 2_000_00, dueDate: '2026-09-20' });
    const t = [txn({ linkType: 'bill', linkId: b.id, amount: 500_00 })];
    expect(viewBill(b, t, '2026-09-10').state).toBe('part_paid');
    expect(viewBill(b, t, '2026-09-10').remaining).toBe(1_500_00);
    expect(viewBill(b, t, '2026-09-21').state).toBe('overdue');
    const full = [...t, txn({ linkType: 'bill', linkId: b.id, amount: 1_500_00 })];
    expect(viewBill(b, full, '2026-09-21').state).toBe('paid');
  });

  it('handles prepaid validity and recharge stacking', () => {
    const recharge = bill({ billerId: 'p1', validUntil: '2026-09-25' });
    expect(prepaidStatus([recharge], 'p1', '2026-09-22').state).toBe('expiring');
    expect(prepaidStatus([recharge], 'p1', '2026-09-26').state).toBe('expired');
    expect(rechargeValidity('2026-09-25', '2026-09-22', 28)).toBe('2026-10-23');
    expect(rechargeValidity('2026-09-01', '2026-09-22', 28)).toBe('2026-10-19');
  });

  it('warns when an autopay debit was not seen', () => {
    const b = biller({ autopay: 1 });
    const v = viewBill(bill({ dueDate: '2026-09-20' }), [], '2026-09-23');
    expect(autopayMissing(b, v, '2026-09-23')).toBe(true);
    expect(autopayMissing(b, v, '2026-09-21')).toBe(false);
  });

  it('predicts the next LPG booking', () => {
    expect(predictNextLpg(['2026-05-01', '2026-06-15', '2026-08-01'])).toEqual({ averageDays: 46, nextDate: '2026-09-16' });
  });

  it('compares the latest bill to the average', () => {
    const bills = [bill({ billDate: '2026-06-05', amount: 1_000_00 }), bill({ billDate: '2026-07-05', amount: 1_000_00 }), bill({ billDate: '2026-08-05', amount: 1_350_00, usage: 270 })];
    const u = usageInsight(bills);
    expect(u.changeVsAverage).toBeCloseTo(0.35);
    expect(u.costPerUnit).toBeCloseTo(5);
  });

  it('matches a biller by consumer number or provider, not generic words', () => {
    const bescom = biller();
    const airtel = biller({ id: 'b2', name: 'Home internet', provider: 'Airtel Xstream', consumerNo: null });
    expect(matchBiller('Payment to BESCOM for 1234567890', [airtel, bescom])?.id).toBe(bescom.id);
    expect(matchBiller('Your Airtel bill is due', [bescom, airtel])?.id).toBe('b2');
    expect(matchBiller('Home loan EMI debited', [airtel])).toBeNull();
  });
});
