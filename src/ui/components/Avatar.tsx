import { View } from 'react-native';
import { Txt } from './core';

export function Avatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Txt variant="bodyStrong" style={{ color: '#fff', fontSize: size * 0.4 }}>
        {name.slice(0, 1).toUpperCase()}
      </Txt>
    </View>
  );
}
