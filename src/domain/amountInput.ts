/**
 * Editing a typed amount at any cursor position. `raw` is what the user typed ("100000.5"); the
 * screen shows it grouped the Indian way ("1,00,000.5"), so cursor positions are converted between
 * the two (commas are skipped).
 */

export interface Selection {
  start: number;
  end: number;
}

const MAX_RUPEES = 99_99_99_999;

/** "100000.5" → "1,00,000.5" (last three digits, then pairs). */
export function groupAmount(raw: string): string {
  const [int, dec] = raw.split('.');
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const grouped = rest ? `${rest},${last3}` : last3;
  return dec === undefined ? grouped : `${grouped}.${dec}`;
}

/** Position in `raw` for a cursor at `pos` in the grouped text. */
export function toRawIndex(grouped: string, pos: number): number {
  return grouped.slice(0, pos).replace(/,/g, '').length;
}

/** Position in the grouped text for a cursor after `rawPos` raw characters. */
export function toGroupedIndex(grouped: string, rawPos: number): number {
  if (rawPos <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < grouped.length; i++) {
    if (grouped[i] !== ',') seen++;
    if (seen === rawPos) return i + 1;
  }
  return grouped.length;
}

/** A well-formed amount: digits, at most one dot, two decimals, within the limit. */
export function isValidAmountText(raw: string): boolean {
  return raw === '' || (/^\d*(\.\d{0,2})?$/.test(raw) && Number(raw || '0') <= MAX_RUPEES);
}

/**
 * Apply a keypad key ('0'–'9', '.', 'del', 'clear') at the raw selection. A key that would make the
 * amount invalid (second dot, third decimal, over the limit) leaves it unchanged.
 */
export function applyAmountKey(raw: string, sel: Selection, key: string): { raw: string; cursor: number } {
  const start = Math.max(0, Math.min(sel.start, sel.end, raw.length));
  const end = Math.min(raw.length, Math.max(sel.start, sel.end));
  if (key === 'clear') return { raw: '', cursor: 0 };
  let next: string;
  let cursor: number;
  if (key === 'del') {
    if (start !== end) {
      next = raw.slice(0, start) + raw.slice(end);
      cursor = start;
    } else if (start > 0) {
      next = raw.slice(0, start - 1) + raw.slice(start);
      cursor = start - 1;
    } else {
      return { raw, cursor: start };
    }
  } else {
    next = raw.slice(0, start) + key + raw.slice(end);
    cursor = start + key.length;
  }
  if (next.startsWith('.')) {
    next = `0${next}`;
    cursor++;
  }
  // A digit typed after a lone "0" replaces it. Other leading zeros stay while editing: deleting the
  // 1 of 100 to type a 2 passes through "00".
  if (raw === '0' && start === 1 && /^\d$/.test(key)) {
    next = key;
    cursor = 1;
  }
  if (!isValidAmountText(next)) return { raw, cursor: end };
  return { raw: next, cursor };
}
