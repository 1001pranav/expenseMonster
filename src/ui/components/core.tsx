import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { formatINR, spokenINR, type FormatOptions, type Paise } from '@/domain/money';
import { useStore } from '@/db/store';
import { radius, shadow, space, type, useTheme, type Colors, type TypeVariant } from '../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];
type Tone = 'default' | 'muted' | 'faint' | 'primary' | 'income' | 'expense' | 'warn' | 'info' | 'inverse';

const toneColor = (c: Colors, tone: Tone) =>
  ({
    default: c.text,
    muted: c.textMuted,
    faint: c.textFaint,
    primary: c.primary,
    income: c.income,
    expense: c.expense,
    warn: c.warn,
    info: c.info,
    inverse: c.primaryText,
  })[tone];

export function Txt({ variant = 'body', tone = 'default', style, ...rest }: TextProps & { variant?: TypeVariant; tone?: Tone }) {
  const { colors } = useTheme();
  return <Text {...rest} maxFontSizeMultiplier={1.6} style={[type[variant], { color: toneColor(colors, tone) }, style]} />;
}

export function Money({
  value,
  variant = 'bodyStrong',
  tone,
  colorBySign,
  style,
  ...opts
}: { value: Paise; variant?: TypeVariant; tone?: Tone; colorBySign?: boolean; style?: StyleProp<TextStyle> } & FormatOptions) {
  const hidden = useStore((s) => s.settings.hideAmounts);
  const t: Tone = tone ?? (colorBySign ? (value < 0 ? 'expense' : value > 0 ? 'income' : 'default') : 'default');
  return (
    <Txt
      variant={variant}
      tone={t}
      accessibilityLabel={hidden ? 'Amount hidden' : spokenINR(value)}
      style={[{ fontVariant: ['tabular-nums'] }, style]}
      numberOfLines={1}
    >
      {hidden ? '₹ ••••' : formatINR(value, opts)}
    </Txt>
  );
}

export function Card({ children, style, onPress, padded = true, tone }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; padded?: boolean; tone?: 'primary' | 'alt' }) {
  const { colors, dark } = useTheme();
  const bg = tone === 'primary' ? colors.primary : tone === 'alt' ? colors.surfaceAlt : colors.surface;
  const body = [{ backgroundColor: bg, borderRadius: radius.lg, padding: padded ? space(2) : 0 }, tone ? null : shadow(dark), style];
  if (!onPress) return <View style={body}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [body, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]} accessibilityRole="button">
      {children}
    </Pressable>
  );
}

export function IconCircle({ name, color, size = 40, soft = true }: { name: IconName; color: string; size?: number; soft?: boolean }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: soft ? `${color}22` : color, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={name} size={size * 0.5} color={soft ? color : '#fff'} />
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  size = 'md',
  style,
  haptic = true,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
}) {
  const { colors } = useTheme();
  const bg = { primary: colors.primary, secondary: colors.surfaceAlt, ghost: 'transparent', danger: colors.expense, success: colors.income }[variant];
  const fg = { primary: colors.primaryText, secondary: colors.text, ghost: colors.primary, danger: '#fff', success: '#fff' }[variant];
  const h = { sm: 36, md: 48, lg: 56 }[size];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={() => {
        if (haptic) Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        { height: h, borderRadius: radius.pill, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: space(size === 'sm' ? 1.75 : 2.5), gap: 8 },
        (disabled || loading) && { opacity: 0.45 },
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 19} color={fg} /> : null}
      <Text style={[type[size === 'sm' ? 'small' : 'bodyStrong'], { color: fg }]} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

export function IconButton({ name, onPress, label, color, size = 22, filled }: { name: IconName; onPress: () => void; label: string; color?: string; size?: number; filled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [
        { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: filled ? colors.surfaceAlt : 'transparent' },
        pressed && { backgroundColor: colors.surfaceAlt },
      ]}
    >
      <Ionicons name={name} size={size} color={color ?? colors.text} />
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon, color, compact }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName; color?: string; compact?: boolean }) {
  const { colors } = useTheme();
  const accent = color ?? colors.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: compact ? 10 : 14,
          height: compact ? 32 : 38,
          borderRadius: radius.pill,
          backgroundColor: selected ? accent : colors.surface,
          borderWidth: 1,
          borderColor: selected ? accent : colors.border,
        },
        pressed && { opacity: 0.75 },
      ]}
    >
      {icon ? <Ionicons name={icon} size={15} color={selected ? '#fff' : accent} /> : null}
      <Text style={[type.small, { color: selected ? '#fff' : colors.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Pill({ label, tone = 'muted' }: { label: string; tone?: 'muted' | 'income' | 'expense' | 'warn' | 'primary' | 'info' }) {
  const { colors } = useTheme();
  const map = {
    muted: [colors.surfaceAlt, colors.textMuted],
    income: [colors.incomeSoft, colors.income],
    expense: [colors.expenseSoft, colors.expense],
    warn: [colors.warnSoft, colors.warn],
    primary: [colors.primarySoft, colors.primary],
    info: [colors.infoSoft, colors.info],
  }[tone];
  return (
    <View style={{ backgroundColor: map[0], paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' }}>
      <Text style={[type.caption, { color: map[1] }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function ListRow({
  icon,
  iconColor,
  title,
  subtitle,
  right,
  onPress,
  chevron,
  leading,
  onLongPress,
}: {
  icon?: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string | ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  leading?: ReactNode;
  onLongPress?: PressableProps['onLongPress'];
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
    >
      {leading ?? (icon ? <IconCircle name={icon} color={iconColor ?? colors.primary} /> : null)}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong" numberOfLines={1}>
          {title}
        </Txt>
        {subtitle ? (
          typeof subtitle === 'string' ? (
            <Txt variant="small" tone="muted" numberOfLines={1}>
              {subtitle}
            </Txt>
          ) : (
            subtitle
          )
        ) : null}
      </View>
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={colors.textFaint} /> : null}
    </Pressable>
  );
}

export function Section({ title, action, onAction, children, style }: { title?: string; action?: string; onAction?: () => void; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: space(1.25) }, style]}>
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
          <Txt variant="h3">{title}</Txt>
          {action ? (
            <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
              <Txt variant="small" tone="primary">
                {action}
              </Txt>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function EmptyState({ icon, title, body, action, onAction }: { icon: IconName; title: string; body?: string; action?: string; onAction?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: space(5), paddingHorizontal: space(3), gap: space(1.25) }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={32} color={colors.primary} />
      </View>
      <Txt variant="h3" style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      {body ? (
        <Txt tone="muted" style={{ textAlign: 'center' }}>
          {body}
        </Txt>
      ) : null}
      {action && onAction ? <Button title={action} onPress={onAction} size="sm" style={{ marginTop: space(1) }} /> : null}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: inset }} />;
}

export function ProgressBar({ value, color, height = 8 }: { value: number; color?: string; height?: number }) {
  const { colors } = useTheme();
  const v = Math.max(0, Math.min(1, value));
  return (
    <View style={{ height, borderRadius: height, backgroundColor: colors.chartTrack, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}>
      <View style={{ width: `${v * 100}%`, height, borderRadius: height, backgroundColor: color ?? colors.primary }} />
    </View>
  );
}

export function Row({ children, gap = 1, style, wrap }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space(gap), flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function Stat({ label, value, tone }: { label: string; value: Paise; tone?: Tone }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Txt variant="caption" tone="muted">
        {label.toUpperCase()}
      </Txt>
      <Money value={value} variant="h3" tone={tone} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), paddingVertical: space(1.25), paddingHorizontal: space(2), minHeight: 60 },
});
