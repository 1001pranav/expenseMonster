/**
 * Small on-device models are unreliable at arithmetic. The assistant may only repeat numbers
 * that our own code produced (tool results) or that the user typed; anything else is treated
 * as made up and the reply is rejected.
 */

/** Every number written in `text`: "₹1,20,000.50" → 120000.5, "45%" → 45, "2026-09-12" → 2026, 9, 12. */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const v = Number(m[0].replace(/,/g, ''));
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

const key = (v: number) => Math.round(v * 100);

/** Too generic to be a claim ("1 card", "0 overdue"). */
const TRIVIAL = new Set([0, 1].map(key));

export interface Grounding {
  ok: boolean;
  /** Numbers in the reply found in no source. */
  unsupported: number[];
}

export function checkGrounding(reply: string, sources: string[]): Grounding {
  const allowed = new Set<number>(TRIVIAL);
  for (const s of sources) for (const v of numbersIn(s)) allowed.add(key(v));
  const unsupported = [...new Set(numbersIn(reply).filter((v) => !allowed.has(key(v))))];
  return { ok: unsupported.length === 0, unsupported };
}
