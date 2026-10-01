import type { ParsedBill, ParsedCardStatement, ParsedTxn } from '../parsers/common';
import { isLikelyFinancialSender, parseSms } from '../parsers/sms';

const R = '2026-09-12';
const tx = (s: string) => parseSms(s, R) as ParsedTxn;

describe('bank SMS parser', () => {
  it('HDFC UPI sent', () => {
    const p = tx('Sent Rs.250.00\nFrom HDFC Bank A/C *1234\nTo SWIGGY\nOn 12/09/26\nRef 425612345678\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808');
    expect(p).toMatchObject({ kind: 'transaction', direction: 'debit', amount: 25000, accountLast4: '1234', ref: '425612345678', date: '2026-09-12', payee: 'Swiggy', bank: 'HDFC Bank' });
  });

  it('SBI UPI debit without currency symbol', () => {
    const p = tx('Dear UPI user A/C X1234 debited by 250.0 on date 12Sep26 trf to SWIGGY Refno 425612345678. If not u? call 1800111109. -SBI');
    expect(p).toMatchObject({ direction: 'debit', amount: 25000, accountLast4: '1234', ref: '425612345678', date: '2026-09-12', payee: 'Swiggy' });
  });

  it('ICICI debit naming the merchant credited', () => {
    const p = tx('ICICI Bank Acct XX234 debited for Rs 1,250.00 on 12-Sep-26; AMAZON credited. UPI:425612345678. Call 18002662 for dispute. SMS BLOCK 234 to 9215676766.');
    expect(p).toMatchObject({ direction: 'debit', amount: 125000, payee: 'Amazon', ref: '425612345678', isCreditCard: false });
  });

  it('ICICI credit card spend ignores available limit', () => {
    const p = tx('INR 2,499.00 spent using ICICI Bank Card XX9876 on 12-Sep-26 on AMAZON. Avl Limit: INR 1,23,456.00. If not you, call 1800 2662/SMS BLOCK 9876 to 9215676766');
    expect(p).toMatchObject({ direction: 'debit', amount: 249900, isCreditCard: true, cardLast4: '9876', date: '2026-09-12' });
  });

  it('HDFC card spend with balance', () => {
    const p = tx('Spent Rs.1499 On HDFC Bank Card 5678 At FLIPKART On 2026-09-12:10:32:45 Bal Rs.98501 Not You? Call 18002586161');
    expect(p).toMatchObject({ amount: 149900, cardLast4: '5678', isCreditCard: true, payee: 'Flipkart', balance: 9850100, time: 10 * 60 + 32 });
  });

  it('Axis UPI P2M multi-line', () => {
    const p = tx('INR 350.00 debited\nA/c no. XX4321\n12-09-26, 10:32:45\nUPI/P2M/425612345678/ZOMATO\nNot you? SMS BLOCKUPI Cust ID to 919951860002\nAxis Bank');
    expect(p).toMatchObject({ amount: 35000, accountLast4: '4321', ref: '425612345678', payee: 'Zomato', bank: 'Axis Bank' });
  });

  it('Kotak sent to VPA', () => {
    const p = tx('Sent Rs.200.00 from Kotak Bank AC X5678 to priya@oksbi on 12-09-26.UPI Ref 425612345678. Not you, https://kotak.com/KBANKT/Fraud');
    expect(p).toMatchObject({ amount: 20000, vpa: 'priya@oksbi', payee: 'priya@oksbi', accountLast4: '5678' });
  });

  it('salary credit with available balance', () => {
    const p = tx('Your A/c XX1234 is credited with INR 85,000.00 on 01-10-2026 by NEFT-ACME CORP. Avl Bal INR 1,02,345.67');
    expect(p).toMatchObject({ direction: 'credit', amount: 8500000, date: '2026-10-01', payee: 'Acme Corp', balance: 10234567 });
  });

  it('refund on card is a credit flagged as refund', () => {
    const p = tx('Refund of Rs 599.00 credited to your HDFC Bank Credit Card XX5678 from MYNTRA on 12-09-26');
    expect(p).toMatchObject({ direction: 'credit', isRefund: true, isCreditCard: true, cardLast4: '5678', amount: 59900 });
  });

  it('ignores OTP, promotions, failed payments, mandates and collect requests', () => {
    expect(parseSms('123456 is your OTP for txn of Rs 500 at AMAZON. Do not share.', R)).toBeNull();
    expect(parseSms('You are pre-approved for a personal loan of Rs 5,00,000. Apply now!', R)).toBeNull();
    expect(parseSms('Your UPI txn of Rs 250 to SWIGGY failed. Amount if debited will be refunded', R)).toBeNull();
    expect(parseSms('Rs 499 will be debited on 15-Oct for Netflix mandate', R)).toBeNull();
    expect(parseSms('rahul@okaxis has requested money Rs 300 on Google Pay', R)).toBeNull();
  });

  it('parses biller SMS as a bill with due date', () => {
    const p = parseSms('Dear Customer, your BESCOM bill of Rs 1,840.00 for Acct No 1234567890 is due on 15-Oct-2026.', R) as ParsedBill;
    expect(p).toMatchObject({ kind: 'bill', amount: 184000, dueDate: '2026-10-15', provider: 'BESCOM', consumerNo: '1234567890' });
    const a = parseSms('Your Airtel Xstream Fiber bill for Rs. 1178.82 is generated, due date 20-10-2026.', R) as ParsedBill;
    expect(a).toMatchObject({ kind: 'bill', amount: 117882, dueDate: '2026-10-20' });
  });

  it('parses credit card statement SMS', () => {
    const p = parseSms('HDFC Bank Credit Card XX5678 Statement: Total Amt Due Rs.12,345.67, Min Amt Due Rs.620.00, Due by 05-Nov-26.', R) as ParsedCardStatement;
    expect(p).toMatchObject({ kind: 'card_statement', cardLast4: '5678', total: 1234567, minDue: 62000, dueDate: '2026-11-05' });
  });

  it('recognises transactional senders, not personal numbers', () => {
    expect(isLikelyFinancialSender('VM-HDFCBK')).toBe(true);
    expect(isLikelyFinancialSender('AD-SBIINB-S')).toBe(true);
    expect(isLikelyFinancialSender('+919876543210')).toBe(false);
  });
});
