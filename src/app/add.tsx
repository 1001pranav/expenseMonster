import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, SlideInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { Card, IconButton, IconCircle, Txt, type IconName } from '@/ui/components/core';
import { space, useTheme } from '@/ui/theme';

interface Entry {
  label: string;
  hint: string;
  icon: IconName;
  href: Parameters<typeof router.push>[0];
  income?: boolean;
}

const ENTRIES: Entry[] = [
  { label: 'A bill', hint: 'Electricity, rent, internet, recharge, gas', icon: 'flash-outline', href: '/biller/new' },
  { label: 'A loan', hint: 'Home, car, personal, or money you lent', icon: 'home-outline', href: '/loan/new' },
  { label: 'A credit card', hint: 'Know each bill before the bank sends it', icon: 'card-outline', href: '/card/new' },
  { label: 'Insurance', hint: 'Reminders 30, 7 and 1 day before renewal', icon: 'shield-checkmark-outline', href: '/policy/new' },
  { label: 'Regular income', hint: 'Salary, or rent you receive', icon: 'arrow-up', href: '/income/new', income: true },
];

/** "Set up a reminder": things you add once. Drag down, tap ✕ or the backdrop to close. */
export default function SetupSheet() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const drag = useSharedValue(0);
  const close = () => router.back();

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      drag.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 900) scheduleOnRN(close);
      else drag.set(withTiming(0, { duration: 160 }));
    });
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: drag.get() }] }));

  const go = (href: Entry['href']) => {
    router.back();
    setTimeout(() => router.push(href), 10);
  };

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay }} onPress={close} accessibilityLabel="Close" />
      <GestureDetector gesture={pan}>
        <Animated.View
          entering={SlideInDown.duration(220).easing(Easing.out(Easing.cubic))}
          style={[{ backgroundColor: colors.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: space(2), paddingTop: space(1.25), paddingBottom: insets.bottom + space(3), gap: space(1.5) }, sheetStyle]}
        >
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
            <View style={{ flex: 1 }}>
              <Txt variant="h2">Set up a reminder</Txt>
              <Txt variant="small" tone="muted">
                Add it once and get reminded every time
              </Txt>
            </View>
            <IconButton name="close" label="Close" filled onPress={close} />
          </View>
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {ENTRIES.map((e, i) => (
              <View key={e.label}>
                {i ? <View style={{ height: 1, backgroundColor: colors.surfaceAlt, marginLeft: space(8.5) }} /> : null}
                <Pressable onPress={() => go(e.href)} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space(1.5), paddingHorizontal: space(2), minHeight: 62, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}>
                  <IconCircle name={e.icon} state={e.income ? 'income' : undefined} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="bodyStrong">{e.label}</Txt>
                    <Txt variant="small" tone="muted">
                      {e.hint}
                    </Txt>
                  </View>
                </Pressable>
              </View>
            ))}
          </Card>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
