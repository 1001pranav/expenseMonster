import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { addDays, toDate, todayYMD } from '@/domain/dates';
import { computeDues, computeReminders } from '@/domain/dues';
import { getState } from '@/db/store';

const CHANNEL = 'dues';
const CATEGORY = 'due';
export const ACTION_PAY = 'pay';
export const ACTION_PAID = 'paid';
export const ACTION_SNOOZE = 'snooze';

let configured = false;

export async function configureNotifications() {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Payment reminders',
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  }
  await Notifications.setNotificationCategoryAsync(CATEGORY, [
    { identifier: ACTION_PAY, buttonTitle: 'Pay now', options: { opensAppToForeground: true } },
    { identifier: ACTION_PAID, buttonTitle: 'Mark paid', options: { opensAppToForeground: true } },
    { identifier: ACTION_SNOOZE, buttonTitle: 'Snooze 1 day', options: { opensAppToForeground: false } },
  ]);
}

export async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/**
 * Local notifications only: nothing leaves the phone. We cancel and rebuild the whole
 * schedule from current data after changes, which is simpler and safer than tracking
 * individual notification ids (Android keeps scheduled alarms across reboots).
 */
export async function rescheduleAll(): Promise<number> {
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return 0;
  const { tables, settings } = getState();
  const now = new Date();
  const today = todayYMD(now);
  const dues = computeDues(
    {
      loans: tables.loans,
      cards: tables.cards,
      cardOverrides: tables.card_overrides,
      billers: tables.billers,
      bills: tables.bills,
      policies: tables.policies,
      incomes: tables.incomes,
      transactions: tables.transactions,
    },
    today,
    60,
  );
  const reminders = computeReminders(dues, today, now.getHours());

  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const r of reminders) {
    const at = toDate(r.date, r.hour);
    if (at.getTime() <= now.getTime()) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: r.id,
      content: {
        title: r.title,
        body: r.body,
        data: { href: r.href, dueKey: r.dueKey },
        categoryIdentifier: CATEGORY,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
    });
  }

  const pending = tables.transactions.filter((t) => t.status === 'pending').length + tables.bills.filter((b) => b.status === 'draft').length;
  if (settings.reviewNudge && pending > 0) {
    const at = toDate(now.getHours() >= 21 ? addDays(today, 1) : today, 21);
    await Notifications.scheduleNotificationAsync({
      identifier: 'review-nudge',
      content: { title: `${pending} transaction${pending > 1 ? 's' : ''} to review`, body: 'Captured from SMS & screenshots. Takes a few seconds.', data: { href: '/review' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
    });
  }
  return reminders.length;
}

export async function snooze(request: Notifications.NotificationRequest) {
  const at = new Date(Date.now() + 24 * 3600 * 1000);
  await Notifications.scheduleNotificationAsync({
    content: { ...request.content, categoryIdentifier: CATEGORY } as Notifications.NotificationContentInput,
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
  });
}

let timer: ReturnType<typeof setTimeout> | null = null;
/** Debounced reschedule after data changes. */
export function scheduleSoon() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    rescheduleAll().catch(() => {});
  }, 1500);
}
