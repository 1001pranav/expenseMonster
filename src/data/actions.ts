import { nextExpectedBillDate, pendingFixedBills, rechargeValidity, prepaidStatus } from '@/domain/bills';
import { addDays, toISO, todayYMD, type YMD } from '@/domain/dates';
import { findDuplicate } from '@/domain/dedupe';
import type { DueItem } from '@/domain/dues';
import type { Paise } from '@/domain/money';
import { advance } from '@/domain/recurrence';
import { categoryRefs, resplit } from '@/domain/categories';
import { isLearned } from '@/domain/rules';
import { isClearCapture, ruleKey } from '@/domain/transactions';
import type { Bill, Biller, PayMethod, Scope, Transaction, TxnType } from '@/domain/types';
import { findById, insert, insertMany, remove, restore, update, type NewRow } from '@/db/repo';
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

/**
 * Remember "merchant → category" after the user confirms or corrects one. Only learned rules change
 * this way: a rule the user wrote (or edited) for the same words is left as they set it.
 */
export async function learnRule(t: Pick<Transaction, 'payee' | 'vpa' | 'categoryId'>) {
  if (!t.categoryId) return;
  const key = ruleKey(t.payee, t.vpa);
  if (!key) return;
  const same = getState().tables.rules.filter((r) => r.pattern === key);
  if (same.some((r) => !isLearned(r))) return;
  const existing = same[0];
  if (existing?.categoryId === t.categoryId) return;
  if (existing) await update('rules', existing.id, { categoryId: t.categoryId });
  else await insert('rules', { pattern: key, categoryId: t.categoryId, field: 'payee', source: 'any', method: null, cardId: null, accountId: null, rename: null, learned: 1, scope: 'household' });
}

export async function approveCapture(id: string, patch: Partial<Transaction> = {}) {
  const row = await update('transactions', id, { ...patch, status: 'confirmed', flags: stripFlag(patch.flags ?? findById('transactions', id)?.flags ?? null, 'duplicate') });
  await learnRule(row);
  if (getState().settings.deleteScreenshots && row.attachment) {
    const { deleteAttachment } = await import('@/services/files');
    deleteAttachment(row.attachment);
    await update('transactions', id, { attachment: null });
  }
  return row;
}

/**
 * Approve a fresh capture on its own when it was read clearly and the setting allows it.
 * Returns the saved row, or null when it should go to Review instead. Marked "auto-saved" so the
 * Spending list can point it out for a few days.
 */
export async function autoSaveCapture(id: string): Promise<Transaction | null> {
  const t = findById('transactions', id);
  if (!t || !getState().settings.autoSaveCaptures || !isClearCapture(t)) return null;
  return approveCapture(id, { flags: [t.flags, 'auto-saved'].filter(Boolean).join(',') });
}

/** Rejected captures are kept (as tombstone-like rows) so the same SMS is never offered again. */
export const rejectCapture = (id: string) => update('transactions', id, { status: 'rejected' });

/** "Not the same payment": drop the possible-duplicate mark so the capture can be approved. */
export const keepBothCaptures = (id: string) => update('transactions', id, { flags: stripFlag(findById('transactions', id)?.flags ?? null, 'duplicate') });

/**
 * Answer "Which card ends in 4417?": the capture becomes a payment on that card, and the next
 * message naming 4417 is matched by itself — the card takes the number when it has none, otherwise
 * (an add-on card) a rule remembers it.
 */
export async function answerCardHint(id: string, cardId: string) {
  const t = findById('transactions', id);
  const card = findById('cards', cardId);
  const hint = (t?.flags ?? '').split(',').find((f) => f.startsWith('card-hint:'))?.split(':')[1];
  if (!t || !card) return;
  // A full number becomes the card's own; two masked digits ("XXXXXX06") are remembered as a rule.
  if (hint?.length === 4 && !card.last4) await update('cards', cardId, { last4: hint });
  else if (hint && !card.last4?.endsWith(hint)) await rememberCard(hint.length === 4 ? hint : `xx${hint}`, t.source === 'ocr' ? 'ocr' : 'sms', cardId);
  await update('transactions', id, { method: 'card', cardId, accountId: null, flags: stripFlag(t.flags, 'card-hint') });
}

/** A rule of your own: "when a screenshot / SMS mentions `text`, it was paid with this card". */
export async function rememberCard(text: string, source: 'ocr' | 'sms', cardId: string) {
  const pattern = text.trim().toLowerCase();
  const existing = getState().tables.rules.find((r) => !isLearned(r) && r.pattern === pattern && r.field === 'text' && r.source === source);
  if (existing) return update('rules', existing.id, { method: 'card', cardId, accountId: null });
  return insert('rules', { pattern, categoryId: '', field: 'text', source, method: 'card', cardId, accountId: null, rename: null, learned: 0, scope: 'household' });
}

/** Delete a transaction; an investment's trade goes with it (the money and what it bought are one entry). */
export async function deleteTransaction(id: string) {
  const t = findById('transactions', id);
  await remove('transactions', id);
  if (t?.linkType === 'investment' && t.linkId && findById('trades', t.linkId)) await remove('trades', t.linkId);
}

/** Undo deleteTransaction. */
export async function restoreTransaction(id: string) {
  const t = await restore('transactions', id);
  if (t.linkType === 'investment' && t.linkId) await restore('trades', t.linkId).catch(() => {});
}

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
      const bill = await billForPayment(biller, pay.amount, pay.date);
      return saveTransaction({ ...common, type: 'expense', categoryId: biller.categoryId ?? categoryForBiller(biller.type), linkType: 'bill', linkId: bill.id, scope: biller.scope });
    }
  }
  return null;
}

/**
 * A payment to a biller that has no open bill (a recharge, an LPG booking, or an electricity bill paid
 * without entering it first): record the bill it paid, dated the day of payment, so the biller's
 * history, usage trend and next-due prediction include it.
 */
export async function billForPayment(biller: Biller, amount: Paise, date: YMD): Promise<Bill> {
  const { tables } = getState();
  const current = prepaidStatus(tables.bills, biller.id, date).validUntil;
  // A fixed bill (rent, broadband) is paid for its cycle: date it on that cycle, so the bill that
  // would be generated for the cycle isn't added again as due.
  const cycle = biller.amountMode === 'fixed' ? nextExpectedBillDate(biller, tables.bills, date) : null;
  return insert('bills', {
    billerId: biller.id,
    periodFrom: cycle,
    periodTo: cycle ? addDays(advance(cycle, biller.frequency, biller.billDay), -1) : null,
    billDate: cycle ?? date,
    dueDate: cycle ? addDays(cycle, biller.dueOffsetDays) : date,
    amount,
    lateFee: 0,
    usage: null,
    validUntil: biller.amountMode === 'prepaid' && biller.validityDays ? rechargeValidity(current, date, biller.validityDays) : null,
    status: 'open',
    attachment: null,
    sourceHash: null,
    scope: biller.scope,
  });
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

/** Built-in categories that "Mark paid" files bills, EMIs and premiums under: hide, never delete. */
export const SYSTEM_CATEGORIES: ReadonlySet<string> = new Set(Object.values(CATEGORY_FOR));

/**
 * Re-file everything under `from` to `to`, then delete `from`. Covers entries (and their splits),
 * budgets (a budget the target already has for the same month wins), rules, recurring income and
 * billers; sub-categories move up a level. Returns how many entries moved.
 */
export async function moveAndDeleteCategory(from: string, to: string): Promise<number> {
  if (from === to || SYSTEM_CATEGORIES.has(from)) return 0;
  const t = getState().tables;
  let moved = 0;
  for (const x of t.transactions) {
    if (x.deletedAt) continue;
    const splits = resplit(x.splits, from, to);
    if (x.categoryId !== from && splits === null) continue;
    await update('transactions', x.id, { ...(x.categoryId === from ? { categoryId: to } : {}), ...(splits !== null ? { splits } : {}) });
    moved++;
  }
  for (const b of t.budgets) {
    if (b.deletedAt || b.categoryId !== from) continue;
    const clash = t.budgets.some((o) => !o.deletedAt && o.categoryId === to && o.month === b.month);
    if (clash) await remove('budgets', b.id);
    else await update('budgets', b.id, { categoryId: to });
  }
  for (const r of t.rules) if (!r.deletedAt && r.categoryId === from) await update('rules', r.id, { categoryId: to });
  for (const i of t.incomes) if (!i.deletedAt && i.categoryId === from) await update('incomes', i.id, { categoryId: to });
  for (const b of t.billers) if (!b.deletedAt && b.categoryId === from) await update('billers', b.id, { categoryId: to });
  for (const c of t.categories) if (!c.deletedAt && c.parentId === from) await update('categories', c.id, { parentId: null });
  await remove('categories', from);
  return moved;
}

/** What points at a category, from the live tables. */
export const refsOf = (id: string) => categoryRefs(id, getState().tables);
