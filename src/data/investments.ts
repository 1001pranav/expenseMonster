import { toISO, todayYMD, type YMD } from '@/domain/dates';
import { uuidv7 } from '@/domain/ids';
import { SALE_FLAG, sameMetal } from '@/domain/investments';
import type { Paise } from '@/domain/money';
import type { AssetClass, FundType, Holding, PayMethod, QuantityUnit, Scope, Trade, Transaction } from '@/domain/types';
import { findById, insert, remove, update } from '@/db/repo';
import { getState } from '@/db/store';
import { saveTransaction } from './actions';

/**
 * Saving investments (domain/investments.ts): a holding (created on first purchase), a trade, and the
 * cash transaction when money moved (a transfer, linkType 'investment', flagged 'sale' for a sale).
 */

export interface NewHolding {
  assetClass: AssetClass;
  form: string | null;
  fundType: FundType | null;
  /** Bonds only. */
  faceValue?: Paise | null;
  couponRate?: number | null;
  maturityDate?: YMD | null;
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
      ? await insert('holdings', { faceValue: null, couponRate: null, maturityDate: null, ...input.holding, priceNow: null, priceAsOf: null, priceSource: null, closed: 0, note: null, scope: input.scope })
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

/** Prices fetched and confirmed by the user: each holding gets its scheme's NAV, dated as AMFI dated it. */
export async function applyFundPrices(prices: { holdingId: string; nav: Paise; date: YMD }[]): Promise<void> {
  for (const p of prices) await update('holdings', p.holdingId, { priceNow: p.nav, priceAsOf: p.date, priceSource: 'amfi' });
}

/** Rename, change owner, or set the last known price of a holding. */
export const updateHolding = (holdingId: string, patch: Partial<Pick<Holding, 'name' | 'symbol' | 'memberId' | 'fundType' | 'priceNow' | 'priceAsOf' | 'note'>>) => update('holdings', holdingId, patch);

/** Set a holding's current price (paise per unit); for gold or silver by weight, every holding of that metal and purity. */
export async function setPrice(holdingId: string, price: Paise, opts: { sameMetal?: boolean } = {}): Promise<number> {
  const holding = findById('holdings', holdingId);
  if (!holding) throw new Error('That holding no longer exists');
  const asOf = todayYMD();
  const targets = opts.sameMetal ? getState().tables.holdings.filter((h) => h.id === holding.id || sameMetal(holding, h)) : [holding];
  for (const h of targets) await update('holdings', h.id, { priceNow: price, priceAsOf: asOf, priceSource: 'manual' });
  return targets.length;
}

export interface ExchangeInput {
  date: YMD;
  /** The old piece: what the jeweller valued it at, and how much of it (null = all of it). */
  old: { holdingId: string; quantity: number | null; value: Paise; deductions: Paise };
  /** The new piece, at its full price (charges and GST included). */
  buy: Omit<InvestmentInput, 'side' | 'tradeDate' | 'cash' | 'scope' | 'note'>;
  /** How the difference was paid or received. */
  pay: Omit<CashSide, 'amount'>;
  note: string | null;
  scope: Scope;
}

/**
 * Old jewellery traded in for new (docs/INVESTMENTS_PLAN.md §3a): a sale of the old piece with no
 * cash, and a purchase of the new one at its full price. Only the difference moves as money: paid
 * on top with the purchase, or received with the sale when the old piece was worth more.
 */
export async function saveExchange(x: ExchangeInput): Promise<{ sale: Trade; purchase: Trade; cash: Paise }> {
  const difference = x.buy.amount - x.old.value;
  const common = { tradeDate: x.date, note: x.note, scope: x.scope };
  const sale = await saveInvestment({
    ...common,
    side: 'sell',
    holding: { id: x.old.holdingId },
    amount: x.old.value,
    quantity: x.old.quantity,
    unitPrice: null,
    charges: x.old.deductions,
    taxes: 0,
    refRate: null,
    cash: difference < 0 ? { ...x.pay, method: x.pay.method === 'card' ? 'bank' : x.pay.method, amount: -difference } : null,
  });
  const purchase = await saveInvestment({ ...common, ...x.buy, side: 'buy', cash: difference > 0 ? { ...x.pay, amount: difference } : null });
  return { sale, purchase, cash: difference };
}

export type CasAction =
  | { kind: 'price'; holdingId: string }
  | { kind: 'link'; holdingId: string }
  | { kind: 'add'; cost: Paise }
  | { kind: 'skip' };

/**
 * Apply a statement's holdings (domain/casImport.ts), each as the user chose: update the price of
 * a matched holding, link an existing one (its ISIN is set) and update its price, or add it as an
 * opening balance: a purchase with no money moved, at the cost the user confirmed, dated the
 * statement date. Quantities of matched holdings are never changed: the statement doesn't say what
 * a difference cost.
 */
export async function applyCasImport(
  x: { asOf: YMD; owner: string | null; scope: Scope },
  items: { line: { isin: string; name: string; kind: 'equity' | 'fund' | 'bond' | 'other'; quantity: number; price: Paise; maturity?: YMD | null }; action: CasAction }[],
): Promise<{ priced: number; added: number }> {
  let priced = 0;
  let added = 0;
  const price = (holdingId: string, p: Paise) => update('holdings', holdingId, { priceNow: p, priceAsOf: x.asOf, priceSource: 'cas' });
  for (const { line, action } of items) {
    if (action.kind === 'price') {
      await price(action.holdingId, line.price);
      priced++;
    } else if (action.kind === 'link') {
      await update('holdings', action.holdingId, { symbol: line.isin });
      await price(action.holdingId, line.price);
      priced++;
    } else if (action.kind === 'add') {
      // What the app doesn't import yet (preference shares, REITs…) is only ever skipped.
      if (line.kind === 'other') continue;
      const bond = line.kind === 'bond';
      const trade = await saveInvestment({
        side: 'buy',
        holding: {
          assetClass: line.kind === 'equity' ? 'equity' : bond ? 'bond' : 'mf',
          // Government securities have a numeric issuer character (IN0…IN4).
          form: bond ? ('01234'.includes(line.isin[2]) ? 'gsec' : 'corporate') : null,
          fundType: null,
          name: line.name || line.isin,
          symbol: line.isin,
          unit: line.kind === 'equity' ? 'share' : bond ? 'bond' : 'unit',
          purity: null,
          memberId: x.owner,
          ...(bond ? { maturityDate: line.maturity ?? null } : {}),
        },
        tradeDate: x.asOf,
        amount: action.cost,
        quantity: line.quantity,
        unitPrice: null,
        charges: 0,
        taxes: 0,
        refRate: null,
        cash: null,
        note: 'Opening balance from a consolidated account statement',
        scope: x.scope,
      });
      await price(trade.holdingId, line.price);
      added++;
    }
  }
  return { priced, added };
}
