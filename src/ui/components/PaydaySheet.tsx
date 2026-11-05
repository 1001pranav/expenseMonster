import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { cycleFor, cycleLabel, effectivePayday, suggestPayday, type BudgetPeriod } from '@/domain/cycle';
import { saveSettings } from '@/db/repo';
import { useStore } from '@/db/store';
import { useTable, useToday } from '@/data/hooks';
import { fonts, radius, space, useTheme } from '../theme';
import { Button, Chip, Txt } from './core';
import { Sheet } from './feedback';
import { Segmented } from './forms';

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

export const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/** One line for rows that open the sheet: "Calendar month" or "Pay day to pay day, from the 25th". */
export const paydayText = (mode: BudgetPeriod, payday: number) => (mode === 'payday' ? `Pay day to pay day, from the ${ordinal(payday)}` : 'Calendar month (1st to month end)');

/**
 * How budgets are measured: calendar months, or from pay day to the day before the next one. The
 * preview shows the period holding today before anything is saved, so the effect is visible first.
 */
/** The 1–28 day picker, shared by this sheet and onboarding. */
export function DayGrid({ value, onChange }: { value: number; onChange: (day: number) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityRole="radiogroup">
      {DAYS.map((n) => {
        const on = n === value;
        return (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={ordinal(n)}
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
  );
}

export function PaydaySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const today = useToday();
  const incomes = useTable('incomes');
  const settings = useStore((s) => s.settings);
  const suggestion = suggestPayday(incomes);
  const initialDay = () => (settings.budgetPeriod === 'payday' ? settings.payday : (suggestion?.day ?? 1));
  const [mode, setMode] = useState<BudgetPeriod>(settings.budgetPeriod);
  const [day, setDay] = useState(initialDay);
  const [wasVisible, setWasVisible] = useState(visible);
  // Reopening starts from what's saved (adjusting state on prop change, without an effect).
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setMode(settings.budgetPeriod);
      setDay(initialDay());
    }
  }
  const preview = cycleFor(today, effectivePayday(mode, day));
  // Pay day on the 1st is the calendar month: saving it that way keeps the setting honest.
  const canSave = mode === 'calendar' || day > 1;

  return (
    <Sheet visible={visible} onClose={onClose} title="Budget period">
      <Txt tone="muted">How should budgets and safe-to-spend count a month? Activity and Insights always show calendar months.</Txt>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'calendar', label: 'Calendar month' },
          { value: 'payday', label: 'Pay day to pay day' },
        ]}
      />

      {mode === 'payday' ? (
        <View style={{ gap: space(1.25) }}>
          <Txt variant="bodyStrong">Which day does your salary usually arrive?</Txt>
          {suggestion && suggestion.day !== day ? (
            <Chip compact icon="sparkles-outline" label={`${suggestion.name} comes on the ${ordinal(suggestion.day)}: use it`} onPress={() => setDay(suggestion.day)} />
          ) : null}
          <DayGrid value={day} onChange={setDay} />
          <Txt variant="small" tone="muted">
            {day === 1 ? 'The 1st is the same as a calendar month. Pick the day your salary lands.' : 'Paid on the 29th, 30th or 31st? Pick 28: that day exists in every month.'}
          </Txt>
        </View>
      ) : null}

      <View style={{ gap: 2, paddingVertical: space(0.5) }}>
        <Txt variant="caption" tone="faint" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Your current period
        </Txt>
        <Txt variant="bodyStrong">{cycleLabel(preview)}</Txt>
      </View>
      <Button
        title="Save"
        disabled={!canSave}
        onPress={async () => {
          await saveSettings(mode === 'payday' ? { budgetPeriod: 'payday', payday: day } : { budgetPeriod: 'calendar' });
          onClose();
        }}
      />
      <View style={{ height: space(1) }} />
    </Sheet>
  );
}
