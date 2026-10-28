import { parseLooseDate, parseTime, type YMD } from '../dates';
import { parseAmount } from '../money';
import type { SmsFormat } from '../types';
import { cleanName, findBalance, findBank, findVpa, titleCase, type ParsedTxn } from './common';

/**
 * User-taught SMS formats. The user pastes one sample message and taps the words that are the
 * amount, payee, date… We turn that into a pattern: tagged words become capture groups, words
 * containing digits become "any word" (they change every message), other words stay literal.
 * Only this small grammar is ever generated, so patterns stay fast and safe.
 */
export type TokenRole = 'amount' | 'payee' | 'date' | 'account' | 'card' | 'ref';

export const ROLE_LABEL: Record<TokenRole, string> = {
  amount: 'Amount',
  payee: 'Paid to / from',
  date: 'Date',
  account: 'A/c no.',
  card: 'Card no.',
  ref: 'Reference',
};

export const tokenize = (sample: string): string[] => sample.trim().split(/\s+/).filter(Boolean);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface BuiltPattern {
  pattern: string;
  roles: TokenRole[];
}

/** `tags[i]` is the role of token i (or null). Consecutive tokens with the same role form one group. */
export function buildPattern(tokens: string[], tags: (TokenRole | null)[]): BuiltPattern {
  const parts: string[] = [];
  const roles: TokenRole[] = [];
  for (let i = 0; i < tokens.length; ) {
    const role = tags[i];
    if (role) {
      let j = i;
      while (j + 1 < tokens.length && tags[j + 1] === role) j++;
      const multi = j > i || role === 'payee';
      const last = j === tokens.length - 1;
      parts.push(multi ? (last ? '(.+)' : '(.+?)') : '(\\S+)');
      roles.push(role);
      i = j + 1;
    } else {
      parts.push(/\d/.test(tokens[i]) ? '\\S+' : escapeRe(tokens[i]));
      i++;
    }
  }
  return { pattern: parts.join('\\s+'), roles };
}

/** Only accept patterns in the grammar `buildPattern` produces (e.g. when received from another phone). */
export function isSafePattern(pattern: string): boolean {
  if (!pattern || pattern.length > 2000) return false;
  const GROUPS = new Set(['(\\S+)', '(.+?)', '(.+)', '\\S+']);
  // A literal word: plain characters, or regex specials escaped with a backslash.
  const LITERAL = /^(?:[^\\()[\]{}*+?|^$.]|\\[.*+?^${}()|[\]\\])+$/;
  return pattern.split('\\s+').every((part) => GROUPS.has(part) || LITERAL.test(part));
}

function compile(pattern: string): RegExp | null {
  if (!isSafePattern(pattern)) return null;
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

const last4 = (s: string | undefined) => s?.replace(/\D/g, '').slice(-4) || null;

export interface FormatStep {
  role: TokenRole;
  /** The fixed words just before the value, e.g. "Txn" for "Txn Rs.300.00"; null at the start. */
  after: string | null;
  /** Changing words (numbers) between `after` and the value. */
  skip: number;
}

/**
 * What a format looks for, in words: "after “Txn” → Amount". Read back from the saved pattern, so it
 * works for formats taught on another phone too.
 */
export function describeFormat(pattern: string, roles: string | TokenRole[]): FormatStep[] {
  let list: TokenRole[];
  try {
    list = typeof roles === 'string' ? JSON.parse(roles) : roles;
  } catch {
    return [];
  }
  const steps: FormatStep[] = [];
  const words: string[] = [];
  let skip = 0;
  let group = 0;
  for (const part of pattern.split('\\s+')) {
    if (part.startsWith('(')) {
      const role = list[group++];
      if (role) steps.push({ role, after: words.length ? words.slice(-2).join(' ') : null, skip });
      words.length = 0;
      skip = 0;
    } else if (part === '\\S+') {
      skip++;
    } else {
      if (skip) words.length = 0;
      skip = 0;
      words.push(part.replace(/\\(.)/g, '$1'));
    }
  }
  return steps;
}

export function applyFormat(format: Pick<SmsFormat, 'pattern' | 'roles' | 'direction' | 'isCard' | 'sender' | 'active'>, sender: string, body: string, received: YMD): ParsedTxn | null {
  if (!format.active) return null;
  // A pasted SMS has no sender: the pattern alone decides.
  if (format.sender && sender && !sender.toLowerCase().includes(format.sender.toLowerCase())) return null;
  const re = compile(format.pattern);
  if (!re) return null;
  const text = body.replace(/\s+/g, ' ').trim();
  const m = text.match(re);
  if (!m) return null;

  let roles: TokenRole[];
  try {
    roles = JSON.parse(format.roles);
  } catch {
    return null;
  }
  const value = (role: TokenRole) => {
    const idx = roles.indexOf(role);
    return idx >= 0 ? m[idx + 1] : undefined;
  };
  const amount = parseAmount(value('amount'));
  if (!amount) return null;
  const dateText = value('date');
  const payee = cleanName(value('payee')?.replace(/[.;,]+$/, ''));
  const vpa = findVpa(text);
  return {
    kind: 'transaction',
    direction: format.direction,
    amount,
    date: (dateText && parseLooseDate(dateText, received)) || received,
    time: parseTime(text),
    payee: titleCase(payee) ?? vpa,
    vpa,
    ref: value('ref')?.replace(/[^A-Za-z0-9]/g, '') || null,
    accountLast4: format.isCard ? null : last4(value('account')),
    cardLast4: format.isCard ? last4(value('card') ?? value('account')) : null,
    isCreditCard: Boolean(format.isCard),
    isRefund: format.direction === 'credit' && /refund|reversal/i.test(text),
    balance: findBalance(text),
    bank: findBank(`${sender} ${text}`),
    app: null,
    confidence: 0.9,
  };
}
