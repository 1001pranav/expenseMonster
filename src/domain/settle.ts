import { splitEvenly, type Paise } from './money';
import type { Member, Transaction } from './types';

export type Balances = Record<string, Paise>;

export function parseIds(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Net balance per member: positive = others owe them, negative = they owe.
 * - Shared expense: payer is credited the full amount, each participant debited an equal share.
 * - Settlement: sender is credited, receiver debited.
 */
export function memberBalances(transactions: Transaction[]): Balances {
  const bal: Balances = {};
  const add = (id: string, v: Paise) => {
    bal[id] = (bal[id] ?? 0) + v;
  };
  for (const t of transactions) {
    if (t.deletedAt || t.status !== 'confirmed') continue;
    if (t.type === 'settlement' && t.memberId && t.toMemberId) {
      add(t.memberId, t.amount);
      add(t.toMemberId, -t.amount);
      continue;
    }
    const participants = parseIds(t.splitWith);
    if (t.type === 'expense' && t.memberId && participants.length) {
      add(t.memberId, t.amount);
      splitEvenly(t.amount, participants.length).forEach((share, i) => add(participants[i], -share));
    }
  }
  for (const k of Object.keys(bal)) if (bal[k] === 0) delete bal[k];
  return bal;
}

/**
 * Money sent between two family members: a plain family transfer (pocket money, household cash,
 * which never changes who owes whom) or a settlement (which does).
 */
export const isFamilyTransfer = (t: Pick<Transaction, 'type' | 'toMemberId'>) => t.type === 'settlement' || (t.type === 'transfer' && Boolean(t.toMemberId));

/** The family member a UPI ID belongs to, never yourself (that is a move between your own accounts). */
export function memberForVpa(vpa: string | null, members: Member[], selfId: string): Member | undefined {
  const v = vpa?.trim().toLowerCase();
  if (!v) return undefined;
  return members.find((m) => !m.deletedAt && m.id !== selfId && m.upiId?.trim().toLowerCase() === v);
}

export interface Transfer {
  from: string;
  to: string;
  amount: Paise;
}

/** Greedy debt simplification: at most n-1 transfers to settle everyone. */
export function simplifyDebts(balances: Balances): Transfer[] {
  const creditors = Object.entries(balances)
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, v }))
    .sort((a, b) => b.v - a.v);
  const debtors = Object.entries(balances)
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, v: -v }))
    .sort((a, b) => b.v - a.v);
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].v, creditors[j].v);
    if (amount > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount });
    debtors[i].v -= amount;
    creditors[j].v -= amount;
    if (debtors[i].v === 0) i++;
    if (creditors[j].v === 0) j++;
  }
  return out;
}
