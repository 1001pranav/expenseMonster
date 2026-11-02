import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeInDown, FadeOutDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { radius, space, useTheme } from '../theme';
import { Txt } from './core';
import { logWarn } from '@/services/diagnostics';

interface ToastState {
  message: string | null;
  tone: 'default' | 'success' | 'error';
  actionLabel?: string;
  onAction?: () => void;
  id: number;
  show: (message: string, opts?: { tone?: ToastState['tone']; actionLabel?: string; onAction?: () => void }) => void;
  hide: () => void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  tone: 'default',
  id: 0,
  show: (message, opts = {}) => set((s) => ({ message, tone: opts.tone ?? 'default', actionLabel: opts.actionLabel, onAction: opts.onAction, id: s.id + 1 })),
  hide: () => set({ message: null, onAction: undefined, actionLabel: undefined }),
}));

/** Snackbar with optional Undo, used instead of "Are you sure?" dialogs. */
export const toast = (message: string, opts?: Parameters<ToastState['show']>[1]) => {
  if (opts?.tone === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  if (opts?.tone === 'error') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    // Every error the user sees also lands in Settings → Error log.
    logWarn(`shown: ${message}`);
  }
  useToast.getState().show(message, opts);
};

export function ToastHost() {
  const { message, tone, actionLabel, onAction, id, hide } = useToast();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(hide, onAction ? 5000 : 3000);
    return () => clearTimeout(t);
  }, [id, message, onAction, hide]);
  if (!message) return null;
  const icon = tone === 'success' ? 'checkmark-circle' : tone === 'error' ? 'alert-circle' : 'information-circle';
  const iconColor = tone === 'success' ? colors.good : tone === 'error' ? colors.expense : colors.primary;
  return (
    <Animated.View
      key={id}
      entering={FadeInDown.duration(180)}
      exiting={FadeOutDown.duration(150)}
      accessibilityLiveRegion="polite"
      style={{ position: 'absolute', left: space(2), right: space(2), bottom: insets.bottom + 104, zIndex: 100 }}
    >
      <View style={{ backgroundColor: colors.text, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name={icon} size={20} color={iconColor} />
        <Txt variant="small" style={{ flex: 1, color: colors.bg }}>
          {message}
        </Txt>
        {actionLabel && onAction ? (
          <Pressable
            onPress={() => {
              onAction();
              hide();
            }}
            hitSlop={10}
            accessibilityRole="button"
          >
            <Txt variant="bodyStrong" style={{ color: colors.primarySoft }}>
              {actionLabel}
            </Txt>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

/**
 * Bottom sheet: drag it down, tap ✕ or tap the backdrop to close. Lifts above the keyboard
 * (edge-to-edge Android no longer resizes the window for it).
 */
/** `footer` stays pinned under the scrolling content (e.g. the sheet's main button). */
export function Sheet({ visible, onClose, title, children, footer }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode; footer?: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const drag = useSharedValue(0);
  useEffect(() => {
    if (visible) drag.set(0);
  }, [visible, drag]);
  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      drag.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 900) scheduleOnRN(onClose);
      else drag.set(withTiming(0, { duration: 160 }));
    });
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: drag.get() }] }));
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} accessibilityLabel="Close" />
          <Animated.View style={[{ backgroundColor: colors.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingBottom: insets.bottom + space(2), maxHeight: '88%' }, sheetStyle]}>
            <GestureDetector gesture={pan}>
              <View>
                <View style={{ alignItems: 'center', paddingTop: 10 }}>
                  <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border }} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: space(2.5), paddingRight: space(1.5), paddingTop: space(1), paddingBottom: space(1) }}>
                  <Txt variant="h2" style={{ flex: 1 }}>
                    {title ?? ''}
                  </Txt>
                  <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={4} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="close" size={20} color={colors.text} />
                  </Pressable>
                </View>
              </View>
            </GestureDetector>
            <ScrollView contentContainerStyle={{ paddingHorizontal: space(2.5), paddingBottom: space(1), gap: space(2) }} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
            {footer ? <View style={{ paddingHorizontal: space(2.5), paddingTop: space(1.5), borderTopWidth: 1, borderTopColor: colors.border }}>{footer}</View> : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** Numeric keypad for the fast "amount first" entry. */
export function Keypad({ onKey, onDark }: { onKey: (k: string) => void; /** White keys on the Aurora surface. */ onDark?: boolean }) {
  const { colors } = useTheme();
  const fg = onDark ? '#FFFFFF' : colors.text;
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 }}>
      {keys.map((k) => (
        <Pressable
          key={k}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onKey(k);
          }}
          onLongPress={k === 'del' ? () => onKey('clear') : undefined}
          accessibilityRole="button"
          accessibilityLabel={k === 'del' ? 'Delete' : k}
          style={({ pressed }) => ({ width: '33.33%', height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: pressed ? (onDark ? 'rgba(255,255,255,0.14)' : colors.surfaceAlt) : 'transparent' })}
        >
          {k === 'del' ? <Ionicons name="backspace-outline" size={26} color={fg} /> : <Txt variant="h1" style={{ color: fg }}>{k}</Txt>}
        </Pressable>
      ))}
    </View>
  );
}
