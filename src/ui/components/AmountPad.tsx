import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, View } from 'react-native';
import { radius, space, useTheme } from '../theme';
import { Txt } from './core';

// Explicit rows, so a row always holds exactly three keys. (A wrapping grid of 32.3%-wide keys plus a
// 6px gap overflows — 3 × 32.3% + 12px > 100% — and drops to two columns.)
const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'del'],
];

/**
 * The entry form's amount keypad: flat keys on the sheet, with a small toolbar: "Paste bank SMS"
 * when the clipboard has text, and Done to put it away so Category, Date and the rest are in view.
 */
export function AmountPad({ onKey, onDone, onPaste }: { onKey: (k: string) => void; onDone: () => void; /** Shown when the clipboard has text. */ onPaste?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ borderRadius: radius.lg, backgroundColor: colors.surface, padding: space(1), gap: space(1) }}>
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
      <View style={{ gap: 6 }}>
        {ROWS.map((row) => (
          <View key={row.join('')} style={{ flexDirection: 'row', gap: 6 }}>
            {row.map((k) => (
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
              flex: 1,
              height: 52,
              borderRadius: radius.sm,
              backgroundColor: pressed ? colors.border : colors.surfaceAlt,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            })}
          >
            {k === 'del' ? <Ionicons name="backspace-outline" size={24} color={colors.text} /> : <Txt style={{ fontWeight: '500', fontSize: 22, fontVariant: ['tabular-nums'] }}>{k}</Txt>}
          </Pressable>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}
