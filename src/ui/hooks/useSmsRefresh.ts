import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { useStore } from '@/db/store';
import { logFailure } from '@/services/diagnostics';
import { rescanBankSms, smsCaptureAvailable, smsSummary } from '@/services/smsInbox';
import { toast } from '../components/feedback';

/**
 * Pull to refresh = "check my bank SMS now". Offered only once SMS reading is set up: the app is
 * offline, so anywhere else a refresh spinner would pretend something happened (spec §4).
 */
export function useSmsRefresh(): { onRefresh?: () => void; refreshing: boolean } {
  const importedTo = useStore((s) => s.settings.smsImportedTo);
  const [refreshing, setRefreshing] = useState(false);
  if (!smsCaptureAvailable || !importedTo) return { refreshing: false };

  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.selectionAsync().catch(() => {});
    try {
      const r = await rescanBankSms();
      if (r.status === 'done') toast(smsSummary(r), { tone: r.added ? 'success' : 'default', ...(r.added > r.saved ? { actionLabel: 'Check', onAction: () => router.push('/review') } : {}) });
      else if (r.status === 'not-allowed') toast("Android isn't letting the app read SMS any more", { tone: 'error', actionLabel: 'Fix', onAction: () => router.push('/settings/sms') });
    } catch (e) {
      logFailure('sms: pull to refresh failed', e);
      toast("Couldn't read bank SMS. Try again in a moment.", { tone: 'error' });
    } finally {
      setRefreshing(false);
    }
  };
  return { onRefresh, refreshing };
}
