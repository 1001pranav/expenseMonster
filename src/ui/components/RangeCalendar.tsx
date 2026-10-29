import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { monthGrid, pickDate, type DatePick } from '@/domain/datePick';
import { addMonths, formatDay, formatMonth, monthKey, type YMD } from '@/domain/dates';
import { fonts, space, useTheme } from '../theme';
import { IconButton, Row, Txt } from './core';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * One calendar for a day or a date range (domain/datePick.ts): tap a day, then the same day again
 * for just that day or another day for a range. Days after `max` can't be picked.
 */
export function RangeCalendar({ value, onChange, max }: { value: DatePick | null; onChange: (v: DatePick) => void; max: YMD }) {
  const { colors } = useTheme();
  const [month, setMonth] = useState(monthKey(value?.end ?? value?.start ?? max));
  const from = value?.start ?? null;
  const to = value ? (value.end ?? value.start) : null;
  const waiting = Boolean(value && !value.end);

  return (
    <View style={{ gap: space(1) }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <IconButton name="chevron-back" label="Previous month" onPress={() => setMonth((m) => monthKey(addMonths(`${m}-01`, -1)))} />
        <Txt variant="bodyStrong">{formatMonth(month)}</Txt>
        <IconButton name="chevron-forward" label="Next month" disabled={month >= monthKey(max)} onPress={() => setMonth((m) => monthKey(addMonths(`${m}-01`, 1)))} />
      </Row>
      <Row>
        {WEEKDAYS.map((d, i) => (
          <Txt key={i} variant="caption" tone="muted" style={{ flex: 1, textAlign: 'center' }}>
            {d}
          </Txt>
        ))}
      </Row>
      {monthGrid(month).map((week, w) => (
        <Row key={w}>
          {week.map((day, i) => {
            if (!day) return <View key={i} style={{ flex: 1, height: 40 }} />;
            const end = day === from || day === to;
            const inside = Boolean(from && to && day > from && day < to);
            // A range is drawn as one band from the first day to the last, rounded at both ends.
            const band = Boolean(from && to && from !== to && day >= from && day <= to);
            const future = day > max;
            return (
              <View
                key={day}
                style={{
                  flex: 1,
                  height: 40,
                  justifyContent: 'center',
                  backgroundColor: band ? colors.primarySoft : 'transparent',
                  borderTopLeftRadius: day === from ? 20 : 0,
                  borderBottomLeftRadius: day === from ? 20 : 0,
                  borderTopRightRadius: day === to ? 20 : 0,
                  borderBottomRightRadius: day === to ? 20 : 0,
                }}
              >
                <Pressable
                  onPress={() => onChange(pickDate(value, day))}
                  disabled={future}
                  accessibilityRole="button"
                  accessibilityState={{ selected: end || inside, disabled: future }}
                  accessibilityLabel={formatDay(day, { year: true })}
                  style={{ alignSelf: 'center', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: end ? colors.primary : 'transparent' }}
                >
                  <Txt variant="small" style={{ fontFamily: end ? fonts.bold : undefined, color: end ? colors.primaryText : future ? colors.textFaint : inside ? colors.primaryOnSoft : colors.text }}>
                    {Number(day.slice(8))}
                  </Txt>
                </Pressable>
              </View>
            );
          })}
        </Row>
      ))}
      <Txt variant="small" tone="muted">
        {!value
          ? 'Tap a date. Tap a second date for a range.'
          : waiting
            ? `${formatDay(value.start)} picked. Tap it again for just that day, or another date for a range.`
            : from === to
              ? `${formatDay(from!, { year: true })}. Tap any date to start again.`
              : `${formatDay(from!)} to ${formatDay(to!, { year: true })}. Tap any date to start again.`}
      </Txt>
    </View>
  );
}
