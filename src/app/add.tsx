import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '@/db/store';
import { Txt, type IconName } from '@/ui/components/core';
import { radius, space, useTheme } from '@/ui/theme';

interface Tile {
  label: string;
  icon: IconName;
  color: string;
  href: Parameters<typeof router.push>[0];
}

/** The centre "+" sheet: every create flow is two touches from anywhere. */
export default function AddSheet() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const sms = useStore((s) => s.settings.smsEnabled);

  const capture: Tile[] = [
    { label: 'Expense', icon: 'remove-circle', color: colors.expense, href: { pathname: '/txn/new', params: { type: 'expense' } } },
    { label: 'Income', icon: 'add-circle', color: colors.income, href: { pathname: '/txn/new', params: { type: 'income' } } },
    { label: 'Scan screenshot', icon: 'scan', color: colors.primary, href: '/scan' },
    { label: sms ? 'Check SMS' : 'Paste SMS', icon: 'chatbubble-ellipses', color: colors.info, href: sms ? '/review?scan=1' : '/paste-sms' },
    { label: 'Transfer', icon: 'swap-horizontal', color: '#0D9488', href: { pathname: '/txn/new', params: { type: 'transfer' } } },
    { label: 'Settle up', icon: 'people', color: '#7C3AED', href: '/settle' },
  ];
  const setup: Tile[] = [
    { label: 'Bill', icon: 'flash', color: colors.warn, href: '/biller/new' },
    { label: 'Loan / EMI', icon: 'trending-down', color: '#4338CA', href: '/loan/new' },
    { label: 'Credit card', icon: 'card', color: '#BE185D', href: '/card/new' },
    { label: 'Insurance', icon: 'shield-checkmark', color: '#0F766E', href: '/policy/new' },
    { label: 'Salary / income', icon: 'briefcase', color: colors.income, href: '/income/new' },
    { label: 'Member', icon: 'person-add', color: colors.primary, href: '/member/new' },
  ];

  const go = (href: Tile['href']) => {
    router.back();
    setTimeout(() => router.push(href), 10);
  };

  const grid = (tiles: Tile[]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space(1.5) }}>
      {tiles.map((t) => (
        <Pressable key={t.label} onPress={() => go(t.href)} accessibilityRole="button" style={({ pressed }) => ({ width: '33.33%', alignItems: 'center', gap: 8, opacity: pressed ? 0.6 : 1 })}>
          <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: `${t.color}1F`, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={t.icon} size={28} color={t.color} />
          </View>
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
      <Animated.View entering={SlideInDown.springify().damping(18)} style={{ backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space(2.5), paddingBottom: insets.bottom + space(3), gap: space(2.5) }}>
        <View style={{ alignItems: 'center' }}>
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border }} />
        </View>
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
