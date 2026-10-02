import { loanEmisPaid } from './dues';
import { scheduleFor } from './emi';
import { fromParts, isoToYMD, parts, type YMD } from './dates';
import type { Paise } from './money';
import type { Loan, Policy, Transaction } from './types';

/**
 * Old-regime deductions that can be read straight from data the app already has:
 * insurance premiums paid through Dues and the EMI split of tracked home/education loans.
 * It is an estimate to prompt tax planning, not tax advice: PPF, ELSS, EPF, tuition fees,
 * rent (HRA) and parents' health cover are not tracked here.
 */

export interface FinancialYear {
  start: YMD;
  end: YMD;
  /** "FY 2026-27" */
  label: string;
}

export function financialYear(date: YMD): FinancialYear {
  const { y, m } = parts(date);
  const from = m >= 4 ? y : y - 1;
  return { start: fromParts(from, 4, 1), end: fromParts(from + 1, 3, 31), label: `FY ${from}-${String((from + 1) % 100).padStart(2, '0')}` };
}

export type TaxSection = '80C' | '80D' | '24b' | '80E';

export const SECTION_LIMIT: Record<TaxSection, Paise | null> = {
  '80C': 1_50_000_00,
  // Self, spouse and children below 60. Parents' cover has its own separate limit.
  '80D': 25_000_00,
  // Interest on a self-occupied home.
  '24b': 2_00_000_00,
  '80E': null,
};

export interface TaxLine {
  key: string;
  label: string;
  amount: Paise;
}

export interface SectionSummary {
  section: TaxSection;
  claimed: Paise;
  limit: Paise | null;
  /** Room left under the limit (null when the section has no limit). */
  headroom: Paise | null;
  lines: TaxLine[];
}

const SECTION_FOR_POLICY: Partial<Record<Policy['type'], TaxSection>> = { life: '80C', term: '80C', health: '80D' };

export function taxSummary(input: { policies: Policy[]; loans: Loan[]; transactions: Transaction[] }, today: YMD): { fy: FinancialYear; sections: SectionSummary[] } {
  const fy = financialYear(today);
  const lines: Record<TaxSection, TaxLine[]> = { '80C': [], '80D': [], '24b': [], '80E': [] };
  const inFy = (d: YMD) => d >= fy.start && d <= fy.end;

  for (const p of input.policies) {
    const section = SECTION_FOR_POLICY[p.type];
    if (!section || p.deletedAt) continue;
    const paid = input.transactions
      .filter((t) => !t.deletedAt && t.status === 'confirmed' && t.linkType === 'policy' && t.linkId === p.id && inFy(isoToYMD(t.occurredAt)))
      .reduce((a, t) => a + t.amount, 0);
    if (paid) lines[section].push({ key: p.id, label: p.name, amount: paid });
  }

  for (const l of input.loans) {
    if (l.deletedAt || l.direction !== 'borrowed' || (l.kind !== 'home' && l.kind !== 'education') || l.interestType === 'none') continue;
    const paidCount = loanEmisPaid(l, input.transactions);
    const rows = scheduleFor(l).filter((r) => r.n <= paidCount && inFy(r.date));
    const principal = rows.reduce((a, r) => a + r.principal, 0);
    const interest = rows.reduce((a, r) => a + r.interest, 0);
    if (l.kind === 'home') {
      if (principal) lines['80C'].push({ key: `${l.id}:p`, label: `${l.name} · principal`, amount: principal });
      if (interest) lines['24b'].push({ key: `${l.id}:i`, label: `${l.name} · interest`, amount: interest });
    } else if (interest) {
      lines['80E'].push({ key: `${l.id}:i`, label: `${l.name} · interest`, amount: interest });
    }
  }

  const sections = (Object.keys(lines) as TaxSection[]).map((section) => {
    const total = lines[section].reduce((a, x) => a + x.amount, 0);
    const limit = SECTION_LIMIT[section];
    return {
      section,
      claimed: limit === null ? total : Math.min(total, limit),
      limit,
      headroom: limit === null ? null : Math.max(0, limit - total),
      lines: lines[section].sort((a, b) => b.amount - a.amount),
    };
  });
  return { fy, sections };
}
