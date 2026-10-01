/**
 * Money is always an integer number of paise. Never store or add rupee floats.
 */
export type Paise = number;

export const toPaise = (rupees: number): Paise => Math.round(rupees * 100);
export const toRupees = (paise: Paise): number => paise / 100;

/** Parse user/OCR text like "₹1,23,456.50", "Rs. 1840", "INR 99" into paise. */
export function parseAmount(input: string | null | undefined): Paise | null {
  if (!input) return null;
  const cleaned = input
    .replace(/(?:₹|rs\.?|inr)/gi, '')
    .replace(/[,\s]/g, '')
    .replace(/[^\d.]/g, '');
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const match = cleaned.match(/^\d+(?:\.\d{1,2})?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

/** Indian digit grouping: 1234567 -> "12,34,567". */
function groupIndian(intPart: string): string {
  if (intPart.length <= 3) return intPart;
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

export interface FormatOptions {
  /** Show paise even when zero. Default: only when non-zero. */
  decimals?: 'auto' | 'always' | 'never';
  /** Prefix "+" for positive values. */
  signed?: boolean;
  /** 1.2L / 3.4Cr / 12.5K style. */
  compact?: boolean;
  symbol?: boolean;
}

export function formatINR(paise: Paise, opts: FormatOptions = {}): string {
  const { decimals = 'auto', signed = false, compact = false, symbol = true } = opts;
  const negative = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const sign = negative ? '-' : signed && abs > 0 ? '+' : '';
  const sym = symbol ? '₹' : '';

  if (compact) {
    const rupees = abs / 100;
    const units: [number, string][] = [
      [1e7, 'Cr'],
      [1e5, 'L'],
      [1e3, 'K'],
    ];
    for (const [size, suffix] of units) {
      if (rupees >= size) {
        const v = rupees / size;
        const text = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1).replace(/\.0$/, '') : v.toFixed(2).replace(/\.?0+$/, '');
        return `${sign}${sym}${text}${suffix}`;
      }
    }
  }

  const rupeesInt = Math.floor(abs / 100);
  const fraction = abs % 100;
  const showFraction = decimals === 'always' || (decimals === 'auto' && fraction !== 0);
  const body = groupIndian(String(rupeesInt)) + (showFraction ? `.${String(fraction).padStart(2, '0')}` : '');
  return `${sign}${sym}${body}`;
}

/** Spoken form for screen readers: "1,234 rupees 50 paise". */
export function spokenINR(paise: Paise): string {
  const abs = Math.abs(paise);
  const r = Math.floor(abs / 100);
  const p = abs % 100;
  return `${paise < 0 ? 'minus ' : ''}${r} rupees${p ? ` ${p} paise` : ''}`;
}

export const sum = (values: Paise[]): Paise => values.reduce((a, b) => a + b, 0);

/** Split an amount into n parts that add back up exactly (first parts absorb the remainder). */
export function splitEvenly(total: Paise, n: number): Paise[] {
  if (n <= 0) return [];
  const base = Math.trunc(total / n);
  let remainder = total - base * n;
  return Array.from({ length: n }, () => {
    if (remainder > 0) {
      remainder -= 1;
      return base + 1;
    }
    if (remainder < 0) {
      remainder += 1;
      return base - 1;
    }
    return base;
  });
}
