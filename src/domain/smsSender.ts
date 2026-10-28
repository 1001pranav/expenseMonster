import type { SmsSender } from './types';

/**
 * One spelling per sender, so "VM-HDFCBK", "AD-HDFCBK-S" and "hdfcbk" are the same bank and
 * "+91 98765 43210" matches "9876543210". Phone numbers keep their last 10 digits; DLT sender IDs
 * lose the 2-letter operator prefix and the 1-letter type suffix.
 */
export function normalizeSender(raw: string | null | undefined): string {
  const s = (raw ?? '').trim().toUpperCase();
  if (!s) return '';
  if (/^[+\d][\d\s()-]{5,}$/.test(s)) return s.replace(/\D/g, '').slice(-10);
  return s
    .replace(/^[A-Z]{2}-(?=[A-Z0-9]{4})/, '')
    .replace(/-[A-Z]$/, '')
    .replace(/[^A-Z0-9]/g, '');
}

export const isPhoneSender = (normalized: string) => /^\d+$/.test(normalized);

/** The user's mark for this sender, if any (deleted rows are already gone from the store). */
export function findSender(senders: SmsSender[], raw: string | null | undefined): SmsSender | undefined {
  const key = normalizeSender(raw);
  return key ? senders.find((s) => s.sender === key) : undefined;
}

/** Senders the Android importer should read even though they don't look like a bank (phone numbers). */
export const allowedSenders = (senders: SmsSender[]) => senders.filter((s) => s.kind === 'bank').map((s) => s.sender);
