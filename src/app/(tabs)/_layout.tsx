import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Tabs, router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';
import { usePending } from '@/data/hooks';
import { Txt, type IconName } from '@/ui/components/core';
import { radius, shadow, useTheme } from '@/ui/theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<string, { label: string; icon: IconName; active: IconName }> = {
  index: { label: 'Home', icon: 'home-outline', active: 'home' },
  activity: { label: 'Activity', icon: 'receipt-outline', active: 'receipt' },
  dues: { label: 'Dues', icon: 'calendar-outline', active: 'calendar' },
  household: { label: 'Household', icon: 'people-outline', active: 'people' },
};

function TabBar({ state, navigation, insets }: TabBarProps) {
  const { colors, dark } = useTheme();
  const pending = usePending();
  const reviewCount = pending.transactions.length + pending.bills.length;

  const tab = (routeName: string, index: number) => {
    const meta = TABS[routeName];
    if (!meta) return null;
    const focused = state.index === index;
    return (
      <Pressable
        key={routeName}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={meta.label}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          const event = navigation.emit({ type: 'tabPress', target: state.routes[index].key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(routeName);
        }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 8 }}
      >
        <View>
          <Ionicons name={focused ? meta.active : meta.icon} size={23} color={focused ? colors.primary : colors.textFaint} />
          {routeName === 'index' && reviewCount > 0 ? (
            <View style={{ position: 'absolute', top: -2, right: -8, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.expense, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
              <Txt variant="caption" style={{ color: '#fff', fontSize: 10 }}>
                {reviewCount > 99 ? '99+' : reviewCount}
              </Txt>
            </View>
          ) : null}
        </View>
        <Txt variant="caption" tone={focused ? 'primary' : 'faint'}>
          {meta.label}
        </Txt>
      </Pressable>
    );
  };

  const routes = state.routes.map((r, i) => ({ name: r.name, i }));
  return (
    <View
      style={[
        {
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: Math.max(insets.bottom, 12),
          height: 68,
          borderRadius: radius.xl,
          backgroundColor: colors.tabBar,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 6,
        },
        shadow(dark),
        !dark && { shadowOpacity: 0.12, elevation: 8 },
      ]}
    >
      {routes.slice(0, 2).map((r) => tab(r.name, r.i))}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            router.push('/add');
          }}
          accessibilityRole="button"
          accessibilityLabel="Add transaction, scan, bill, loan or card"
          style={({ pressed }) => ({
            width: 56,
            height: 56,
            borderRadius: 20,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: pressed ? 0.94 : 1 }],
            shadowColor: colors.primary,
            shadowOpacity: 0.4,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 6,
          })}
        >
          <Ionicons name="add" size={32} color={colors.primaryText} />
        </Pressable>
      </View>
      {routes.slice(2).map((r) => tab(r.name, r.i))}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, animation: 'fade' }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="dues" />
      <Tabs.Screen name="household" />
    </Tabs>
  );
}
