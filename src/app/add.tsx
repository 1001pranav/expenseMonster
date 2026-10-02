import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import Animated, { Easing, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '@/db/store';
import { GradientTile } from '@/ui/components/Aurora';
import { Txt, type IconName } from '@/ui/components/core';
import { radius, space, useTheme, type GradientName } from '@/ui/theme';

interface Tile {
  label: string;
  icon: IconName;
  gradient: GradientName;
  href: Parameters<typeof router.push>[0];
}

/** The centre "+" sheet: every create flow is two touches from anywhere. */
export default function AddSheet() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const sms = useStore((s) => s.settings.smsEnabled);

  const capture: Tile[] = [
    { label: 'Expense', icon: 'arrow-up', gradient: 'rose', href: { pathname: '/txn/new', params: { type: 'expense' } } },
    { label: 'Income', icon: 'arrow-down', gradient: 'mint', href: { pathname: '/txn/new', params: { type: 'income' } } },
    { label: 'Scan screenshot', icon: 'scan', gradient: 'violet', href: '/scan' },
    { label: sms ? 'Check SMS' : 'Paste SMS', icon: 'chatbubble-ellipses', gradient: 'ocean', href: sms ? '/review?scan=1' : '/paste-sms' },
    { label: 'Transfer', icon: 'swap-horizontal', gradient: 'ink', href: { pathname: '/txn/new', params: { type: 'transfer' } } },
    { label: 'Settle up', icon: 'people', gradient: 'brand', href: '/settle' },
  ];
  const setup: Tile[] = [
    { label: 'Bill', icon: 'flash', gradient: 'marigold', href: '/biller/new' },
    { label: 'Loan / EMI', icon: 'trending-down', gradient: 'violet', href: '/loan/new' },
    { label: 'Credit card', icon: 'card', gradient: 'rose', href: '/card/new' },
    { label: 'Insurance', icon: 'shield-checkmark', gradient: 'mint', href: '/policy/new' },
    { label: 'Salary / income', icon: 'briefcase', gradient: 'sunset', href: '/income/new' },
    { label: 'Member', icon: 'person-add', gradient: 'ocean', href: '/member/new' },
  ];

  const go = (href: Tile['href']) => {
    router.back();
    setTimeout(() => router.push(href), 10);
  };

  const grid = (tiles: Tile[]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space(1.5) }}>
      {tiles.map((t) => (
        <Pressable key={t.label} onPress={() => go(t.href)} accessibilityRole="button" style={({ pressed }) => ({ width: '33.33%', alignItems: 'center', gap: 8, opacity: pressed ? 0.6 : 1 })}>
          <GradientTile icon={t.icon} gradient={t.gradient} size={58} iconSize={26} />
          <Txt variant="small" style={{ textAlign: 'center', paddingHorizontal: 2 }} numberOfLines={2}>
            {t.label}
          </Txt>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay }} onPress={() => router.back()} accessibilityLabel="Close" />
      {/* Timing, not a spring: Reanimated 4's spring defaults (mass 4, stiffness 900) made damping(18) wobble. */}
      <Animated.View entering={SlideInDown.duration(220).easing(Easing.out(Easing.cubic))} style={{ backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space(2.5), paddingBottom: insets.bottom + space(3), gap: space(2.5) }}>
        <View style={{ alignItems: 'center' }}>
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border }} />
        </View>
        <Txt variant="h2">What would you like to add?</Txt>
        <Txt variant="caption" tone="muted">
          RECORD
        </Txt>
        {grid(capture)}
        <Txt variant="caption" tone="muted">
          SET UP & REMIND
        </Txt>
        {grid(setup)}
      </Animated.View>
    </View>
  );
}
