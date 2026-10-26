import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { radius, space, useTheme } from '../theme';
import { Txt, type IconName } from './core';

/**
 * A choice shown as a box: one tap picks it. Used where a picker would cost a tap to open and a
 * tap to close (categories, how it was paid).
 */
export function Tile({ icon, label, sub, selected, onPress, tint, width }: { icon: IconName; label: string; sub?: string; selected?: boolean; onPress: () => void; /** Icon colour when not selected (a category's own colour). */ tint?: string; width?: number }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={sub ? `${label}, ${sub}` : label}
      style={({ pressed }) => ({
        width,
        minHeight: 84,
        paddingVertical: space(1.25),
        paddingHorizontal: 6,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: selected ? colors.primary : colors.glass,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.glassBorder,
        opacity: pressed ? 0.8 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? 'rgba(255,255,255,0.18)' : colors.surfaceAlt }}>
        <Ionicons name={icon} size={19} color={selected ? colors.primaryText : (tint ?? colors.textMuted)} />
      </View>
      <Txt variant="caption" numberOfLines={2} style={{ textAlign: 'center', color: selected ? colors.primaryText : colors.text }}>
        {label}
      </Txt>
      {sub ? (
        <Txt variant="caption" numberOfLines={1} style={{ marginTop: -4, color: selected ? colors.primaryText : colors.textMuted, opacity: 0.9 }}>
          {sub}
        </Txt>
      ) : null}
    </Pressable>
  );
}

/** Tiles in rows of `columns`, sized to the screen width. */
export function TileGrid({ columns = 4, children }: { columns?: number; children: (width: number) => ReactNode }) {
  const [w, setW] = useState(0);
  const gap = space(1);
  const tile = w ? Math.floor((w - gap * (columns - 1)) / columns) : 0;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {tile ? children(tile) : null}
    </View>
  );
}

/** Tiles in one row that scrolls sideways (few, wide choices such as cards). */
export function TileRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(1), paddingRight: space(2) }} style={{ marginRight: -space(2) }}>
      {children}
    </ScrollView>
  );
}
