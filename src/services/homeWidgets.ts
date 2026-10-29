import Constants from 'expo-constants';
import { AppState } from 'react-native';
import { todayYMD } from '@/domain/dates';
import { computeDues } from '@/domain/dues';
import { widgetSnapshot } from '@/domain/widgets';
import { getState, useStore } from '@/db/store';
import { homeWidgetsAvailable, updateHomeWidgets } from '../../modules/home-widgets';
import { logFailure } from './diagnostics';

/** Same window as the Home "Due soon" list. */
const DUE_DAYS = 14;

let last = '';

/** Rebuild the widgets' snapshot and hand it over when it changed. */
export function refreshHomeWidgets(): void {
  if (!homeWidgetsAvailable()) return;
  try {
    const { tables, settings } = getState();
    const today = todayYMD();
    const dues = computeDues(
      { loans: tables.loans, cards: tables.cards, cardOverrides: tables.card_overrides, billers: tables.billers, bills: tables.bills, policies: tables.policies, incomes: tables.incomes, transactions: tables.transactions },
      today,
      DUE_DAYS,
    );
    const scheme = Constants.expoConfig?.scheme;
    const json = JSON.stringify(
      widgetSnapshot({ transactions: tables.transactions, budgets: tables.budgets, dues, today, hideAmounts: settings.hideAmounts, scheme: (Array.isArray(scheme) ? scheme[0] : scheme) ?? 'expensemonster' }),
    );
    if (json === last) return;
    updateHomeWidgets(json);
    last = json;
  } catch (e) {
    logFailure('widgets: could not update', e, 'warn');
  }
}

/**
 * Keep the home-screen widgets current while the app runs: after data changes (batched, a burst of
 * captures redraws once) and when the app comes back, which may be a new day. Returns a stop function.
 */
export function startHomeWidgets(): () => void {
  if (!homeWidgetsAvailable()) return () => undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(refreshHomeWidgets, 800);
  };
  refreshHomeWidgets();
  const unsubscribe = useStore.subscribe((s, prev) => {
    if (s.version !== prev.version || s.settings.hideAmounts !== prev.settings.hideAmounts) soon();
  });
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') refreshHomeWidgets();
    // Leaving the app: write what's pending now rather than lose it to the timer.
    else if (timer) {
      clearTimeout(timer);
      timer = undefined;
      refreshHomeWidgets();
    }
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
    appState.remove();
  };
}
