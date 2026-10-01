import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, Switch, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { addDays, formatDay, relativeDay, toDate, toYMD, todayYMD, type YMD } from '@/domain/dates';
import { formatINR, parseAmount, type Paise } from '@/domain/money';
import { radius, space, type, useTheme } from '../theme';
import { Chip, Txt, type IconName } from './core';

export function Label({ children, hint }: { children: string; hint?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, paddingHorizontal: 2 }}>
      <Txt variant="small" tone="muted">
        {children}
      </Txt>
      {hint ? (
        <Txt variant="small" tone="faint">
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

export function Field({ label, hint, children, error }: { label?: string; hint?: string; children: ReactNode; error?: string | null }) {
  return (
    <View>
      {label ? <Label hint={hint}>{label}</Label> : null}
      {children}
      {error ? (
        <Txt variant="small" tone="expense" style={{ marginTop: 4, paddingHorizontal: 2 }}>
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  secure,
  autoFocus,
  hint,
  error,
  maxLength,
  autoCapitalize,
  icon,
}: {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  secure?: boolean;
  autoFocus?: boolean;
  hint?: string;
  error?: string | null;
  maxLength?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  icon?: IconName;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Field label={label} hint={hint} error={error}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          gap: 8,
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor: error ? colors.expense : focused ? colors.primary : colors.border,
          paddingHorizontal: space(1.75),
          minHeight: multiline ? 88 : 52,
        }}
      >
        {icon ? <Ionicons name={icon} size={18} color={colors.textFaint} style={{ marginTop: multiline ? 14 : 0 }} /> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          keyboardType={keyboardType}
          multiline={multiline}
          secureTextEntry={secure}
          autoFocus={autoFocus}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label ?? placeholder}
          style={[type.body, { flex: 1, color: colors.text, paddingVertical: multiline ? 12 : 0, textAlignVertical: multiline ? 'top' : 'center' }]}
        />
      </View>
    </Field>
  );
}

/** Rupee input that stores paise. Accepts "1,250.50". */
export function AmountField({ label, value, onChange, placeholder = '0', hint, error, autoFocus }: { label?: string; value: Paise | null; onChange: (v: Paise | null) => void; placeholder?: string; hint?: string; error?: string | null; autoFocus?: boolean }) {
  const [text, setText] = useState(value ? String(value / 100) : '');
  return (
    <TextField
      label={label}
      hint={hint}
      error={error}
      value={text}
      autoFocus={autoFocus}
      icon="cash-outline"
      keyboardType="decimal-pad"
      placeholder={placeholder}
      onChangeText={(t) => {
        const clean = t.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
        setText(clean);
        onChange(parseAmount(clean));
      }}
    />
  );
}

export function SwitchRow({ label, description, value, onChange, icon }: { label: string; description?: string; value: boolean; onChange: (v: boolean) => void; icon?: IconName }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} style={{ flexDirection: 'row', alignItems: 'center', gap: space(1.5), paddingVertical: space(1.25) }}>
      {icon ? <Ionicons name={icon} size={20} color={colors.textMuted} /> : null}
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong">{label}</Txt>
        {description ? (
          <Txt variant="small" tone="muted">
            {description}
          </Txt>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.border }} thumbColor="#fff" />
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, padding: 4 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{ flex: 1, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? colors.surface : 'transparent' }}
          >
            <Txt variant="small" tone={active ? 'default' : 'muted'} numberOfLines={1}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ChipSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  wrap,
  allowNone,
}: {
  label?: string;
  options: { value: T; label: string; icon?: IconName; color?: string }[];
  value: T | null;
  onChange: (v: T | null) => void;
  wrap?: boolean;
  allowNone?: boolean;
}) {
  const chips = options.map((o) => (
    <Chip key={o.value} label={o.label} icon={o.icon} color={o.color} selected={value === o.value} onPress={() => onChange(allowNone && value === o.value ? null : o.value)} />
  ));
  return (
    <Field label={label}>
      {wrap ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{chips}</View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: space(2) }}>
          {chips}
        </ScrollView>
      )}
    </Field>
  );
}

/** Quick chips for today / yesterday plus a native date picker. */
export function DateField({ label, value, onChange, quick = true, allowFuture = true }: { label?: string; value: YMD; onChange: (v: YMD) => void; quick?: boolean; allowFuture?: boolean }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const today = todayYMD();
  const onPick = (e: DateTimePickerEvent, d?: Date) => {
    setOpen(Platform.OS === 'ios');
    if (e.type === 'set' && d) onChange(toYMD(d));
  };
  return (
    <Field label={label}>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {quick ? (
          <>
            <Chip label="Today" selected={value === today} onPress={() => onChange(today)} />
            <Chip label="Yesterday" selected={value === addDays(today, -1)} onPress={() => onChange(addDays(today, -1))} />
          </>
        ) : null}
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Pick date, currently ${formatDay(value, { year: true })}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 38, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
        >
          <Ionicons name="calendar-outline" size={16} color={colors.primary} />
          <Txt variant="small">{quick && (value === today || value === addDays(today, -1)) ? 'Other date' : `${formatDay(value, { year: true })} · ${relativeDay(value, today)}`}</Txt>
        </Pressable>
      </View>
      {open ? <DateTimePicker value={toDate(value)} mode="date" onChange={onPick} maximumDate={allowFuture ? undefined : new Date()} /> : null}
    </Field>
  );
}

export function DayOfMonthField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  return (
    <Field label={label} hint={value >= 29 ? 'Short months use their last day' : undefined}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: space(2) }}>
        {days.map((d) => (
          <Chip key={d} compact label={String(d)} selected={value === d} onPress={() => onChange(d)} />
        ))}
      </ScrollView>
    </Field>
  );
}

export const amountHint = (v: Paise | null) => (v ? formatINR(v) : undefined);
