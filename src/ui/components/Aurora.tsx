import { Ionicons } from '@expo/vector-icons';
import { useId, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme, type GradientName } from '../theme';
import type { IconName } from './core';

/**
 * The hero surface (lock screen, onboarding, hero cards): forest with an emerald glow at the top
 * and cobalt at the bottom, so white text sits on a deep, even middle. Fills its parent.
 */
export function Aurora({ variant = 'default' }: { variant?: 'default' | 'calm' }) {
  const { colors } = useTheme();
  const id = useId().replace(/:/g, '');
  const strength = variant === 'calm' ? 0.35 : 0.6;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.heroBase }]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id={`${id}a`} cx="15%" cy="0%" r="75%">
            <Stop offset="0" stopColor={colors.heroGlowA} stopOpacity={strength} />
            <Stop offset="1" stopColor={colors.heroGlowA} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`${id}b`} cx="100%" cy="100%" r="80%">
            <Stop offset="0" stopColor={colors.heroGlowB} stopOpacity={strength} />
            <Stop offset="1" stopColor={colors.heroGlowB} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id}a)`} />
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id}b)`} />
      </Svg>
    </View>
  );
}

/**
 * The page behind every screen: the page colour with a green glow top-left and a blue one on the
 * right, which is what makes the translucent cards read as glass. Drawn once per screen, static.
 */
export function Backdrop() {
  const { colors } = useTheme();
  const id = useId().replace(/:/g, '');
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id={`${id}a`} cx="0%" cy="0%" r="70%">
            <Stop offset="0" stopColor={colors.glowA} stopOpacity={colors.glowOpacity} />
            <Stop offset="1" stopColor={colors.glowA} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`${id}b`} cx="100%" cy="45%" r="65%">
            <Stop offset="0" stopColor={colors.glowB} stopOpacity={colors.glowOpacity * 0.85} />
            <Stop offset="1" stopColor={colors.glowB} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id}a)`} />
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id}b)`} />
      </Svg>
    </View>
  );
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

/** The ExpenseMonster mark: a horned monster peeking over the household ledger. Mirrors scripts/brand/mark.js. */
export function BrandMark({ size = 72, color = '#E8F1EC', ink = '#0F5C4A' }: { size?: number; color?: string; ink?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 4 100 100" accessibilityLabel="ExpenseMonster">
      <Path d="M38 35 C31 31 28 22 30 14 C34 20 40 24 46 28 Z" fill={color} />
      <Path d="M62 35 C69 31 72 22 70 14 C66 20 60 24 54 28 Z" fill={color} />
      <Circle cx={50} cy={46} r={19} fill={color} />
      <Ellipse cx={43} cy={43.5} rx={3.4} ry={4.4} fill={ink} />
      <Ellipse cx={57} cy={43.5} rx={3.4} ry={4.4} fill={ink} />
      <Rect x={22} y={52} width={56} height={34} rx={6} fill="#FFFFFF" />
      <Path d="M31 66 H69 M31 75 H58" stroke={ink} strokeOpacity={0.35} strokeWidth={3} strokeLinecap="round" />
      <Rect x={31} y={47} width={11} height={12} rx={5.5} fill="#C7DCD2" />
      <Rect x={58} y={47} width={11} height={12} rx={5.5} fill="#C7DCD2" />
    </Svg>
  );
}
