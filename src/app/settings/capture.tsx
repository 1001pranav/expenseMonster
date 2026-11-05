import { saveSettings } from '@/db/repo';
import { useStore } from '@/db/store';
import { ensurePermission, rescheduleAll } from '@/services/notifications';
import { List, ListRow, Section } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { SwitchRow } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';

/** How payments get in (screenshots) and how the app reminds you: split out of the lock screen settings. */
export default function CaptureSettings() {
  const settings = useStore((s) => s.settings);
  return (
    <Screen title="Screenshots and reminders" back>
      <Section title="Payment screenshots">
        <SwitchRow
          icon="flash-outline"
          label="Save clear screenshots automatically"
          description="When the amount, payee and category are all certain. You get Undo, and anything unsure still waits for a check."
          value={settings.autoSaveCaptures}
          onChange={(v) => saveSettings({ autoSaveCaptures: v })}
        />
        <SwitchRow
          icon="image-outline"
          label="Delete screenshots after approval"
          description="Off: each entry keeps its screenshot to look at later"
          value={settings.deleteScreenshots}
          onChange={(v) => saveSettings({ deleteScreenshots: v })}
        />
      </Section>

      <Section title="Reminders">
        <List>
          <ListRow
            icon="notifications-outline"
            title="Bill and EMI reminders"
            subtitle="Allow notifications and rebuild the schedule"
            chevron
            onPress={async () => {
              if (!(await ensurePermission())) return toast('Notifications are blocked in Android settings', { tone: 'error' });
              const n = await rescheduleAll();
              toast(`${n} reminders scheduled`, { tone: 'success' });
            }}
          />
        </List>
        <SwitchRow icon="moon-outline" label="Evening review nudge" description="9 PM reminder when captures are waiting" value={settings.reviewNudge} onChange={(v) => saveSettings({ reviewNudge: v })} />
      </Section>
    </Screen>
  );
}
