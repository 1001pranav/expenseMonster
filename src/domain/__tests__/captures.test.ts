import { appOf, cardHintOf, duplicateOf, fillFromSms, recentRepeats, splitCaptures, suggestAmountFix } from '../captures';
import { cardEndingIn, maskedCardDigits, type ParsedTxn } from '../parsers/common';
import { parseSms } from '../parsers/sms';
import { txn } from './fixtures';

describe('check captures', () => {
  const clear = txn({ status: 'pending', payee: 'Swiggy', categoryId: 'food', confidence: 0.9 });
  const noCard = txn({ status: 'pending', payee: 'Amazon', categoryId: 'shopping', confidence: 0.9, method: 'card', flags: 'card-hint:4417' });
  const dup = txn({ status: 'pending', payee: 'Ravi', categoryId: 'help', confidence: 0.9, flags: 'duplicate:id-x' });

  it('splits clear captures from ones with an open question', () => {
    const { ready, needsYou } = splitCaptures([clear, noCard, dup]);
    expect(ready).toEqual([clear]);
    expect(needsYou).toEqual([noCard, dup]);
  });

  it('reads the question each capture needs answered', () => {
    expect(cardHintOf(noCard)).toBe('4417');
    expect(duplicateOf(dup)).toBe('id-x');
    expect(cardHintOf(clear)).toBeNull();
    expect(appOf(txn({ flags: 'app:PhonePe,amount-unsure' }))).toBe('PhonePe');
  });
});

describe('amount fix for an unread ₹ sign', () => {
  it('drops a leading 7 or 2 that was probably the ₹ sign', () => {
    expect(suggestAmountFix(7640_00, ['amount-unsure'])).toBe(640_00);
    expect(suggestAmountFix(210_50, ['amount-unsure'])).toBe(10_50);
  });

  it('offers nothing when the amount was read clearly or has no such digit', () => {
    expect(suggestAmountFix(7640_00, [])).toBeNull();
    expect(suggestAmountFix(640_00, ['amount-unsure'])).toBeNull();
    expect(suggestAmountFix(7_00, ['amount-unsure'])).toBeNull();
    expect(suggestAmountFix(700_00, ['amount-unsure'])).toBeNull();
  });
});

describe('recent repeats', () => {
  const today = '2026-10-26';
  const milk = (day: string) => txn({ payee: 'Milk', amount: 62_00, categoryId: 'groceries', occurredAt: `${day}T02:00:00.000Z` });

  it('offers payee + amount pairs made more than once lately, most frequent first', () => {
    const list = [milk('2026-10-24'), milk('2026-10-25'), milk('2026-10-20'), txn({ payee: 'Auto', amount: 80_00, occurredAt: '2026-10-22T02:00:00.000Z' }), txn({ payee: 'auto ', amount: 80_00, occurredAt: '2026-10-23T02:00:00.000Z', method: 'cash' })];
    const out = recentRepeats(list, 'expense', today);
    expect(out.map((r) => [r.payee, r.amount, r.count])).toEqual([
      ['Milk', 62_00, 3],
      ['auto', 80_00, 2],
    ]);
    // The latest payment decides how it's paid.
    expect(out[1].method).toBe('cash');
  });

  it('ignores one-offs, old payments, other types and pending or rejected ones', () => {
    const list = [
      txn({ payee: 'TV', amount: 30000_00, occurredAt: '2026-10-20T02:00:00.000Z' }),
      milk('2026-07-01'),
      milk('2026-07-02'),
      txn({ payee: 'Milk', amount: 62_00, status: 'pending', occurredAt: '2026-10-25T02:00:00.000Z' }),
      txn({ payee: 'Milk', amount: 62_00, status: 'rejected', occurredAt: '2026-10-25T02:00:00.000Z' }),
      txn({ payee: 'Salary', amount: 1_00_000_00, type: 'income', occurredAt: '2026-10-01T02:00:00.000Z' }),
      txn({ payee: 'Salary', amount: 1_00_000_00, type: 'income', occurredAt: '2026-09-01T02:00:00.000Z' }),
    ];
    expect(recentRepeats(list, 'expense', today)).toEqual([]);
    expect(recentRepeats(list, 'income', today)).toHaveLength(1);
  });
});

describe('masked card numbers', () => {
  const bhim = 'Debited account HDFC BANK RUPAY CREDIT CARD XXXXXX06 Payment initiated by PRANAV';

  it('reads the visible digits of a masked credit card', () => {
    expect(maskedCardDigits(bhim)).toBe('06');
    expect(maskedCardDigits('ICICI Credit Card ****4417')).toBe('4417');
    expect(maskedCardDigits('HDFC Bank A/c XXXXXX06')).toBeNull();
  });

  it('matches a saved card only when exactly one ends in those digits', () => {
    const hdfc = { id: 'hdfc', last4: '9906' };
    const sbi = { id: 'sbi', last4: '1234' };
    expect(cardEndingIn([hdfc, sbi], '06')).toBe(hdfc);
    expect(cardEndingIn([hdfc, sbi, { id: 'axis', last4: '5506' }], '06')).toBeUndefined();
    expect(cardEndingIn([hdfc, { id: 'new', last4: null }], null)).toBeUndefined();
  });
});

describe('filling the form from a pasted bank SMS', () => {
  const cards = [{ id: 'icici', last4: '9876' }, { id: 'hdfc', last4: '5678' }];
  const accounts = [{ id: 'hdfc-sb', last4: '1234' }];
  const fill = (sms: string) => fillFromSms(parseSms(sms, '2026-09-12') as ParsedTxn, sms, cards, accounts);

  it('a UPI payment: amount, payee, account, date and reference', () => {
    expect(fill('Sent Rs.250.00\nFrom HDFC Bank A/C *1234\nTo SWIGGY\nOn 12/09/26\nRef 425612345678')).toMatchObject({
      type: 'expense',
      amount: 250_00,
      payee: 'Swiggy',
      method: 'upi',
      accountId: 'hdfc-sb',
      cardId: null,
      date: '2026-09-12',
      sourceRef: '425612345678',
    });
  });

  it('a credit card spend picks the saved card by its number', () => {
    expect(fill('INR 2,499.00 spent using ICICI Bank Card XX9876 on 12-Sep-26 on AMAZON. Avl Limit: INR 1,23,456.00.')).toMatchObject({ type: 'expense', method: 'card', cardId: 'icici', accountId: null });
  });

  it('money received is income', () => {
    expect(fill('Rs.85000.00 credited to HDFC Bank A/c XX1234 on 12-09-26 by NEFT from ACME PVT LTD').type).toBe('income');
  });
});
