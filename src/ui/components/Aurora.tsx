import { Ionicons } from '@expo/vector-icons';
import { useId, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { gradients, useTheme, type GradientName } from '../theme';
import type { IconName } from './core';

/**
 * The app's signature surface: deep ink lit by three soft glows (violet, rose, marigold)
 * with faint concentric rings, like light catching a coin. Used for hero cards and the lock screen.
 * Fills its parent; the parent should clip (overflow: 'hidden') and set the radius.
 */
export function Aurora({ variant = 'default' }: { variant?: 'default' | 'calm' }) {
  const { colors } = useTheme();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const id = useId().replace(/:/g, '');
  const { w, h } = size;
  const glow = (key: string, color: string, opacity: number) => (
    <RadialGradient id={`${id}${key}`} cx="50%" cy="50%" rx="50%" ry="50%">
      <Stop offset="0" stopColor={color} stopOpacity={opacity} />
      <Stop offset="1" stopColor={color} stopOpacity={0} />
    </RadialGradient>
  );
  const strength = variant === 'calm' ? 0.55 : 0.85;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {w > 0 ? (
        <Svg width={w} height={h}>
          <Defs>
            {glow('a', colors.heroGlowA, strength)}
            {glow('b', colors.heroGlowB, strength * 0.8)}
            {glow('c', colors.heroGlowC, strength * 0.6)}
          </Defs>
          <Rect x={0} y={0} width={w} height={h} fill={colors.heroBase} />
          <Ellipse cx={w * 0.05} cy={h * 0.1} rx={w * 0.7} ry={h * 0.9} fill={`url(#${id}a)`} />
          <Ellipse cx={w * 1.0} cy={h * 0.05} rx={w * 0.55} ry={h * 0.75} fill={`url(#${id}b)`} />
          <Ellipse cx={w * 0.75} cy={h * 1.05} rx={w * 0.6} ry={h * 0.6} fill={`url(#${id}c)`} />
          {[0.18, 0.3, 0.42, 0.54].map((r) => (
            <Circle key={r} cx={w * 0.95} cy={h * 0.95} r={Math.max(w, h) * r} stroke="#FFFFFF" strokeOpacity={0.06} strokeWidth={1} fill="none" />
          ))}
        </Svg>
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.heroBase }]} />
      )}
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

/** Gradient tile with a white icon: quick actions, add-sheet entries, empty states. */
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
  const [from, to] = pair ?? gradients[gradient];
  const r = radius ?? size * 0.34;
  // Shadow on the outer view: iOS clips shadows on views with overflow hidden.
  return (
    <View style={[{ width: size, height: size, borderRadius: r, backgroundColor: to, shadowColor: to, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 }, style]}>
      <View style={{ flex: 1, borderRadius: r, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        <GradientFill from={from} to={to} />
        {/* Soft top highlight for a little depth. */}
        <View pointerEvents="none" style={{ position: 'absolute', top: -size * 0.45, left: -size * 0.2, width: size * 1.1, height: size * 0.9, borderRadius: size, backgroundColor: 'rgba(255,255,255,0.16)' }} />
        {icon ? <Ionicons name={icon} size={iconSize ?? size * 0.46} color="#FFFFFF" /> : null}
        {children}
      </View>
    </View>
  );
}

/** The ExpenseMonster mascot: a friendly coin with horns. Mirrors scripts/brand/mark.js. */
export function BrandMark({ size = 72, color = '#FFFFFF', ink = '#2A1F7A' }: { size?: number; color?: string; ink?: string }) {
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
