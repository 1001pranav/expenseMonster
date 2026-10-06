import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space, useTheme } from '../theme';
import { IconButton, Txt } from './core';

export const TAB_BAR_SPACE = 96;

/**
 * Back within the app. A screen opened from the share sheet can be the only one in the stack, and a
 * plain back there closes the app and drops the user into GPay / PhonePe / BHIM.
 */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export function Header({ title, subtitle, back, right, large }: { title: string; subtitle?: string; back?: boolean; right?: ReactNode; large?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(1), paddingVertical: space(0.75), gap: 4, minHeight: 56 }}>
      {back ? <IconButton name="chevron-back" label="Back" onPress={goBack} /> : <View style={{ width: space(1) }} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant={large ? 'h1' : 'h2'} numberOfLines={1} accessibilityRole="header">
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="small" tone="muted" numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right ? <View style={{ flexDirection: 'row', alignItems: 'center' }}>{right}</View> : null}
    </View>
  );
}

export function Screen({
  title,
  subtitle,
  back,
  right,
  children,
  scroll = true,
  refreshing,
  onRefresh,
  tabBar,
  footer,
  contentStyle,
  large,
  header,
}: {
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Leave room for the floating tab bar. */
  tabBar?: boolean;
  /** Sticky bottom area (e.g. Save button). */
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  large?: boolean;
  header?: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = (tabBar ? TAB_BAR_SPACE : footer ? space(2) : space(4)) + (tabBar ? 0 : insets.bottom);
  const content = [{ padding: space(2), paddingBottom: bottom, gap: space(2.5) }, contentStyle];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {title ? <Header title={title} subtitle={subtitle} back={back} right={right} large={large} /> : null}
      {header}
      {scroll ? (
        <ScrollView
          contentContainerStyle={content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      )}
      {footer ? (
        <View style={{ paddingHorizontal: space(2), paddingTop: space(1.5), paddingBottom: insets.bottom + space(1.5), backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border }}>
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
