import type { ReactNode } from 'react';
import { View } from 'react-native';
import { radius, space } from '../theme';
import { Row, Txt } from './core';

export function CardFace({ name, last4, color, children }: { name: string; last4: string | null; color: string | null; children?: ReactNode }) {
  return (
    <View style={{ backgroundColor: color ?? '#1E1B4B', borderRadius: radius.lg, padding: space(2), gap: space(1.5), overflow: 'hidden' }}>
      <View style={{ position: 'absolute', right: -40, top: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.08)' }} />
      <View style={{ position: 'absolute', right: 30, bottom: -60, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.05)' }} />
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="h3" style={{ color: '#fff' }}>
          {name}
        </Txt>
        <Txt variant="small" style={{ color: 'rgba(255,255,255,0.75)' }}>
          {last4 ? `•••• ${last4}` : ''}
        </Txt>
      </Row>
      {children}
    </View>
  );
}

