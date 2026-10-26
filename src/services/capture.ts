import { matchBiller, viewBill } from '@/domain/bills';
import { statementDateFor } from '@/domain/creditCard';
import { addDays, addMonths, toISO, toYMD, todayYMD, type YMD } from '@/domain/dates';
import { textHash } from '@/domain/ids';
import type { Paise } from '@/domain/money';
import type { Parsed, ParsedBill, ParsedCardStatement, ParsedTxn } from '@/domain/parsers/common';
import { applyFormat } from '@/domain/parsers/custom';
import { analyzePaymentScreenshot, looksLikeBill, parseBillDocument, type ScreenshotAnalysis, type ScreenshotPayment } from '@/domain/parsers/ocr';
import { parseSms } from '@/domain/parsers/sms';
import { applyRules, isLearned, ruleTargets } from '@/domain/rules';
import { memberForVpa } from '@/domain/settle';
import { categoryHistory } from '@/domain/transactions';
import type { Transaction } from '@/domain/types';
import { addCapture, type TxnDraft } from '@/data/actions';
import { insert } from '@/db/repo';
import { getState } from '@/db/store';
import { saveAttachment } from './files';
import { recognizeText } from './ocr';
import { logFailure } from './diagnostics';

export interface CaptureSummary {
  added: number;
  duplicates: number;
  bills: number;
  statements: number;
  skipped: number;
  unknownBillers: string[];
  /** Transactions added to Review by this capture. */
  addedIds: string[];
}

const emptySummary = (): CaptureSummary => ({ added: 0, duplicates: 0, bills: 0, statements: 0, skipped: 0, unknownBillers: [], addedIds: [] });

function toDraft(p: ParsedTxn, source: Transaction['source'], hash: string, rawText: string, attachment: string | null): TxnDraft {
  const { tables, identity } = getState();
  const card = p.cardLast4 ? tables.cards.find((c) => c.last4 === p.cardLast4) : undefined;
  const account = p.accountLast4 ? tables.accounts.find((a) => a.last4 === p.accountLast4) : undefined;
  const flags: string[] = [];
  if (p.isCreditCard && !card && p.cardLast4) flags.push(`card-hint:${p.cardLast4}`);
  if (p.isRefund) flags.push('refund');
  if (p.app) flags.push(`app:${p.app}`);

  let type: Transaction['type'] = p.direction === 'debit' ? 'expense' : 'income';
  let linkType: Transaction['linkType'] = null;
  let linkId: string | null = null;
  let memberId: string | null = identity.selfMemberId || null;
  let toMemberId: string | null = null;
  // UPI to or from a family member moves money inside the household: a transfer, so it isn't
  // counted as spending here and again when they spend it.
  const member = !p.isCreditCard ? memberForVpa(p.vpa, tables.members, identity.selfMemberId) : undefined;
  if (member && identity.selfMemberId) {
    type = 'transfer';
    [memberId, toMemberId] = p.direction === 'debit' ? [identity.selfMemberId, member.id] : [member.id, identity.selfMemberId];
  }
  // "Payment received on your credit card" → bill payment, which is a transfer, not income.
  if (p.isCreditCard && p.direction === 'credit' && !p.isRefund && /payment/i.test(rawText)) {
    type = 'transfer';
    linkType = 'card';
    linkId = card?.id ?? null;
  }

  // Payment for a known biller → suggest linking to its open bill.
  if (type === 'expense') {
    const biller = matchBiller(`${p.payee ?? ''} ${p.vpa ?? ''} ${rawText}`, tables.billers);
    if (biller) {
      const open = tables.bills
        .filter((b) => b.billerId === biller.id && b.status !== 'draft')
        .map((b) => viewBill(b, tables.transactions, todayYMD()))
        .filter((v) => v.remaining > 0)
        .sort((a, b) => a.bill.dueDate.localeCompare(b.bill.dueDate))[0];
      if (open) {
        linkType = 'bill';
        linkId = open.bill.id;
      }
      flags.push(`biller:${biller.id}`);
    }
  }

  // The user's own rules win; then what this payee was filed under before (across name spellings);
  // then learned rules. When they were filed two ways the most used is picked and the approval
  // screen offers the other.
  const input = { payee: p.payee, vpa: p.vpa, text: rawText, source };
  const targets = ruleTargets(tables);
  const mine = applyRules(tables.rules.filter((r) => !isLearned(r)), input, targets);
  const learned = applyRules(tables.rules.filter(isLearned), input, targets);
  const past = type === 'transfer' ? [] : categoryHistory(p.payee, p.vpa, type, tables.transactions);
  const categoryId = type === 'transfer' ? null : (mine.categoryId ?? past[0]?.categoryId ?? learned.categoryId ?? (p.isRefund ? 'cat_cashback' : null));
  for (const id of mine.ruleIds) flags.push(`rule:${id}`);
  const ruleCard = mine.method === 'card' ? mine.cardId : undefined;
  // A rule naming the card answers "which card?", so the "card not saved" hint no longer applies.
  const kept = ruleCard ? flags.filter((f) => !f.startsWith('card-hint:')) : flags;

  return {
    type,
    amount: p.amount,
    occurredAt: toISO(p.date ?? todayYMD(), p.time),
    method: type === 'transfer' ? (p.isCreditCard ? 'card' : p.vpa || p.ref ? 'upi' : 'bank') : (mine.method ?? (p.isCreditCard ? 'card' : p.vpa || p.ref ? 'upi' : 'bank')),
    cardId: ruleCard ?? card?.id ?? null,
    accountId: mine.accountId ?? account?.id ?? null,
    payee: mine.payee ?? p.payee,
    vpa: p.vpa,
    memberId,
    toMemberId,
    categoryId,
    linkType,
    linkId,
    source,
    sourceRef: p.ref,
    sourceHash: hash,
    confidence: p.confidence,
    flags: kept.join(',') || null,
    attachment,
  };
}

async function saveDraftBill(p: ParsedBill, text: string, hash: string, received: YMD, attachment: string | null, summary: CaptureSummary) {
  const { tables } = getState();
  if (tables.bills.some((b) => b.sourceHash === hash)) {
    summary.duplicates++;
    return;
  }
  const biller = matchBiller(`${p.provider ?? ''} ${p.consumerNo ?? ''} ${text}`, tables.billers);
  if (!biller) {
    if (p.provider) summary.unknownBillers.push(p.provider);
    summary.skipped++;
    return;
  }
  const dueDate = p.dueDate ?? addDays(received, biller.dueOffsetDays);
  if (tables.bills.some((b) => b.billerId === biller.id && b.dueDate === dueDate && b.amount === p.amount)) {
    summary.duplicates++;
    return;
  }
  await insert('bills', {
    billerId: biller.id,
    periodFrom: null,
    periodTo: null,
    billDate: p.billDate ?? received,
    dueDate,
    amount: p.amount,
    lateFee: 0,
    usage: p.usage,
    validUntil: null,
    status: 'draft',
    attachment,
    sourceHash: hash,
    scope: biller.scope,
  });
  summary.bills++;
}

async function saveStatement(p: ParsedCardStatement, received: YMD, summary: CaptureSummary) {
  const { tables } = getState();
  const card = p.cardLast4 ? tables.cards.find((c) => c.last4 === p.cardLast4) : tables.cards.length === 1 ? tables.cards[0] : undefined;
  if (!card) {
    summary.skipped++;
    return;
  }
  // The statement SMS arrives on/just after the statement date.
  const thisCycle = statementDateFor(received, card.statementDay);
  const statementDate = thisCycle > received ? addMonths(thisCycle, -1, card.statementDay) : thisCycle;
  if (tables.card_overrides.some((o) => o.cardId === card.id && o.statementDate === statementDate)) {
    summary.duplicates++;
    return;
  }
  await insert('card_overrides', { cardId: card.id, statementDate, total: p.total, minDue: p.minDue, scope: card.scope });
  summary.statements++;
}

/** User-taught formats win over the built-in parser (they exist because the built-in one failed). */
function parseMessage(sender: string, body: string, received: YMD): Parsed | null {
  for (const f of getState().tables.sms_formats) {
    const p = applyFormat(f, sender, body, received);
    if (p) return p;
  }
  return parseSms(body, received);
}

async function captureParsed(parsed: Parsed, raw: string, hash: string, received: YMD, source: 'sms', summary: CaptureSummary, fallbackISO: string | null) {
  if (parsed.kind === 'bill') return saveDraftBill(parsed, raw, hash, received, null, summary);
  if (parsed.kind === 'card_statement') return saveStatement(parsed, received, summary);
  const draft = toDraft(parsed, source, hash, raw, null);
  if (!parsed.time && fallbackISO) draft.occurredAt = fallbackISO;
  const { row, duplicate } = await addCapture(draft);
  if (row) {
    summary.added++;
    summary.addedIds.push(row.id);
  }
  if (duplicate && !row) summary.duplicates++;
}

/**
 * A bank SMS (pasted, or picked up automatically when that's switched on) goes through the parsers
 * into Review. The text itself is not stored. `receivedAt` is when the phone got the message, for
 * SMS read from the phone; pasted ones count as received now.
 */
export async function captureText(text: string, sender = '', receivedAt?: Date): Promise<CaptureSummary & { recognised: boolean }> {
  const summary = emptySummary();
  const received = receivedAt ? toYMD(receivedAt) : todayYMD();
  const parsed = parseMessage(sender, text, received);
  if (!parsed) return { ...summary, recognised: false };
  await captureParsed(parsed, text, textHash(`${sender}|${text}`), received, 'sms', summary, receivedAt ? receivedAt.toISOString() : null);
  return { ...summary, recognised: true };
}

export interface ImageCapture {
  summary: CaptureSummary;
  transactionId: string | null;
  /** The earlier entry this screenshot was already recorded as. */
  duplicateOf: string | null;
  status: 'success' | 'failed' | 'pending' | 'unknown' | 'bill' | 'unreadable';
  /** What OCR read, shown when nothing usable was found so the user can see why. */
  text: string;
}

/** What OCR found in a screenshot, before anything is saved. */
export type ScreenshotRead =
  | { kind: 'bill'; uri: string; text: string; bill: ParsedBill | null }
  | { kind: 'payment'; uri: string; text: string; payment: ScreenshotAnalysis };

/** OCR a payment screenshot or bill photo. Nothing is saved, so the user can confirm the amount first. */
export async function readScreenshot(uri: string): Promise<ScreenshotRead> {
  const { text, prominent } = await recognizeText(uri);
  const today = todayYMD();
  if (looksLikeBill(text)) return { kind: 'bill', uri, text, bill: parseBillDocument(text, today) };

  const { tables, identity } = getState();
  const self = tables.members.find((m) => m.id === identity.selfMemberId)?.name;
  const payment = analyzePaymentScreenshot(text, today, { prominent, selfNames: self ? [self] : [] });
  if (!payment.amountSure) {
    // The Latin model often reads ₹ as a 7 ("₹10.00" → "710.00"); ask the Devanagari model for the amount.
    const second = await recognizeText(uri, 'Devanagari')
      .then((r) => analyzePaymentScreenshot(r.text, today, { prominent: r.prominent }))
      .catch((e) => {
        logFailure('capture: second OCR pass (Devanagari) failed', e, 'warn');
        return null;
      });
    if (second?.amount && second.amountSure) {
      payment.amount = second.amount;
      payment.amountSure = true;
    } else if (second?.amount && payment.amount && String(payment.amount).startsWith('7') && String(payment.amount).slice(1) === String(second.amount)) {
      // Neither pass read the ₹, but the Devanagari one has the same digits without the leading 7
      // ("7750" vs "750"): that 7 was the ₹. Still unsure, so the user confirms, but the box shows ₹750.
      payment.amount = second.amount;
    }
  }
  return { kind: 'payment', uri, text, payment };
}

/** Save what readScreenshot found; `amount` is the amount the user typed or confirmed. */
export async function saveScreenshot(read: ScreenshotRead, confirmed?: { amount: Paise }): Promise<ImageCapture> {
  const summary = emptySummary();
  const { text } = read;
  const hash = textHash(text);
  const none = { summary, transactionId: null, duplicateOf: null, text };

  if (read.kind === 'bill') {
    if (!read.bill) return { ...none, status: 'unreadable' };
    await saveDraftBill(read.bill, text, hash, todayYMD(), await saveAttachment(read.uri), summary);
    return { ...none, status: 'bill' };
  }

  const p = read.payment;
  const amount = confirmed?.amount ?? p.amount;
  if (!amount) return { ...none, status: 'unreadable' };
  if (p.status === 'failed') return { ...none, status: 'failed' };
  const sure = Boolean(confirmed) || p.amountSure;
  const parsed: ScreenshotPayment = { ...p, amount, amountSure: sure };
  const draft = toDraft(parsed, 'ocr', hash, text, await saveAttachment(read.uri));
  const extra = [p.status === 'pending' ? 'payment-pending' : null, sure ? null : 'amount-unsure', confirmed ? 'amount-confirmed' : null];
  draft.flags = [draft.flags, ...extra].filter(Boolean).join(',') || null;
  // Never let "approve all confident" take an amount whose ₹ sign wasn't read; one the user typed
  // or checked against the screenshot is as good as a clearly read one.
  if (!sure) draft.confidence = Math.min(draft.confidence ?? 0, 0.6);
  else if (confirmed) draft.confidence = Math.min(0.95, (draft.confidence ?? 0) + 0.2);
  const { row, duplicate, duplicateOf } = await addCapture(draft);
  if (row) summary.added++;
  else if (duplicate) summary.duplicates++;
  return { summary, transactionId: row?.id ?? null, duplicateOf: row ? null : duplicateOf, status: p.status, text };
}

/** OCR a payment screenshot or bill photo and queue it for review, without asking anything. */
export async function captureImage(uri: string): Promise<ImageCapture> {
  return saveScreenshot(await readScreenshot(uri));
}
