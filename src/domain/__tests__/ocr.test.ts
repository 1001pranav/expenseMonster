import { looksLikeBill, parseBillDocument, parsePaymentScreenshot } from '../parsers/ocr';

const T = '2026-09-20';

describe('payment screenshot OCR parser', () => {
  it('Google Pay success', () => {
    const text = ['To Swiggy', 'swiggy.stores@axb', '₹249', 'Completed', '12 Sep 2026, 10:32 pm', 'UPI transaction ID', '425612345678', 'To: SWIGGY', 'From: HDFC Bank 1234', 'Google transaction ID', 'CICAgOD123abc', 'Powered by UPI | Google Pay'].join('\n');
    const p = parsePaymentScreenshot(text, T)!;
    expect(p).toMatchObject({ app: 'Google Pay', status: 'success', amount: 24900, date: '2026-09-12', ref: '425612345678', vpa: 'swiggy.stores@axb', payee: 'Swiggy', direction: 'debit' });
    expect(p.time).toBe(22 * 60 + 32);
  });

  it('PhonePe paid to with ₹ dropped by OCR', () => {
    const text = ['Transaction Successful', '10:32 pm on 12 Sep 2026', 'Paid to', 'RAMESH KIRANA STORE', 'ramesh.kirana@ybl', '1,250', 'Transfer Details', 'Transaction ID', 'T2609121032451234567890', 'Debited from', 'XXXXXXXX4321', 'UTR: 425612345678', 'PhonePe'].join('\n');
    const p = parsePaymentScreenshot(text, T)!;
    expect(p).toMatchObject({ app: 'PhonePe', status: 'success', amount: 125000, payee: 'Ramesh Kirana Store', date: '2026-09-12' });
    expect(p.confidence).toBeLessThan(0.9);
  });

  it('Paytm received money is a credit', () => {
    const text = ['Paytm', 'Money Received', '₹500', 'Received from', 'PRIYA SHARMA', '12 Sep 2026, 08:15 AM', 'UPI Ref No: 425612345678'].join('\n');
    const p = parsePaymentScreenshot(text, T)!;
    expect(p).toMatchObject({ direction: 'credit', amount: 50000, payee: 'Priya Sharma', ref: '425612345678' });
  });

  it('flags failed payments', () => {
    const text = ['Payment failed', '₹1,000', 'To Electricity Board', '12 Sep 2026'].join('\n');
    expect(parsePaymentScreenshot(text, T)!.status).toBe('failed');
  });

  it('detects and parses an electricity bill', () => {
    const text = ['BANGALORE ELECTRICITY SUPPLY COMPANY', 'Electricity Bill', 'Consumer No: 1234567890', 'Bill Date: 05-09-2026', 'Units Consumed: 270', 'Amount Payable: Rs. 1,840.00', 'Due Date: 20-09-2026'].join('\n');
    expect(looksLikeBill(text)).toBe(true);
    const b = parseBillDocument(text, T)!;
    expect(b).toMatchObject({ amount: 184000, dueDate: '2026-09-20', billDate: '2026-09-05', consumerNo: '1234567890', usage: 270 });
  });
});
