import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, View } from 'react-native';
import { radius, space, useTheme } from '../theme';
import { Txt } from './core';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

/**
 * The entry form's amount keypad: a frosted glass panel of glass keys, with a small toolbar —
 * "Paste bank SMS" when the clipboard has text, and Done to put it away so Category, Date and the
 * rest are in view. (A real backdrop blur needs the whole screen wrapped on Android and is slow on
 * older phones; the glass is drawn with the app's own translucent surfaces instead.)
 */
export function AmountPad({ onKey, onDone, onPaste }: { onKey: (k: string) => void; onDone: () => void; /** Shown when the clipboard has text. */ onPaste?: () => void }) {
  const { colors, dark } = useTheme();
  const keyBg = dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.62)';
  const shine = dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.55)';
  return (
    <View style={{ borderRadius: 24, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.glass, padding: space(1), gap: space(1), overflow: 'hidden' }}>
      {/* Top-lit, like light on glass. */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '45%', backgroundColor: shine, opacity: 0.6 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1) }}>
        {onPaste ? (
          <Pressable
            onPress={onPaste}
            accessibilityRole="button"
            accessibilityLabel="Paste a bank SMS from the clipboard and fill the form"
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.primarySoft, opacity: pressed ? 0.75 : 1 })}
          >
            <Ionicons name="clipboard-outline" size={16} color={colors.primaryOnSoft} />
            <Txt variant="small" style={{ color: colors.primaryOnSoft }}>
              Paste bank SMS
            </Txt>
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel="Hide the keypad"
          hitSlop={4}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, opacity: pressed ? 0.75 : 1 })}
        >
          <Txt variant="small">Done</Txt>
          <Ionicons name="chevron-down" size={16} color={colors.text} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, columnGap: 6 }}>
        {KEYS.map((k) => (
          <Pressable
            key={k}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onKey(k);
            }}
            onLongPress={k === 'del' ? () => onKey('clear') : undefined}
            accessibilityRole="button"
            accessibilityLabel={k === 'del' ? 'Delete' : k}
            style={({ pressed }) => ({
              width: '32.3%',
              height: 52,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.glassBorder,
              backgroundColor: pressed ? colors.primarySoft : keyBg,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            })}
          >
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '48%', backgroundColor: shine, opacity: 0.7 }} />
            {k === 'del' ? <Ionicons name="backspace-outline" size={24} color={colors.text} /> : <Txt variant="h1" style={{ fontSize: 24 }}>{k}</Txt>}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
