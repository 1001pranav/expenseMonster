import type { CategoryRule, PayMethod, RuleField, RuleSource, TxnSource } from './types';

export interface RuleInput {
  payee: string | null;
  vpa: string | null;
  /** Everything a screenshot or SMS said; absent for typed entries. */
  text?: string | null;
  source: TxnSource;
}

export interface RuleOutcome {
  categoryId?: string;
  method?: PayMethod;
  cardId?: string;
  accountId?: string;
  payee?: string;
  /** Rules that set at least one thing, in the order they won. */
  ruleIds: string[];
}

/** What still exists, so a rule pointing at a deleted card or category sets nothing. */
export interface RuleTargets {
  categoryIds: Set<string>;
  cardIds: Set<string>;
  accountIds: Set<string>;
}

// Rows synced from a phone on an older version have no value for the newer columns yet.
const fieldOf = (r: CategoryRule): RuleField => (r.field === 'text' ? 'text' : 'payee');
const sourceOf = (r: CategoryRule): RuleSource => (r.source === 'ocr' || r.source === 'sms' ? r.source : 'any');
export const isLearned = (r: CategoryRule) => r.learned !== 0;

export function ruleMatches(r: CategoryRule, input: RuleInput): boolean {
  const pattern = r.pattern?.trim().toLowerCase();
  if (r.deletedAt || !pattern) return false;
  const source = sourceOf(r);
  if (source !== 'any' && source !== input.source) return false;
  const who = `${input.payee ?? ''} ${input.vpa ?? ''}`;
  const haystack = fieldOf(r) === 'text' ? `${input.text ?? ''} ${who}` : who;
  return haystack.toLowerCase().includes(pattern);
}

/** Your own rules first, then learned ones; within each, the more specific (longer) pattern first. */
export function orderRules(rules: CategoryRule[]): CategoryRule[] {
  return [...rules].sort((a, b) => Number(isLearned(a)) - Number(isLearned(b)) || (b.pattern?.length ?? 0) - (a.pattern?.length ?? 0));
}

/** Everything the matching rules set. For each field the first rule (see orderRules) that sets it wins. */
export function applyRules(rules: CategoryRule[], input: RuleInput, targets: RuleTargets): RuleOutcome {
  const out: RuleOutcome = { ruleIds: [] };
  for (const r of orderRules(rules)) {
    if (!ruleMatches(r, input)) continue;
    let used = false;
    if (out.categoryId === undefined && r.categoryId && targets.categoryIds.has(r.categoryId)) {
      out.categoryId = r.categoryId;
      used = true;
    }
    if (!isLearned(r)) {
      if (out.method === undefined && r.method) {
        if (r.method === 'card') {
          if (r.cardId && targets.cardIds.has(r.cardId)) {
            out.method = 'card';
            out.cardId = r.cardId;
            used = true;
          }
        } else {
          out.method = r.method;
          if (r.accountId && targets.accountIds.has(r.accountId)) out.accountId = r.accountId;
          used = true;
        }
      }
      if (out.payee === undefined && r.rename?.trim()) {
        out.payee = r.rename.trim();
        used = true;
      }
    }
    if (used) out.ruleIds.push(r.id);
  }
  return out;
}

export interface RuleNames {
  category: (id: string) => string | undefined;
  card: (id: string) => string | undefined;
  account: (id: string) => string | undefined;
}

const METHOD_NAMES: Record<PayMethod, string> = { upi: 'UPI', bank: 'bank', cash: 'cash', card: 'card', wallet: 'wallet' };

/** A rule as plain sentences: "When a screenshot mentions “credit card”" / "Paid with HDFC Millennia". */
export function describeRule(r: CategoryRule, names: RuleNames): { when: string; then: string[] } {
  const where = { any: '', ocr: 'a screenshot', sms: 'an SMS' }[sourceOf(r)];
  const when =
    fieldOf(r) === 'text'
      ? `When ${where || 'a screenshot or SMS'} mentions “${r.pattern}”`
      : `When the payee contains “${r.pattern}”${where ? ` in ${where}` : ''}`;
  const then: string[] = [];
  if (r.rename?.trim() && !isLearned(r)) then.push(`Call it ${r.rename.trim()}`);
  if (r.categoryId) then.push(`File under ${names.category(r.categoryId) ?? 'a deleted category'}`);
  if (r.method && !isLearned(r)) {
    if (r.method === 'card') then.push(`Paid with ${(r.cardId && names.card(r.cardId)) || 'a deleted card'}`);
    else then.push(`Paid by ${METHOD_NAMES[r.method]}${r.accountId && names.account(r.accountId) ? ` from ${names.account(r.accountId)}` : ''}`);
  }
  if (!then.length) then.push('Does nothing yet');
  return { when, then };
}

export function ruleTargets(tables: { categories: { id: string; deletedAt: string | null }[]; cards: { id: string; deletedAt: string | null }[]; accounts: { id: string; deletedAt: string | null }[] }): RuleTargets {
  const ids = (rows: { id: string; deletedAt: string | null }[]) => new Set(rows.filter((r) => !r.deletedAt).map((r) => r.id));
  return { categoryIds: ids(tables.categories), cardIds: ids(tables.cards), accountIds: ids(tables.accounts) };
}
