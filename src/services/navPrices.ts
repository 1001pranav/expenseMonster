import { findScheme, parseNavFile, type SchemeNav } from '@/domain/navFile';
import type { Paise } from '@/domain/money';
import type { Holding } from '@/domain/types';
import { getState } from '@/db/store';
import { logFailure, logInfo } from './diagnostics';

/**
 * Fund prices from AMFI's public daily NAV file (domain/navFile.ts). Only when the user asks, never
 * in the background. The whole file is downloaded (a few MB) and searched on the phone, so nobody
 * learns which funds the family holds. AMFI's terms allow personal, non-commercial use; its data
 * comes from the fund houses and AMFI doesn't vouch for it, so every price is shown with its date
 * and source before it is saved, and stays editable.
 */

const SOURCES = ['https://www.amfiindia.com/spages/NAVAll.txt', 'https://portal.amfiindia.com/spages/NAVAll.txt'];
/** NAVs change once a day: within a session one download serves every screen for a few hours. */
const FRESH_MS = 4 * 60 * 60 * 1000;
let cache: { at: number; schemes: SchemeNav[] } | null = null;

async function download(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`AMFI answered ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Every scheme's latest NAV. Throws with a readable message when AMFI can't be reached or the file has changed. */
export async function loadSchemes(force = false): Promise<SchemeNav[]> {
  if (!force && cache && Date.now() - cache.at < FRESH_MS) return cache.schemes;
  let lastError: unknown = null;
  for (const url of SOURCES) {
    try {
      const schemes = parseNavFile(await download(url));
      if (!schemes.length) throw new Error('The AMFI NAV file had no prices');
      cache = { at: Date.now(), schemes };
      // React Native's URL doesn't implement .host.
      logInfo(`fund prices: ${schemes.length} schemes from ${url.replace(/^https:\/\/([^/]+).*$/, '$1')}`);
      return schemes;
    } catch (e) {
      lastError = e;
      logFailure(`fund prices: ${url} failed`, e, 'warn');
    }
  }
  const msg = (lastError as Error)?.message ?? '';
  throw new Error(/column|AMFI NAV file/.test(msg) ? `${msg}. Enter prices by hand until the app is updated.` : "Couldn't reach AMFI. Check the connection, or enter prices by hand.");
}

export interface NavProposal {
  holding: Holding;
  scheme: SchemeNav;
  current: Paise | null;
}

/** Proposed new prices for the family's funds (to show before saving), and funds with no scheme code to match. */
export async function proposeFundPrices(): Promise<{ proposals: NavProposal[]; unmatched: Holding[] }> {
  // Hidden (sold) funds don't need a price.
  const funds = getState().tables.holdings.filter((h) => !h.deletedAt && !h.closed && h.assetClass === 'mf');
  if (!funds.length) return { proposals: [], unmatched: [] };
  const schemes = await loadSchemes();
  const proposals: NavProposal[] = [];
  const unmatched: Holding[] = [];
  for (const h of funds) {
    const scheme = findScheme(schemes, h.symbol);
    if (scheme) proposals.push({ holding: h, scheme, current: h.priceNow });
    else unmatched.push(h);
  }
  return { proposals, unmatched };
}
