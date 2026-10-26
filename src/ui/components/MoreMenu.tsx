import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme, space } from '../theme';
import { IconButton, IconCircle, Txt, type IconName } from './core';
import { Sheet } from './feedback';

export interface MenuAction {
  label: string;
  icon: IconName;
  onPress: () => void;
  /** Shown in red; keep it last. */
  destructive?: boolean;
}

/**
 * The ⋯ button for detail screens: less common and destructive actions (delete, close, pause)
 * live here, so Delete isn't a stray icon next to Edit.
 */
export function MoreMenu({ title, actions }: { title: string; actions: MenuAction[] }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton name="ellipsis-vertical" label="More actions" onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={() => setOpen(false)} title={title}>
        <View style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          {actions.map((a, i) => (
            <View key={a.label}>
              {i ? <View style={{ height: 1, backgroundColor: colors.surfaceAlt, marginLeft: space(8.5) }} /> : null}
              <Pressable
                onPress={() => {
                  setOpen(false);
                  a.onPress();
                }}
                accessibilityRole="button"
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space(1.5), minHeight: 56, paddingHorizontal: space(2), backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}
              >
                <IconCircle name={a.icon} state={a.destructive ? 'expense' : undefined} />
                <Txt variant="bodyStrong" tone={a.destructive ? 'expense' : 'default'}>
                  {a.label}
                </Txt>
              </Pressable>
            </View>
          ))}
        </View>
      </Sheet>
    </>
  );
}
