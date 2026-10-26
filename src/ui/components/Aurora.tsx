import { Ionicons } from '@expo/vector-icons';
import { useId, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useTheme, type GradientName } from '../theme';
import type { IconName } from './core';

/**
 * The hero surface (lock screen, onboarding, hero cards): one flat forest fill. The glowing
 * "Aurora" was retired in the redesign; the name stays so callers don't change. Fills its parent.
 */
export function Aurora(_: { variant?: 'default' | 'calm' }) {
  const { colors } = useTheme();
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.heroBase }]} />;
}

/** A diagonal two-colour fill for any rounded shape. Fills its parent. */
export function GradientFill({ from, to }: { from: string; to: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * Icon tile. `brand` is the one filled tile (forest, white icon: the + button, the app mark);
 * every other name renders a neutral sage tile with a muted icon, so colour is left for state.
 */
export function GradientTile({
  icon,
  gradient = 'brand',
  colors: pair,
  size = 52,
  radius,
  iconSize,
  style,
  children,
}: {
  icon?: IconName;
  gradient?: GradientName;
  colors?: readonly [string, string];
  size?: number;
  radius?: number;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const filled = gradient === 'brand' || Boolean(pair);
  const bg = pair ? pair[1] : filled ? colors.primary : colors.surfaceAlt;
  const fg = filled ? colors.primaryText : colors.textMuted;
  const r = radius ?? size * 0.3;
  return (
    <View style={[{ width: size, height: size, borderRadius: r, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, style]}>
      {icon ? <Ionicons name={icon} size={iconSize ?? size * 0.46} color={fg} /> : null}
      {children}
    </View>
  );
}

/** The ExpenseMonster mascot: a friendly coin with horns. Mirrors scripts/brand/mark.js. */
export function BrandMark({ size = 72, color = '#FFFFFF', ink = '#0F5C4A' }: { size?: number; color?: string; ink?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="ExpenseMonster">
      <Path d="M30 34 C24 28 22 19 25 11 C30 17 36 22 43 25 Z" fill={color} />
      <Path d="M70 34 C76 28 78 19 75 11 C70 17 64 22 57 25 Z" fill={color} />
      <Circle cx={50} cy={56} r={34} fill={color} />
      <Circle cx={50} cy={56} r={28} fill="none" stroke={ink} strokeOpacity={0.1} strokeWidth={2.5} />
      <Ellipse cx={39} cy={49} rx={4.8} ry={6.2} fill={ink} />
      <Ellipse cx={61} cy={49} rx={4.8} ry={6.2} fill={ink} />
      <Circle cx={40.5} cy={46.8} r={1.6} fill="#FFFFFF" />
      <Circle cx={62.5} cy={46.8} r={1.6} fill="#FFFFFF" />
      <Path d="M36 62 Q50 64 64 62 Q62 78 50 78 Q38 78 36 62 Z" fill={ink} />
      <Path d="M44 62.6 L47 69 L50 63 Z" fill={color} />
    </Svg>
  );
}
