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

  // Real screenshots start with the status bar: the clock must not become the payment time.
  const STATUS_BAR = ['10:42', 'Vo LTE 4G', '85'];

  it('Google Pay paid: payee from "To", time from the date line', () => {
    const text = [...STATUS_BAR, 'To RAMESH KUMAR', '+91 98765 43210', '₹500', 'Completed', '12 Sep 2026, 7:45 pm', 'HDFC Bank 1234', 'UPI transaction ID', '425612345678', 'To: RAMESH KUMAR', 'Google Pay • ramesh.k@okaxis', 'From: PRANAV N (HDFC Bank)', 'Google Pay • pranav@okhdfcbank', 'Google transaction ID', 'CICAgOCxx12abc', 'POWERED BY UPI'].join('\n');
    const p = parsePaymentScreenshot(text, T)!;
    expect(p).toMatchObject({ app: 'Google Pay', direction: 'debit', amount: 50000, payee: 'Ramesh Kumar', vpa: 'ramesh.k@okaxis', ref: '425612345678', date: '2026-09-12' });
    expect(p.time).toBe(19 * 60 + 45);
  });

  it('Google Pay received: "From X" is a credit and the sender is the counterparty', () => {
    const text = [...STATUS_BAR, 'From PRIYA SHARMA', '₹1,200', 'Completed', '11 Sep 2026, 8:15 am', 'HDFC Bank 1234', 'UPI transaction ID', '425612345679', 'To: PRANAV N (HDFC Bank)', 'Google Pay • pranav@okhdfcbank', 'From: PRIYA SHARMA', 'Google Pay • priya.s@oksbi', 'Google transaction ID', 'CICAgOCyy34def'].join('\n');
    const p = parsePaymentScreenshot(text, T)!;
    expect(p).toMatchObject({ app: 'Google Pay', direction: 'credit', amount: 120000, payee: 'Priya Sharma', vpa: 'priya.s@oksbi', date: '2026-09-11' });
    expect(p.time).toBe(8 * 60 + 15);
  });

  it('Google Pay paid to a phone number without a name', () => {
    const text = [...STATUS_BAR, 'To +91 98765 43210', '₹80', 'Completed', '12 Sep 2026, 1:05 pm', 'UPI transaction ID', '425612345670'].join('\n');
    expect(parsePaymentScreenshot(text, T)).toMatchObject({ direction: 'debit', amount: 8000, payee: '+91 98765 43210' });
  });

  it('PhonePe paid: amount on the payee row is not taken as the name', () => {
    const text = [...STATUS_BAR, 'Transaction Successful', '07:45 pm on 12 Sep 2026', 'Paid to', '₹2,350', 'SHREE GANESH MEDICALS', 'Q123456789@ybl', 'Transfer Details', 'Transaction ID', 'T2609121945123456789012', 'Debited from', 'XXXXXXXX1234', '₹2,350', 'UTR: 425612345671', 'Powered by UPI'].join('\n');
    const p = parsePaymentScreenshot(text, T)!;
    expect(p).toMatchObject({ app: 'PhonePe', direction: 'debit', amount: 235000, payee: 'Shree Ganesh Medicals', vpa: 'q123456789@ybl', ref: '425612345671', date: '2026-09-12', accountLast4: '1234' });
    expect(p.time).toBe(19 * 60 + 45);
  });

  it('PhonePe received from', () => {
    const text = [...STATUS_BAR, 'Transaction Successful', '08:15 am on 11 Sep 2026', 'Received from', 'ANIL KUMAR', '₹750', '9876543210@ybl', 'Transfer Details', 'Transaction ID', 'T2609110815123456789012', 'Credited to', 'XXXXXXXX1234', '₹750', 'UTR: 425612345672'].join('\n');
    const p = parsePaymentScreenshot(text, T)!;
    expect(p).toMatchObject({ app: 'PhonePe', direction: 'credit', amount: 75000, payee: 'Anil Kumar', vpa: '9876543210@ybl', ref: '425612345672' });
  });

  it('BHIM paid, with ₹ read as % by OCR', () => {
    const text = [...STATUS_BAR, 'BHIM', '%499.00', 'Paid Successfully', 'To', 'Airtel Prepaid', 'airtelprepaid@upi', '12-09-2026 19:45:12', 'UPI Ref No.', '425612345673', 'From', 'Pranav N', 'XXXX1234'].join('\n');
    const p = parsePaymentScreenshot(text, T)!;
    expect(p).toMatchObject({ app: 'BHIM', direction: 'debit', amount: 49900, payee: 'Airtel Prepaid', vpa: 'airtelprepaid@upi', ref: '425612345673', date: '2026-09-12' });
    expect(p.time).toBe(19 * 60 + 45);
  });

  it('BHIM received', () => {
    const text = [...STATUS_BAR, 'BHIM', '₹ 2,000.00', 'Received Successfully', 'From', 'SURESH BABU', 'suresh@upi', '10 Sep 2026, 09:30 AM', 'UPI Ref No: 425612345674', 'To', 'Pranav N', 'pranav@upi'].join('\n');
    const p = parsePaymentScreenshot(text, T)!;
    expect(p).toMatchObject({ app: 'BHIM', direction: 'credit', amount: 200000, payee: 'Suresh Babu', vpa: 'suresh@upi', date: '2026-09-10' });
  });

  it('prefers the largest OCR line for the amount', () => {
    const text = [...STATUS_BAR, 'To Swiggy', '7500', 'Completed', '12 Sep 2026, 9:00 pm'].join('\n');
    expect(parsePaymentScreenshot(text, T, { prominent: ['₹500', 'To Swiggy'] })!.amount).toBe(50000);
  });

  it("a payee's @paytm VPA doesn't make a GPay screenshot Paytm", () => {
    const text = ['To Chai Point', 'chaipoint@paytm', '₹60', 'Completed', '12 Sep 2026, 4:10 pm', 'Google transaction ID', 'CICAgOCzz'].join('\n');
    expect(parsePaymentScreenshot(text, T)!.app).toBe('Google Pay');
  });

  it('never takes a word as the UPI reference (it made every later screenshot a duplicate)', () => {
    const text = ['BHIM', '₹10.00', 'Paid Successfully', 'To', 'Tea Stall', 'UPI Ref No.', 'Completed', '12 Sep 2026, 07:45 PM'].join('\n');
    expect(parsePaymentScreenshot(text, T)!.ref).toBeNull();
  });

  it('your own name as the "other party" flips the direction', () => {
    // A layout that lists the sender first: without the self check this would read as money received.
    const text = ['₹250.00', 'From', 'PRANAV N', 'XXXX1234', 'To', 'Ravi Kumar', 'ravi@upi', '12 Sep 2026, 07:45 PM', 'UPI Ref No: 425612345675'].join('\n');
    expect(parsePaymentScreenshot(text, T)!.direction).toBe('credit');
    const p = parsePaymentScreenshot(text, T, { selfNames: ['Pranav Nair'] })!;
    expect(p).toMatchObject({ direction: 'debit', payee: 'Ravi Kumar', vpa: 'ravi@upi' });
  });

  it('"paid" anywhere keeps a From-first screen an expense', () => {
    const text = ['₹40.00', 'Paid', 'From', 'My Account', 'To', 'Ravi Kumar', '12 Sep 2026'].join('\n');
    expect(parsePaymentScreenshot(text, T)!.direction).toBe('debit');
  });

  it('marks the amount unsure when no ₹ sign was read', () => {
    const withSign = ['To Ravi', '₹10', 'Completed', '12 Sep 2026'].join('\n');
    const bare = ['To Ravi', '70', 'Completed', '12 Sep 2026'].join('\n');
    expect(parsePaymentScreenshot(withSign, T)!.amountSure).toBe(true);
    expect(parsePaymentScreenshot(bare, T)!.amountSure).toBe(false);
  });

  it('detects and parses an electricity bill', () => {
    const text = ['BANGALORE ELECTRICITY SUPPLY COMPANY', 'Electricity Bill', 'Consumer No: 1234567890', 'Bill Date: 05-09-2026', 'Units Consumed: 270', 'Amount Payable: Rs. 1,840.00', 'Due Date: 20-09-2026'].join('\n');
    expect(looksLikeBill(text)).toBe(true);
    const b = parseBillDocument(text, T)!;
    expect(b).toMatchObject({ amount: 184000, dueDate: '2026-09-20', billDate: '2026-09-05', consumerNo: '1234567890', usage: 270 });
  });
});
