import { toISO, todayYMD, type YMD } from '@/domain/dates';
import { uuidv7 } from '@/domain/ids';
import { SALE_FLAG } from '@/domain/investments';
import type { Paise } from '@/domain/money';
import type { AssetClass, Holding, PayMethod, QuantityUnit, Scope, Trade, Transaction } from '@/domain/types';
import { findById, insert, remove, update } from '@/db/repo';
import { saveTransaction } from './actions';

/**
 * Saving investments (domain/investments.ts): a holding (created on first purchase), a trade, and the
 * cash transaction when money moved (a transfer, linkType 'investment', flagged 'sale' for a sale).
 */

export interface NewHolding {
  assetClass: AssetClass;
  form: string | null;
  name: string;
  symbol: string | null;
  unit: QuantityUnit;
  purity: string | null;
  memberId: string | null;
}

export interface CashSide {
  /** Money that moved: paid for a purchase, received for a sale. */
  amount: Paise;
  method: PayMethod;
  accountId: string | null;
  cardId: string | null;
}

export interface InvestmentInput {
  side: Trade['side'];
  holding: { id: string } | NewHolding;
  tradeDate: YMD;
  /** The trade's value: cost of a purchase (charges included), what a sale brought in (after them). */
  amount: Paise;
  quantity: number | null;
  unitPrice: Paise | null;
  charges: Paise;
  taxes: Paise;
  refRate: Paise | null;
  /** Null: no cash moved (a gift, jewellery traded in). */
  cash: CashSide | null;
  note: string | null;
  scope: Scope;
}

/**
 * Save a new trade, or change one (`tradeId`). `fromTxnId`: an older expense filed under
 * Investments becomes this trade's cash side instead of a new transaction being made.
 */
export async function saveInvestment(input: InvestmentInput, opts: { tradeId?: string; fromTxnId?: string } = {}): Promise<Trade> {
  const holding: Holding =
    'assetClass' in input.holding
      ? await insert('holdings', { ...input.holding, priceNow: null, priceAsOf: null, closed: 0, note: null, scope: input.scope })
      : findById('holdings', input.holding.id)!;
  if (!holding) throw new Error('That holding no longer exists');
  const existing = opts.tradeId ? findById('trades', opts.tradeId) : undefined;
  const tradeId = existing?.id ?? uuidv7();

  let txnId = existing?.txnId ?? opts.fromTxnId ?? null;
  if (input.cash) {
    const today = todayYMD();
    const draft = {
      type: 'transfer',
      amount: input.cash.amount,
      occurredAt: toISO(input.tradeDate, input.tradeDate === today ? new Date().getHours() * 60 + new Date().getMinutes() : null),
      categoryId: null,
      method: input.cash.method,
      accountId: input.cash.method === 'card' ? null : input.cash.accountId,
      cardId: input.cash.method === 'card' ? input.cash.cardId : null,
      payee: holding.name,
      note: input.note,
      linkType: 'investment',
      linkId: tradeId,
      splitWith: null,
      flags: input.side === 'sell' ? SALE_FLAG : null,
      status: 'confirmed',
      scope: input.scope,
    } satisfies Partial<Transaction>;
    txnId = (txnId && findById('transactions', txnId) ? await saveTransaction(draft, txnId) : await saveTransaction(draft)).id;
  } else if (txnId) {
    // No cash any more (now recorded as a gift or exchange): the money entry goes.
    await remove('transactions', txnId);
    txnId = null;
  }

  const trade = {
    holdingId: holding.id,
    side: input.side,
    tradeDate: input.tradeDate,
    amount: input.amount,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    charges: input.charges,
    taxes: input.taxes,
    refRate: input.refRate,
    refSource: input.refRate === null ? null : 'manual',
    txnId,
    scope: input.scope,
  };
  const saved = existing ? await update('trades', existing.id, trade) : await insert('trades', { ...trade, id: tradeId });
  if (holding.closed && input.side === 'buy') await update('holdings', holding.id, { closed: 0 });
  return saved;
}

/** Delete a trade and its cash entry. */
export async function deleteInvestment(tradeId: string): Promise<void> {
  const trade = findById('trades', tradeId);
  if (!trade) return;
  await remove('trades', tradeId);
  if (trade.txnId && findById('transactions', trade.txnId)) await remove('transactions', trade.txnId);
}

/** Mark a holding sold out (or open again): hidden from the list by default, kept in history. */
export const setHoldingClosed = (holdingId: string, closed: boolean) => update('holdings', holdingId, { closed: closed ? 1 : 0 });

/** Rename, change owner, or set the last known price of a holding. */
export const updateHolding = (holdingId: string, patch: Partial<Pick<Holding, 'name' | 'symbol' | 'memberId' | 'priceNow' | 'priceAsOf' | 'note'>>) => update('holdings', holdingId, patch);
