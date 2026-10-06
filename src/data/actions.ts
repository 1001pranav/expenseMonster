import { pendingFixedBills, rechargeValidity, prepaidStatus } from '@/domain/bills';
import { addDays, toISO, todayYMD, type YMD } from '@/domain/dates';
import { findDuplicate } from '@/domain/dedupe';
import type { DueItem } from '@/domain/dues';
import type { Paise } from '@/domain/money';
import { advance } from '@/domain/recurrence';
import { ruleKey } from '@/domain/transactions';
import type { Bill, PayMethod, Scope, Transaction, TxnType } from '@/domain/types';
import { findById, insert, insertMany, remove, update, type NewRow } from '@/db/repo';
import { CATEGORY_FOR } from '@/db/seed';
import { getState } from '@/db/store';

export type TxnDraft = Partial<NewRow<'transactions'>> & { type: TxnType; amount: Paise };

export function blankTxn(draft: TxnDraft): NewRow<'transactions'> {
  const { settings, identity } = getState();
  return {
    occurredAt: new Date().toISOString(),
    categoryId: null,
    accountId: null,
    method: 'upi',
    cardId: null,
    payee: null,
    vpa: null,
    note: null,
    memberId: identity.selfMemberId || null,
    toMemberId: null,
    splitWith: null,
    splits: null,
    linkType: null,
    linkId: null,
    source: 'manual',
    sourceRef: null,
    sourceHash: null,
    confidence: null,
    flags: null,
    status: 'confirmed',
    attachment: null,
    scope: settings.defaultTxnScope,
    ...draft,
  };
}

export async function saveTransaction(draft: TxnDraft, id?: string): Promise<Transaction> {
  if (id) return update('transactions', id, draft as Partial<Transaction>);
  const row = await insert('transactions', blankTxn(draft));
  if (row.status === 'confirmed') await learnRule(row);
  return row;
}

/** Remember "merchant → category" after the user confirms or corrects one. */
export async function learnRule(t: Pick<Transaction, 'payee' | 'vpa' | 'categoryId'>) {
  if (!t.categoryId) return;
  const key = ruleKey(t.payee, t.vpa);
  if (!key) return;
  const existing = getState().tables.rules.find((r) => r.pattern === key);
  if (existing?.categoryId === t.categoryId) return;
  if (existing) await update('rules', existing.id, { categoryId: t.categoryId });
  else await insert('rules', { pattern: key, categoryId: t.categoryId, scope: 'household' });
}

export async function approveCapture(id: string, patch: Partial<Transaction> = {}) {
  const row = await update('transactions', id, { ...patch, status: 'confirmed', flags: stripFlag(patch.flags ?? findById('transactions', id)?.flags ?? null, 'duplicate') });
  await learnRule(row);
  if (getState().settings.deleteCapturesAfterApproval && row.attachment) {
    const { deleteAttachment } = await import('@/services/files');
    deleteAttachment(row.attachment);
    await update('transactions', id, { attachment: null });
  }
  return row;
}

/** Rejected captures are kept (as tombstone-like rows) so the same SMS is never offered again. */
export const rejectCapture = (id: string) => update('transactions', id, { status: 'rejected' });

export const deleteTransaction = (id: string) => remove('transactions', id);

function stripFlag(flags: string | null, prefix: string) {
  const rest = (flags ?? '').split(',').filter((f) => f && !f.startsWith(prefix));
  return rest.length ? rest.join(',') : null;
}

/** Create a pending capture unless it's a duplicate of something already recorded. */
export async function addCapture(draft: TxnDraft): Promise<{ row: Transaction | null; duplicate: boolean; duplicateOf: string | null }> {
  const base = blankTxn({ ...draft, status: 'pending' });
  const dup = findDuplicate(base as Transaction, allTransactionsIncludingRejected());
  if (dup?.kind === 'exact') return { row: null, duplicate: true, duplicateOf: dup.existing.id };
  const flags = dup ? [base.flags, `duplicate:${dup.existing.id}`].filter(Boolean).join(',') : base.flags;
  const row = await insert('transactions', { ...base, flags });
  return { row, duplicate: Boolean(dup), duplicateOf: dup?.existing.id ?? null };
}

/** In-memory store hides deleted rows but keeps rejected ones, which is what de-duplication needs. */
const allTransactionsIncludingRejected = () => getState().tables.transactions;

// ── paying obligations ────────────────────────────────────────────────────

export interface PayInput {
  amount: Paise;
  date: YMD;
  method: PayMethod;
  accountId: string | null;
  cardId: string | null;
  note?: string | null;
  source?: Transaction['source'];
  sourceRef?: string | null;
}

/** Record a payment against a due (EMI, bill, card, premium, recharge…) and advance its schedule. */
export async function markDuePaid(due: DueItem, pay: PayInput): Promise<Transaction | null> {
  if (!due.link) return null;
  const { tables } = getState();
  const occurredAt = toISO(pay.date, pay.date === todayYMD() ? new Date().getHours() * 60 + new Date().getMinutes() : null);
  const common = {
    amount: pay.amount,
    occurredAt,
    method: pay.method,
    accountId: pay.accountId,
    cardId: pay.method === 'card' ? pay.cardId : null,
    note: pay.note ?? null,
    payee: due.title,
    source: pay.source ?? ('manual' as const),
    sourceRef: pay.sourceRef ?? null,
    status: 'confirmed' as const,
  };

  switch (due.link.type) {
    case 'loan': {
      const loan = findById('loans', due.link.id);
      const incoming = loan?.direction === 'lent';
      return saveTransaction({
        ...common,
        type: incoming ? 'income' : 'expense',
        categoryId: incoming ? 'cat_other_in' : CATEGORY_FOR.loan,
        linkType: 'loan',
        linkId: due.link.id,
        scope: loan?.scope ?? 'household',
      });
    }
    case 'card': {
      const card = findById('cards', due.link.id);
      // Paying a card bill moves money from bank to card: a transfer, never an expense.
      return saveTransaction({ ...common, type: 'transfer', method: pay.method === 'card' ? 'bank' : pay.method, cardId: due.link.id, linkType: 'card', linkId: due.link.id, scope: card?.scope ?? 'personal' });
    }
    case 'bill': {
      const bill = findById('bills', due.link.id);
      const biller = findById('billers', bill?.billerId);
      return saveTransaction({
        ...common,
        type: 'expense',
        categoryId: biller?.categoryId ?? categoryForBiller(biller?.type),
        linkType: 'bill',
        linkId: due.link.id,
        scope: biller?.scope ?? 'household',
      });
    }
    case 'policy': {
      const policy = findById('policies', due.link.id);
      if (!policy) return null;
      const t = await saveTransaction({ ...common, type: 'expense', categoryId: CATEGORY_FOR.policy, linkType: 'policy', linkId: policy.id, scope: policy.scope });
      await update('policies', policy.id, { nextDueDate: advance(policy.nextDueDate, policy.frequency) });
      return t;
    }
    case 'income': {
      const inc = findById('incomes', due.link.id);
      if (!inc) return null;
      const t = await saveTransaction({ ...common, type: 'income', categoryId: inc.categoryId ?? CATEGORY_FOR.income, accountId: pay.accountId ?? inc.accountId, linkType: 'income', linkId: inc.id, scope: inc.scope });
      await update('incomes', inc.id, { nextDate: advance(inc.nextDate, inc.frequency) });
      return t;
    }
    case 'biller': {
      // Prepaid recharge or LPG booking: create the "bill" record then pay it.
      const biller = findById('billers', due.link.id);
      if (!biller) return null;
      const current = prepaidStatus(tables.bills, biller.id, pay.date).validUntil;
      const bill = await insert('bills', {
        billerId: biller.id,
        periodFrom: null,
        periodTo: null,
        billDate: pay.date,
        dueDate: pay.date,
        amount: pay.amount,
        lateFee: 0,
        usage: null,
        validUntil: biller.amountMode === 'prepaid' && biller.validityDays ? rechargeValidity(current, pay.date, biller.validityDays) : null,
        status: 'open',
        attachment: null,
        sourceHash: null,
        scope: biller.scope,
      });
      return saveTransaction({ ...common, type: 'expense', categoryId: biller.categoryId ?? categoryForBiller(biller.type), linkType: 'bill', linkId: bill.id, scope: biller.scope });
    }
  }
  return null;
}

export function categoryForBiller(type: string | undefined): string {
  switch (type) {
    case 'rent':
    case 'maintenance':
      return CATEGORY_FOR.rent;
    case 'school':
      return CATEGORY_FOR.school;
    case 'salary':
      return CATEGORY_FOR.salary;
    case 'subscription':
      return CATEGORY_FOR.subscription;
    default:
      return CATEGORY_FOR.bill;
  }
}

/** Create bill rows for fixed billers (rent, broadband…) whose cycle has started. */
export async function generateFixedBills(today: YMD = todayYMD()): Promise<number> {
  const { tables } = getState();
  const drafts: NewRow<'bills'>[] = [];
  for (const biller of tables.billers) {
    const since = biller.createdAt.slice(0, 10) > addDays(today, -31) ? biller.createdAt.slice(0, 10) : addDays(today, -31);
    for (const d of pendingFixedBills(biller, tables.bills, today, since)) {
      drafts.push({ ...d, lateFee: 0, usage: null, validUntil: null, status: 'open', attachment: null, sourceHash: null, scope: biller.scope });
    }
  }
  if (drafts.length) await insertMany('bills', drafts);
  return drafts.length;
}

export async function saveBill(data: Omit<NewRow<'bills'>, 'status' | 'attachment' | 'sourceHash' | 'lateFee' | 'validUntil' | 'periodFrom' | 'periodTo'> & Partial<Bill>, id?: string) {
  if (id) return update('bills', id, data as Partial<Bill>);
  return insert('bills', { periodFrom: null, periodTo: null, lateFee: 0, validUntil: null, status: 'open', attachment: null, sourceHash: null, ...data });
}

export async function recordSettlement(fromMemberId: string, toMemberId: string, amount: Paise, method: PayMethod, scope: Scope = 'household') {
  return saveTransaction({ type: 'settlement', amount, memberId: fromMemberId, toMemberId, method, scope, categoryId: null });
}
