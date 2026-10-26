import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Tabs, router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';
import { usePending } from '@/data/hooks';
import { Txt, type IconName } from '@/ui/components/core';
import { fonts, useTheme } from '@/ui/theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<string, { label: string; icon: IconName; active: IconName }> = {
  index: { label: 'Home', icon: 'home-outline', active: 'home' },
  activity: { label: 'Spending', icon: 'list-outline', active: 'list' },
  dues: { label: 'Dues', icon: 'calendar-outline', active: 'calendar' },
  insights: { label: 'Insights', icon: 'bar-chart-outline', active: 'bar-chart' },
};

/** Flat bar on the page edge: four tabs and, in the middle, + which opens a new expense straight away. */
function TabBar({ state, navigation, insets }: TabBarProps) {
  const { colors } = useTheme();
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
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 52 }}
      >
        <View>
          <Ionicons name={focused ? meta.active : meta.icon} size={22} color={focused ? colors.primary : colors.textMuted} />
          {routeName === 'index' && reviewCount > 0 ? (
            <View style={{ position: 'absolute', top: -4, right: -10, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.warnText, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
              <Txt variant="caption" style={{ color: '#fff', fontSize: 10, lineHeight: 12 }}>
                {reviewCount > 99 ? '99+' : reviewCount}
              </Txt>
            </View>
          ) : null}
        </View>
        <Txt variant="caption" style={{ color: focused ? colors.primary : colors.textMuted, fontFamily: focused ? fonts.bold : fonts.semibold }}>
          {meta.label}
        </Txt>
      </Pressable>
    );
  };

  const routes = state.routes.map((r, i) => ({ name: r.name, i }));
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: Math.max(insets.bottom, 8),
        paddingTop: 6,
        paddingHorizontal: 8,
        backgroundColor: colors.tabBar,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      {routes.slice(0, 2).map((r) => tab(r.name, r.i))}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            router.push({ pathname: '/txn/new', params: { type: 'expense' } });
          }}
          accessibilityRole="button"
          accessibilityLabel="Add an expense"
          style={({ pressed }) => ({ width: 52, height: 52, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.94 : 1 }] })}
        >
          <Ionicons name="add" size={30} color={colors.primaryText} />
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
      <Tabs.Screen name="insights" />
    </Tabs>
  );
}
