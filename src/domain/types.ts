import type { Paise } from './money';
import type { YMD } from './dates';

export type Scope = 'personal' | 'household';

/** Columns every synced row carries. */
export interface BaseRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deviceId: string;
  scope: Scope;
  /** Fields from a newer app version, as JSON (domain/sync/forward.ts). Never edited by this version. */
  extra?: string | null;
}

export type AccountType = 'bank' | 'cash' | 'wallet';
export interface Account extends BaseRow {
  name: string;
  type: AccountType;
  last4: string | null;
  openingBalance: Paise;
}

export interface CreditCard extends BaseRow {
  name: string;
  last4: string | null;
  /** Day of month the statement is generated (1–31, clamped in short months). */
  statementDay: number;
  /** Day of month payment is due (the first such day after the statement date). */
  dueDay: number;
  creditLimit: Paise | null;
  color: string | null;
}

/** Actual statement figures from the bank, which can differ from our computed total (fees, interest, GST). */
export interface CardStatementOverride extends BaseRow {
  cardId: string;
  statementDate: YMD;
  total: Paise;
  minDue: Paise | null;
}

export type CategoryKind = 'expense' | 'income';
export interface Category extends BaseRow {
  name: string;
  icon: string;
  color: string;
  kind: CategoryKind;
  parentId: string | null;
  sortOrder: number;
}

export interface Member extends BaseRow {
  name: string;
  upiId: string | null;
  phone: string | null;
  color: string;
}

export type TxnType = 'expense' | 'income' | 'transfer' | 'settlement';
export type PayMethod = 'upi' | 'bank' | 'cash' | 'card' | 'wallet';
export type TxnSource = 'manual' | 'ocr' | 'sms' | 'upi' | 'sync' | 'bill';
export type TxnStatus = 'pending' | 'confirmed' | 'rejected';
/** What obligation a transaction pays / settles. */
export type LinkType = 'bill' | 'loan' | 'policy' | 'card' | 'income' | 'investment' | null;

export interface Transaction extends BaseRow {
  type: TxnType;
  amount: Paise;
  /** ISO timestamp. */
  occurredAt: string;
  categoryId: string | null;
  accountId: string | null;
  method: PayMethod;
  /** Card charged (expense via card) or card paid (transfer to card). */
  cardId: string | null;
  payee: string | null;
  vpa: string | null;
  note: string | null;
  /** Member who paid (expense) / sent (settlement). */
  memberId: string | null;
  /** Settlement receiver. */
  toMemberId: string | null;
  /** JSON array of member ids sharing an expense equally. */
  splitWith: string | null;
  /** JSON array of {categoryId, amount} splits. */
  splits: string | null;
  linkType: LinkType;
  linkId: string | null;
  source: TxnSource;
  /** UPI ref / UTR for de-duplication. */
  sourceRef: string | null;
  /** Hash of the raw SMS/OCR text (raw text is never stored). */
  sourceHash: string | null;
  /** Parser confidence 0–1 for captured drafts. */
  confidence: number | null;
  /** Flags such as "refund", "card-hint:1234", "duplicate-of:<id>". */
  flags: string | null;
  status: TxnStatus;
  attachment: string | null;
}

export type LoanDirection = 'borrowed' | 'lent';
export type LoanKind = 'home' | 'car' | 'personal' | 'education' | 'gold' | 'business' | 'informal' | 'other' | 'card_emi';
export type InterestType = 'reducing' | 'flat' | 'none';
export interface Loan extends BaseRow {
  name: string;
  direction: LoanDirection;
  kind: LoanKind;
  lender: string | null;
  memberId: string | null;
  principal: Paise;
  /** Annual rate in percent, e.g. 8.5. */
  ratePa: number;
  interestType: InterestType;
  tenureMonths: number;
  /** Date of the first EMI. */
  firstEmiDate: YMD;
  emi: Paise;
  /** EMIs paid before this app started tracking the loan. */
  paidBeforeTracking: number;
  closed: 0 | 1;
  upiId: string | null;
  note: string | null;
  /** Card EMI: the card it's billed on (null for ordinary loans). */
  cardId: string | null;
  /** Card EMI: the purchase that was converted; it leaves its statement and is billed in instalments. */
  sourceTxnId: string | null;
  /** Card EMI: one-time processing fee, billed with the first instalment (GST added). */
  processingFee: Paise;
}

export type BillerType =
  | 'electricity'
  | 'water'
  | 'gas'
  | 'lpg'
  | 'broadband'
  | 'postpaid'
  | 'prepaid'
  | 'dth'
  | 'fastag'
  | 'rent'
  | 'maintenance'
  | 'school'
  | 'salary'
  | 'subscription'
  | 'other';
export type AmountMode = 'fixed' | 'variable' | 'prepaid' | 'on_demand';
export type Frequency = 'monthly' | 'bimonthly' | 'quarterly' | 'half_yearly' | 'yearly';

export interface Biller extends BaseRow {
  name: string;
  type: BillerType;
  provider: string | null;
  consumerNo: string | null;
  frequency: Frequency;
  amountMode: AmountMode;
  /** For fixed billers (rent, broadband) or the usual plan price for prepaid. */
  fixedAmount: Paise | null;
  /** Day of month the bill normally arrives / fixed bill is generated. */
  billDay: number;
  /** Days between bill date and due date. */
  dueOffsetDays: number;
  autopay: 0 | 1;
  defaultMethod: PayMethod | null;
  defaultCardId: string | null;
  upiId: string | null;
  /** Prepaid: validity of a recharge in days. */
  validityDays: number | null;
  categoryId: string | null;
  usageUnit: string | null;
  active: 0 | 1;
}

export type BillStatus = 'draft' | 'open' | 'paid' | 'skipped';
export interface Bill extends BaseRow {
  billerId: string;
  periodFrom: YMD | null;
  periodTo: YMD | null;
  billDate: YMD;
  dueDate: YMD;
  amount: Paise;
  lateFee: Paise;
  usage: number | null;
  /** Prepaid recharge valid until. */
  validUntil: YMD | null;
  status: BillStatus;
  attachment: string | null;
  sourceHash: string | null;
}

export type PolicyType = 'life' | 'term' | 'health' | 'vehicle' | 'home' | 'other';
export interface Policy extends BaseRow {
  type: PolicyType;
  insurer: string;
  policyNo: string | null;
  name: string;
  sumAssured: Paise | null;
  premium: Paise;
  frequency: Frequency;
  nextDueDate: YMD;
  /** Policy end / maturity. */
  endDate: YMD | null;
  coveredMemberIds: string | null;
  nominee: string | null;
  autopay: 0 | 1;
  active: 0 | 1;
}

export interface RecurringIncome extends BaseRow {
  name: string;
  amount: Paise;
  frequency: Frequency;
  nextDate: YMD;
  accountId: string | null;
  categoryId: string | null;
  active: 0 | 1;
}

export interface Budget extends BaseRow {
  categoryId: string;
  /** "YYYY-MM", or "*" for every month. */
  month: string;
  amount: Paise;
}

/** Where a rule looks for its words: the payee (and UPI ID), or everything a screenshot / SMS said. */
export type RuleField = 'payee' | 'text';
/** Which captures a rule applies to. Typed entries only ever match "any" + payee rules. */
export type RuleSource = 'any' | 'ocr' | 'sms';

/**
 * "When <field> contains <pattern> (in <source>), then …". Learned rules (learned = 1) are made
 * from what the user files and only set the category; the user's own rules can also set how it
 * was paid and rename the payee, and win over learned rules and past filing.
 */
export interface CategoryRule extends BaseRow {
  /** Lower-case fragment to look for. */
  pattern: string;
  /** Category to file under; '' leaves the category alone. */
  categoryId: string;
  field: RuleField;
  source: RuleSource;
  method: PayMethod | null;
  cardId: string | null;
  accountId: string | null;
  /** Payee name to use instead of what was read. */
  rename: string | null;
  learned: 0 | 1;
}

/** A bank SMS format taught by the user from one sample message (see parsers/custom.ts). */
export interface SmsFormat extends BaseRow {
  name: string;
  /** Substring of the sender id, e.g. "MYBANK" for "VM-MYBANK". Null = any sender. */
  sender: string | null;
  pattern: string;
  /** JSON array of TokenRole, one per capture group. */
  roles: string;
  direction: 'debit' | 'credit';
  isCard: 0 | 1;
  active: 0 | 1;
}

export type AssetClass = 'gold' | 'silver' | 'equity' | 'mf' | 'bond' | 'fixed' | 'other';
export type QuantityUnit = 'g' | 'share' | 'unit' | 'bond' | 'none';
export type FundType = 'equity' | 'debt' | 'hybrid' | 'gold' | 'international';

/** Something the family owns: "22K gold", "INFY", a fund. Its quantity and cost come from its trades. */
export interface Holding extends BaseRow {
  assetClass: AssetClass;
  /** jewellery | coin | digital | sgb | etf | sip | lumpsum | fd | ppf | ... (domain/investments.ts). */
  form: string | null;
  /** Mutual funds: what the fund invests in, which decides the tax on gains. Null = not said. */
  fundType: FundType | null;
  name: string;
  /** NSE/BSE ticker, AMFI scheme code. */
  symbol: string | null;
  unit: QuantityUnit;
  /** '999', '916', '925'… */
  purity: string | null;
  /** Whose it is; null = held jointly by the household. */
  memberId: string | null;
  /** Last known price per unit (paise), entered by hand until online prices exist. */
  priceNow: Paise | null;
  priceAsOf: string | null;
  /** 'manual' (entered here), 'amfi' (AMFI's daily NAV file) or 'cas' (a CDSL/NSDL statement); null for older entries. */
  priceSource: string | null;
  /** Bonds: face value per bond (paise). */
  faceValue: Paise | null;
  /** Bonds: coupon, percent a year. */
  couponRate: number | null;
  /** Bonds: when it matures. */
  maturityDate: YMD | null;
  closed: 0 | 1;
  note: string | null;
}

/**
 * One buy or sell of a holding. `amount` is the trade's own value; the cash that moved, if any, is the
 * transaction `txnId` (a transfer, linkType investment). They differ when no cash moves: a gift, an
 * old piece of jewellery traded in for a new one.
 */
export interface Trade extends BaseRow {
  holdingId: string;
  side: 'buy' | 'sell';
  tradeDate: YMD;
  /** Buy: cost including charges and taxes. Sell: what was received, after them. 0 when not entered (amountUnknown). */
  amount: Paise;
  /** 1 when the amount wasn't entered: it is unknown, not zero (a cost of 0 would make any sale look like pure gain). */
  amountUnknown: 0 | 1;
  /** Thousandths of the holding's unit (10.5 g = 10500, 3 shares = 3000); null = not entered. */
  quantity: number | null;
  /** Paise per unit actually paid, before charges and taxes; null = not entered. */
  unitPrice: Paise | null;
  /** Making charges, brokerage, stamp duty… */
  charges: Paise;
  /** GST, STT… */
  taxes: Paise;
  /** Market rate that day, paise per unit (optional reference, e.g. the day's gold rate). */
  refRate: Paise | null;
  /** 'manual', or where a fetched rate came from. */
  refSource: string | null;
  txnId: string | null;
}

/** A phone in the household. Each phone publishes its own (id = its deviceId). */
export interface Device extends BaseRow {
  name: string;
  /** X25519 public key (base64) the head seals a new household key to (domain/sync/grant.ts). */
  publicKey: string | null;
}

/** The household's one shared record (id "household"): who is head. Only the head can change it. */
export interface HouseholdInfo extends BaseRow {
  headDeviceId: string | null;
  /** Id of the household key in use since the head last removed a phone (domain/sync/grant.ts). */
  keyId: string | null;
  /** JSON array of removed phones' device ids. */
  removed: string | null;
}

/** A new household key sealed to one remaining phone's public key, after the head removed a phone. */
export interface KeyGrant extends BaseRow {
  recipient: string;
  keyId: string;
  sealed: string;
}

export type HoldDecision = 'hold' | 'merge' | 'discard';

/**
 * A head's rule about edits from other phones (domain/sync/holds.ts). It covers one entry
 * (tbl + recordId), or edits by one phone (holdDevice), saved in a time range (since/until), or both.
 */
export interface SyncHold extends BaseRow {
  /** Phone whose edits are covered; null = any phone (with a time range). (`deviceId` is who made the rule.) */
  holdDevice: string | null;
  /** Edits saved at or after this UTC time ("a particular day" = that day's local midnight to the next). */
  since: string | null;
  /** Edits saved before this UTC time. */
  until: string | null;
  tbl: string | null;
  recordId: string | null;
  decision: HoldDecision;
  note: string | null;
}

export interface Peer {
  deviceId: string;
  name: string;
  lastSentAt: string | null;
  lastReceivedAt: string | null;
  pairedAt: string;
}

export interface TableMap {
  accounts: Account;
  cards: CreditCard;
  card_overrides: CardStatementOverride;
  categories: Category;
  members: Member;
  transactions: Transaction;
  loans: Loan;
  billers: Biller;
  bills: Bill;
  policies: Policy;
  incomes: RecurringIncome;
  budgets: Budget;
  rules: CategoryRule;
  sms_formats: SmsFormat;
  devices: Device;
  household: HouseholdInfo;
  sync_holds: SyncHold;
  key_grants: KeyGrant;
  holdings: Holding;
  trades: Trade;
}
export type TableName = keyof TableMap;
// Control tables first: a file or page that changes the head or a rule is applied before the data it covers.
export const SYNC_TABLES: TableName[] = [
  'devices',
  'household',
  'sync_holds',
  'key_grants',
  'categories',
  'holdings',
  'trades',
  'members',
  'accounts',
  'cards',
  'card_overrides',
  'loans',
  'billers',
  'bills',
  'policies',
  'incomes',
  'budgets',
  'rules',
  'sms_formats',
  'transactions',
];
