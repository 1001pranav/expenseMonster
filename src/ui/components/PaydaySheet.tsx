import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { cycleFor, cycleLabel } from '@/domain/cycle';
import { saveSettings } from '@/db/repo';
import { useStore } from '@/db/store';
import { useToday } from '@/data/hooks';
import { fonts, radius, space, useTheme } from '../theme';
import { Button, Txt } from './core';
import { Sheet } from './feedback';

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

export const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/** "Budget period: calendar month" or "…starts on the 25th", for rows that open the sheet. */
export const paydayText = (payday: number) => (payday === 1 ? 'Calendar month' : `Starts on the ${ordinal(payday)}`);

/**
 * Pick the day the budget period starts: usually salary day. The preview shows the period that
 * would hold today before anything is saved, so the effect of the choice is visible first.
 */
export function PaydaySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const today = useToday();
  const saved = useStore((s) => s.settings.payday);
  const [day, setDay] = useState(saved);
  const [wasVisible, setWasVisible] = useState(visible);
  // Reopening starts from the saved day again (adjusting state on prop change, without an effect).
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setDay(saved);
  }
  const preview = cycleFor(today, day);

  return (
    <Sheet visible={visible} onClose={onClose} title="When does your month start?">
      <Txt tone="muted">
        Pick the day your salary usually arrives. Budgets, safe-to-spend and the home-screen widget then run from that day to the day before the next one. Activity and Insights stay on calendar months.
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityRole="radiogroup">
        {DAYS.map((n) => {
          const on = n === day;
          return (
            <Pressable
              key={n}
              onPress={() => setDay(n)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={n === 1 ? '1st, calendar month' : ordinal(n)}
              style={({ pressed }) => ({
                width: '12.9%',
                height: 44,
                borderRadius: radius.sm,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: on ? colors.primary : pressed ? colors.border : colors.surfaceAlt,
              })}
            >
              <Txt style={{ fontWeight: on ? fonts.bold : fonts.regular, color: on ? colors.primaryText : colors.text, fontVariant: ['tabular-nums'] }}>{n}</Txt>
            </Pressable>
          );
        })}
      </View>
      <Txt variant="small" tone="muted">
        Salary on the 29th, 30th or 31st? Pick 28: that day exists in every month.
      </Txt>
      <View style={{ gap: 2, paddingVertical: space(0.5) }}>
        <Txt variant="caption" tone="faint" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Your current period
        </Txt>
        <Txt variant="bodyStrong">{day === 1 ? `${cycleLabel(preview)} (calendar month)` : cycleLabel(preview)}</Txt>
      </View>
      <Button
        title="Save"
        onPress={async () => {
          await saveSettings({ payday: day });
          onClose();
        }}
      />
      <View style={{ height: space(1) }} />
    </Sheet>
  );
}
