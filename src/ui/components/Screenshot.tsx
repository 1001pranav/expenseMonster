import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { useState, type ReactNode } from 'react';
import { Image, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space, useTheme } from '../theme';
import { Txt } from './core';

/** A captured screenshot as a small tile; tapping it opens it full screen. */
export function ScreenshotThumb({ uri, width = 84, height = 140 }: { uri: string; width?: number; height?: number }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="imagebutton" accessibilityLabel="Open the screenshot full screen" style={{ width, height, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.elevated }}>
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        <View style={{ position: 'absolute', right: 4, bottom: 4, width: 24, height: 24, borderRadius: 8, backgroundColor: colors.chrome, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="expand-outline" size={14} color={colors.text} />
        </View>
      </Pressable>
      <ScreenshotViewer uri={uri} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** The screenshot over a dark backdrop, fitted to the screen, with Share and Close. */
export function ScreenshotViewer({ uri, visible, onClose, footer }: { uri: string; visible: boolean; onClose: () => void; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const button = (icon: 'close' | 'share-outline', label: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={22} color="#FFFFFF" />
    </Pressable>
  );
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#05100C', paddingTop: insets.top + space(1), paddingBottom: insets.bottom + space(2) }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space(2) }}>
          {button('close', 'Close', onClose)}
          {button('share-outline', 'Share the screenshot', () => Sharing.shareAsync(uri).catch(() => {}))}
        </View>
        <Image source={{ uri }} style={{ flex: 1, marginVertical: space(2) }} resizeMode="contain" accessibilityLabel="Captured screenshot" />
        {footer ?? (
          <Txt variant="small" style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>
            Kept on this phone only
          </Txt>
        )}
      </View>
    </Modal>
  );
}
