import { matchBiller, viewBill } from '@/domain/bills';
import { statementDateFor } from '@/domain/creditCard';
import { addDays, addMonths, toISO, todayYMD, type YMD } from '@/domain/dates';
import { textHash } from '@/domain/ids';
import type { Parsed, ParsedBill, ParsedCardStatement, ParsedTxn } from '@/domain/parsers/common';
import { applyFormat } from '@/domain/parsers/custom';
import { looksLikeBill, parseBillDocument, parsePaymentScreenshot } from '@/domain/parsers/ocr';
import { parseSms } from '@/domain/parsers/sms';
import { suggestCategory } from '@/domain/transactions';
import type { Transaction } from '@/domain/types';
import { addCapture, type TxnDraft } from '@/data/actions';
import { insert } from '@/db/repo';
import { getState } from '@/db/store';
import { saveAttachment } from './files';
import { recognizeText } from './ocr';

export interface CaptureSummary {
  added: number;
  duplicates: number;
  bills: number;
  statements: number;
  skipped: number;
  unknownBillers: string[];
}

const emptySummary = (): CaptureSummary => ({ added: 0, duplicates: 0, bills: 0, statements: 0, skipped: 0, unknownBillers: [] });

function toDraft(p: ParsedTxn, source: Transaction['source'], hash: string, rawText: string, attachment: string | null): TxnDraft {
  const { tables } = getState();
  const card = p.cardLast4 ? tables.cards.find((c) => c.last4 === p.cardLast4) : undefined;
  const account = p.accountLast4 ? tables.accounts.find((a) => a.last4 === p.accountLast4) : undefined;
  const flags: string[] = [];
  if (p.isCreditCard && !card && p.cardLast4) flags.push(`card-hint:${p.cardLast4}`);
  if (p.isRefund) flags.push('refund');
  if (p.app) flags.push(`app:${p.app}`);

  let type: Transaction['type'] = p.direction === 'debit' ? 'expense' : 'income';
  let linkType: Transaction['linkType'] = null;
  let linkId: string | null = null;
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

  const categoryId = type === 'transfer' ? null : suggestCategory(`${p.payee ?? ''} ${p.vpa ?? ''}`, tables.rules) ?? (p.isRefund ? 'cat_cashback' : null);

  return {
    type,
    amount: p.amount,
    occurredAt: toISO(p.date ?? todayYMD(), p.time),
    method: p.isCreditCard ? 'card' : p.vpa || p.ref ? 'upi' : 'bank',
    cardId: card?.id ?? null,
    accountId: account?.id ?? null,
    payee: p.payee,
    vpa: p.vpa,
    categoryId,
    linkType,
    linkId,
    source,
    sourceRef: p.ref,
    sourceHash: hash,
    confidence: p.confidence,
    flags: flags.join(',') || null,
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
  if (row) summary.added++;
  if (duplicate && !row) summary.duplicates++;
}

/**
 * Paste a bank SMS and it goes through the parsers into Review. The app never reads the SMS
 * inbox; the text itself is not stored.
 */
export async function captureText(text: string, sender = ''): Promise<CaptureSummary & { recognised: boolean }> {
  const summary = emptySummary();
  const today = todayYMD();
  const parsed = parseMessage(sender, text, today);
  if (!parsed) return { ...summary, recognised: false };
  await captureParsed(parsed, text, textHash(`${sender}|${text}`), today, 'sms', summary, null);
  return { ...summary, recognised: true };
}

export interface ImageCapture {
  summary: CaptureSummary;
  transactionId: string | null;
  status: 'success' | 'failed' | 'pending' | 'unknown' | 'bill' | 'unreadable';
  /** What OCR read, shown when nothing usable was found so the user can see why. */
  text: string;
}

/** OCR a payment screenshot or bill photo and queue it for review. */
export async function captureImage(uri: string): Promise<ImageCapture> {
  const summary = emptySummary();
  const { text, prominent } = await recognizeText(uri);
  const today = todayYMD();
  const hash = textHash(text);

  if (looksLikeBill(text)) {
    const bill = parseBillDocument(text, today);
    if (!bill) return { summary, transactionId: null, status: 'unreadable', text };
    await saveDraftBill(bill, text, hash, today, await saveAttachment(uri), summary);
    return { summary, transactionId: null, status: 'bill', text };
  }

  const parsed = parsePaymentScreenshot(text, today, { prominent });
  if (!parsed) return { summary, transactionId: null, status: 'unreadable', text };
  if (parsed.status === 'failed') return { summary, transactionId: null, status: 'failed', text };
  const attachment = await saveAttachment(uri);
  const draft = toDraft(parsed, 'ocr', hash, text, attachment);
  if (parsed.status === 'pending') draft.flags = [draft.flags, 'payment-pending'].filter(Boolean).join(',');
  const { row, duplicate } = await addCapture(draft);
  if (row) summary.added++;
  else if (duplicate) summary.duplicates++;
  return { summary, transactionId: row?.id ?? null, status: parsed.status, text };
}
