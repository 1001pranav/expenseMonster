import * as Notifications from 'expo-notifications';
import { reloadAppAsync } from 'expo';
import { destroyDatabase } from '@/db/client';
import { getState } from '@/db/store';
import { wipeAttachments } from './files';
import { wipeSecrets } from './secure';

/** Irreversible: deletes the database, attachments, keys and scheduled reminders, then restarts fresh. */
export async function eraseEverything(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  await destroyDatabase();
  wipeAttachments();
  await wipeSecrets();
  getState().reset();
  await reloadAppAsync('Data erased');
}
