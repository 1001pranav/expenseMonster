import { fillFromSms } from '../captures';
import { findDuplicate, mergeDuplicate } from '../dedupe';
import { isCardBillPayment, isCardPaymentApp, type ParsedTxn } from '../parsers/common';
import { parseSms } from '../parsers/sms';
import { txn } from './fixtures';

const day = '2026-11-05';
const read = (body: string) => parseSms(body, day) as ParsedTxn;
const cards = [{ id: 'hdfc-cc', last4: '5678' }];
const accounts = [{ id: 'sbi', last4: '1234' }];

describe('both SMS of one credit card bill payment', () => {
  const bankSide = [
    'Rs.10000.00 debited from A/c XX1234 on 05-11-26 towards HDFC Bank Credit Card XX5678. Avl Bal Rs 45000.00 -HDFC Bank',
    'Your A/c XX1234 is debited for INR 10,000.00 on 05-Nov-26 for Credit Card payment to card ending 5678. -ICICI Bank',
    'Rs.10000 debited via auto debit for HDFC Credit Card ending 5678',
  ];
  const cardSide = [
    'Payment of Rs 10,000.00 has been received on your HDFC Bank Credit Card XX5678 on 05-11-2026. Thank you.',
    'Dear Cardmember, we have received payment of INR 10000.00 towards your ICICI Bank Credit Card XX5678 on 05-Nov-26.',
  ];

  it.each(bankSide)('reads the bank debit as paying the card, not a purchase on it: %s', (body) => {
    const p = read(body);
    expect(isCardBillPayment(body, p)).toBe(true);
    const f = fillFromSms(p, body, cards, accounts);
    expect(f).toMatchObject({ type: 'transfer', paysCardId: 'hdfc-cc', cardId: null, method: 'bank' });
  });

  it('keeps the account the bill was paid from', () => {
    const p = read(bankSide[0]);
    expect(p.accountLast4).toBe('1234');
    expect(fillFromSms(p, bankSide[0], cards, accounts).accountId).toBe('sbi');
  });

  it.each(cardSide)('reads the card\'s "payment received" as paying the card: %s', (body) => {
    const f = fillFromSms(read(body), body, cards, accounts);
    expect(f).toMatchObject({ type: 'transfer', paysCardId: 'hdfc-cc', accountId: null });
  });

  it('still reads purchases on the card as spending', () => {
    for (const body of [
      'Rs.499.00 spent on HDFC Bank Card x5678 at SWIGGY on 2026-11-05. Not you? Call 18002586161',
      'Rs 499 debited from your Credit Card XX5678 at AMAZON on 05-11-26',
    ]) {
      const p = read(body);
      expect(isCardBillPayment(body, p)).toBe(false);
      expect(fillFromSms(p, body, cards, accounts)).toMatchObject({ type: 'expense', method: 'card', cardId: 'hdfc-cc' });
    }
  });

  it('"for using your credit card" is not "for the credit card"', () => {
    const body = 'Thank you for using your HDFC Bank Credit Card XX5678 for Rs 499 at AMAZON from A/c XX1234';
    expect(isCardBillPayment(body, { direction: 'debit', isCreditCard: true, isRefund: false, accountLast4: '1234' })).toBe(false);
  });

  it('a refund on the card is not a payment', () => {
    const body = 'Refund of Rs 499.00 received on your Credit Card XX5678 from AMAZON';
    expect(isCardBillPayment(body, read(body))).toBe(false);
  });

  it('money sent to CRED is a card bill payment', () => {
    const body = 'Sent Rs.10000.00 From HDFC Bank A/C *1234 To CRED Club On 05/11/26 Ref 512345678901';
    expect(isCardPaymentApp('Cred Club', null)).toBe(true);
    expect(isCardPaymentApp(null, 'cred.club@axisb')).toBe(true);
    expect(isCardPaymentApp('Credence Stores', null)).toBe(false);
    expect(fillFromSms(read(body), body, cards, accounts)).toMatchObject({ type: 'transfer', accountId: 'sbi', payee: null });
  });
});

describe('matching a card bill payment seen twice', () => {
  const paid = (over: Parameters<typeof txn>[0]) => txn({ type: 'transfer', linkType: 'card', amount: 10000_00, method: 'bank', ...over });

  it('the card\'s SMS a day later repeats the bank\'s (or a payment recorded early by hand)', () => {
    const early = paid({ cardId: 'hdfc-cc', linkId: 'hdfc-cc', accountId: 'sbi', occurredAt: '2026-11-03T05:00:00.000Z' });
    const cardSms = paid({ cardId: 'hdfc-cc', linkId: 'hdfc-cc', occurredAt: '2026-11-04T14:00:00.000Z' });
    expect(findDuplicate(cardSms, [early])).toMatchObject({ kind: 'likely', existing: early, reason: 'Same card bill payment' });
  });

  it('works when one side does not know the card', () => {
    const bankSms = paid({ cardId: null, accountId: 'sbi', occurredAt: '2026-11-04T05:00:00.000Z' });
    const cardSms = paid({ cardId: 'hdfc-cc', occurredAt: '2026-11-05T05:00:00.000Z' });
    expect(findDuplicate(cardSms, [bankSms])?.existing).toBe(bankSms);
  });

  it('does not match other cards, other amounts, rejected ones, or more than 3 days apart', () => {
    const cardSms = paid({ cardId: 'hdfc-cc', occurredAt: '2026-11-05T05:00:00.000Z' });
    expect(findDuplicate(cardSms, [paid({ cardId: 'axis-cc', occurredAt: '2026-11-05T05:00:00.000Z' })])).toBeNull();
    expect(findDuplicate(cardSms, [paid({ cardId: 'hdfc-cc', amount: 5000_00, occurredAt: '2026-11-05T05:00:00.000Z' })])).toBeNull();
    expect(findDuplicate(cardSms, [paid({ cardId: 'hdfc-cc', status: 'rejected', occurredAt: '2026-11-05T05:00:00.000Z' })])).toBeNull();
    expect(findDuplicate(cardSms, [paid({ cardId: 'hdfc-cc', occurredAt: '2026-11-01T04:00:00.000Z' })])).toBeNull();
  });

  it('a card payment is never matched with spending of the same amount', () => {
    const cardSms = paid({ cardId: 'hdfc-cc', occurredAt: '2026-11-05T05:00:00.000Z' });
    expect(findDuplicate(cardSms, [txn({ type: 'expense', amount: 10000_00, occurredAt: '2026-11-05T05:02:00.000Z' })])).toBeNull();
  });
});

describe('folding the second SMS of one payment into the first', () => {
  it('a debit from one saved account and a credit to another is a transfer between them', () => {
    const out = txn({ status: 'pending', type: 'expense', accountId: 'sbi', categoryId: 'cat_other', payee: 'Self', sourceRef: '512345678903' });
    const into = txn({ type: 'income', accountId: 'hdfc', sourceRef: '512345678903' });
    expect(mergeDuplicate(out, into)).toMatchObject({ type: 'transfer', categoryId: null, accountId: 'sbi', flags: 'self-transfer' });
    // Credit SMS first: the money still left the debit side's account.
    expect(mergeDuplicate({ ...into, status: 'pending' }, out)).toMatchObject({ type: 'transfer', accountId: 'sbi' });
  });

  it('a refund back to the same account is not a transfer', () => {
    const out = txn({ status: 'pending', type: 'expense', accountId: 'sbi' });
    expect(mergeDuplicate(out, txn({ type: 'income', accountId: 'sbi' }))).toBeNull();
  });

  it('UPI on a credit card: the card SMS after the app\'s fills in the card', () => {
    const app = txn({ status: 'pending', method: 'upi', payee: 'Swiggy', accountId: null, flags: 'app:PhonePe' });
    const card = txn({ method: 'card', cardId: 'hdfc-cc', payee: 'Swiggy' });
    expect(mergeDuplicate(app, card)).toEqual({ method: 'card', cardId: 'hdfc-cc', accountId: null, flags: 'app:PhonePe' });
  });

  it('fills in what the first did not name, and never touches a decided one', () => {
    const first = txn({ status: 'pending', payee: null, vpa: null, accountId: null });
    expect(mergeDuplicate(first, txn({ payee: 'Swiggy', vpa: 'swiggy@icici', accountId: 'sbi' }))).toEqual({ payee: 'Swiggy', vpa: 'swiggy@icici', accountId: 'sbi' });
    expect(mergeDuplicate({ ...first, status: 'confirmed' }, txn({ payee: 'Swiggy' }))).toBeNull();
    expect(mergeDuplicate(first, txn({}))).toBeNull();
  });

  it('a card bill payment learns its card from the other SMS', () => {
    const bank = txn({ status: 'pending', type: 'transfer', linkType: 'card', cardId: null, accountId: 'sbi', flags: 'card-hint:5678' });
    expect(mergeDuplicate(bank, txn({ type: 'transfer', linkType: 'card', cardId: 'hdfc-cc' }))).toEqual({ cardId: 'hdfc-cc', linkId: 'hdfc-cc', flags: null });
  });
});

describe('two parser gaps', () => {
  it('a payee name stops before "using UPI"', () => {
    expect(read('You paid Rs.250 to Swiggy using UPI. UPI Ref No 512345678902. -PhonePe').payee).toBe('Swiggy');
    expect(read('Rs 120 paid at Chai Point using UPI on 05-11-26').payee).toBe('Chai Point');
  });

  it('"Thank you for using your credit card" is a purchase on it', () => {
    const body = 'Thank you for using your HDFC Bank Credit Card XX5678 for Rs 499 at AMAZON on 05-11-26';
    const p = read(body);
    expect(p).toMatchObject({ direction: 'debit', amount: 499_00, payee: 'Amazon', cardLast4: '5678', isCreditCard: true });
    expect(fillFromSms(p, body, cards, accounts)).toMatchObject({ type: 'expense', method: 'card', cardId: 'hdfc-cc' });
  });

  it('"using" elsewhere does not turn money in into money out', () => {
    expect(read('Rs 500 credited to A/c XX1234 using IMPS on 05-11-26').direction).toBe('credit');
  });
});
