import { Ionicons } from '@expo/vector-icons';
import { useRef, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useTheme } from '../theme';
import { Txt, type IconName } from './core';

export interface SwipeAction {
  label: string;
  icon: IconName;
  color: string;
  onPress: () => void;
}

/** Swipe to reveal actions; tapping an action runs it (no accidental full-swipe deletes). */
export function SwipeRow({ children, left, right }: { children: ReactNode; left?: SwipeAction[]; right?: SwipeAction[] }) {
  const { colors } = useTheme();
  const ref = useRef<SwipeableMethods>(null);
  const render = (actions: SwipeAction[] | undefined) =>
    actions?.length
      ? () => (
          <View style={{ flexDirection: 'row' }}>
            {actions.map((a) => (
              <Pressable
                key={a.label}
                onPress={() => {
                  ref.current?.close();
                  a.onPress();
                }}
                accessibilityRole="button"
                accessibilityLabel={a.label}
                style={{ width: 84, backgroundColor: a.color, alignItems: 'center', justifyContent: 'center', gap: 4 }}
              >
                <Ionicons name={a.icon} size={22} color="#fff" />
                <Txt variant="caption" style={{ color: '#fff' }}>
                  {a.label}
                </Txt>
              </Pressable>
            ))}
          </View>
        )
      : undefined;
  return (
    <Swipeable ref={ref} friction={1.6} overshootLeft={false} overshootRight={false} renderLeftActions={render(left)} renderRightActions={render(right)} containerStyle={{ backgroundColor: colors.surface }}>
      <View style={{ backgroundColor: colors.surface }}>{children}</View>
    </Swipeable>
  );
}
