import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { radius, space, useTheme } from '../theme';
import { Txt } from './core';

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
  if (opts?.tone === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
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
  const iconColor = tone === 'success' ? colors.income : tone === 'error' ? colors.expense : colors.primary;
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

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} accessibilityLabel="Close" />
      <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingBottom: insets.bottom + space(2), maxHeight: '88%' }}>
        <View style={{ alignItems: 'center', paddingTop: 10 }}>
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border }} />
        </View>
        {title ? (
          <Txt variant="h2" style={{ paddingHorizontal: space(2.5), paddingTop: space(1.5), paddingBottom: space(1) }}>
            {title}
          </Txt>
        ) : null}
        <ScrollView contentContainerStyle={{ paddingHorizontal: space(2.5), paddingBottom: space(1), gap: space(2) }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
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
