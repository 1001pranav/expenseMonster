import * as Linking from 'expo-linking';
import type { Paise } from '@/domain/money';
import { logFailure } from './diagnostics';

export interface UpiRequest {
  /** Payee VPA, e.g. priya@oksbi */
  upiId: string;
  name: string;
  amount?: Paise | null;
  note?: string | null;
}

const VPA = /^[a-z0-9.\-_]{2,256}@[a-z][a-z0-9]{1,64}$/i;
export const isValidUpiId = (v: string | null | undefined): v is string => Boolean(v && VPA.test(v.trim()));

/** NPCI deep link understood by GPay, PhonePe, Paytm, BHIM and bank apps. */
export function buildUpiUrl(req: UpiRequest): string {
  const params: [string, string][] = [
    ['pa', req.upiId.trim()],
    ['pn', req.name.slice(0, 50)],
    ['cu', 'INR'],
  ];
  if (req.amount && req.amount > 0) params.push(['am', (req.amount / 100).toFixed(2)]);
  if (req.note) params.push(['tn', req.note.slice(0, 50)]);
  return `upi://pay?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

/**
 * Hands off to a UPI app. Returns false if no UPI app is installed.
 * The result of the payment is NOT reliably reported back by UPI apps, so the caller
 * must ask the user whether it succeeded when the app returns to the foreground.
 */
export async function openUpi(req: UpiRequest): Promise<boolean> {
  const url = buildUpiUrl(req);
  try {
    await Linking.openURL(url);
    return true;
  } catch (e) {
    logFailure('upi: no app opened the payment link', e, 'warn');
    return false;
  }
}
