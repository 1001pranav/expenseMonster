import { addMonths, parts, type YMD } from './dates';
import type { Paise } from './money';
import type { InterestType, Loan } from './types';

const monthlyRate = (ratePa: number) => ratePa / 12 / 100;

/** Standard reducing-balance EMI, rounded to the rupee like Indian lenders do. */
export function calcEmi(principal: Paise, ratePa: number, months: number, type: InterestType = 'reducing'): Paise {
  if (months <= 0 || principal <= 0) return 0;
  if (type === 'none' || ratePa <= 0) return Math.ceil(principal / months);
  if (type === 'flat') {
    const interest = principal * (ratePa / 100) * (months / 12);
    return roundToRupee((principal + interest) / months);
  }
  const r = monthlyRate(ratePa);
  const f = Math.pow(1 + r, months);
  return roundToRupee((principal * r * f) / (f - 1));
}

const roundToRupee = (paise: number) => Math.round(paise / 100) * 100;

export interface ScheduleRow {
  n: number;
  date: YMD;
  emi: Paise;
  interest: Paise;
  principal: Paise;
  balance: Paise;
}

/** Full amortisation schedule. The final EMI absorbs rounding so the balance ends at exactly 0. */
export function amortization(
  principal: Paise,
  ratePa: number,
  months: number,
  firstEmiDate: YMD,
  emi: Paise = calcEmi(principal, ratePa, months),
  type: InterestType = 'reducing',
): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  const anchor = parts(firstEmiDate).d;
  const r = monthlyRate(ratePa);
  const flatInterest = type === 'flat' ? Math.round((principal * (ratePa / 100) * (months / 12)) / months) : 0;
  let balance = principal;

  for (let n = 1; n <= months && balance > 0; n++) {
    let interest = type === 'reducing' ? Math.round(balance * r) : type === 'flat' ? flatInterest : 0;
    let principalPart = emi - interest;
    let pay = emi;
    if (n === months || principalPart >= balance) {
      principalPart = balance;
      pay = principalPart + interest;
    }
    if (principalPart < 0) {
      // EMI smaller than interest: negative amortisation, keep balance growing honestly.
      principalPart = emi - interest;
      interest = emi - principalPart;
    }
    balance -= principalPart;
    rows.push({
      n,
      date: addMonths(firstEmiDate, n - 1, anchor),
      emi: pay,
      interest,
      principal: principalPart,
      balance,
    });
  }
  return rows;
}

export const scheduleFor = (loan: Pick<Loan, 'principal' | 'ratePa' | 'tenureMonths' | 'firstEmiDate' | 'emi' | 'interestType'>) =>
  amortization(loan.principal, loan.ratePa, loan.tenureMonths, loan.firstEmiDate, loan.emi, loan.interestType);

export interface LoanProgress {
  emisPaid: number;
  emisLeft: number;
  outstanding: Paise;
  principalPaid: Paise;
  interestPaid: Paise;
  interestLeft: Paise;
  nextDue: ScheduleRow | null;
  payoffDate: YMD | null;
  overdueCount: number;
}

/**
 * Progress after `emisPaid` instalments. Outstanding is the schedule balance; for informal
 * loans (no schedule) pass repaid amount instead via `informalProgress`.
 */
export function loanProgress(schedule: ScheduleRow[], emisPaid: number, today: YMD): LoanProgress {
  const paid = Math.min(Math.max(emisPaid, 0), schedule.length);
  const done = schedule.slice(0, paid);
  const left = schedule.slice(paid);
  const principal = schedule.reduce((a, r) => a + r.principal, 0);
  const principalPaid = done.reduce((a, r) => a + r.principal, 0);
  return {
    emisPaid: paid,
    emisLeft: left.length,
    outstanding: principal - principalPaid,
    principalPaid,
    interestPaid: done.reduce((a, r) => a + r.interest, 0),
    interestLeft: left.reduce((a, r) => a + r.interest, 0),
    nextDue: left[0] ?? null,
    payoffDate: schedule.length ? schedule[schedule.length - 1].date : null,
    overdueCount: left.filter((r) => r.date < today).length,
  };
}

export interface PrepaymentResult {
  mode: 'reduce_tenure' | 'reduce_emi';
  newEmi: Paise;
  newTenure: number;
  interestBefore: Paise;
  interestAfter: Paise;
  interestSaved: Paise;
  monthsSaved: number;
}

/** Simulate a lump-sum prepayment made right after `emisPaid` instalments. */
export function simulatePrepayment(
  principal: Paise,
  ratePa: number,
  months: number,
  emi: Paise,
  emisPaid: number,
  prepayment: Paise,
  mode: PrepaymentResult['mode'],
): PrepaymentResult {
  const base = amortization(principal, ratePa, months, '2000-01-01', emi);
  const paid = Math.min(emisPaid, base.length);
  const remainingRows = base.slice(paid);
  const interestBefore = remainingRows.reduce((a, r) => a + r.interest, 0);
  const outstanding = paid === 0 ? principal : base[paid - 1].balance;
  const newBalance = Math.max(outstanding - prepayment, 0);
  const monthsLeft = remainingRows.length;

  if (newBalance === 0) {
    return { mode, newEmi: 0, newTenure: 0, interestBefore, interestAfter: 0, interestSaved: interestBefore, monthsSaved: monthsLeft };
  }

  let newEmi = emi;
  let newTenure = monthsLeft;
  if (mode === 'reduce_emi') {
    newEmi = calcEmi(newBalance, ratePa, monthsLeft);
  } else {
    const r = monthlyRate(ratePa);
    newTenure = r === 0 ? Math.ceil(newBalance / emi) : Math.ceil(-Math.log(1 - (r * newBalance) / emi) / Math.log(1 + r));
    newTenure = Math.min(Math.max(newTenure, 1), monthsLeft);
  }
  const after = amortization(newBalance, ratePa, newTenure, '2000-01-01', newEmi);
  const interestAfter = after.reduce((a, r) => a + r.interest, 0);
  return {
    mode,
    newEmi,
    newTenure: after.length,
    interestBefore,
    interestAfter,
    interestSaved: interestBefore - interestAfter,
    monthsSaved: monthsLeft - after.length,
  };
}
