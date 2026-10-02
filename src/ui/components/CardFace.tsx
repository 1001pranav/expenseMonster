import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { radius, shade, space } from '../theme';
import { GradientFill } from './Aurora';
import { Row, Txt } from './core';

export function CardFace({ name, last4, color, children }: { name: string; last4: string | null; color: string | null; children?: ReactNode }) {
  const base = color && /^#[0-9a-f]{6}$/i.test(color) ? color : '#2A1F7A';
  return (
    <View style={{ borderRadius: radius.lg, shadowColor: base, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6, backgroundColor: base }}>
      <View style={{ borderRadius: radius.lg, padding: space(2.25), gap: space(1.5), overflow: 'hidden' }}>
        <GradientFill from={shade(base, 0.22)} to={shade(base, -0.35)} />
        <View pointerEvents="none" style={{ position: 'absolute', right: -50, top: -60, width: 190, height: 190, borderRadius: 95, borderWidth: 26, borderColor: 'rgba(255,255,255,0.07)' }} />
        <View pointerEvents="none" style={{ position: 'absolute', right: 50, bottom: -80, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.06)' }} />
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="h3" style={{ color: '#fff', flex: 1 }} numberOfLines={1}>
            {name}
          </Txt>
          <Ionicons name="wifi" size={18} color="rgba(255,255,255,0.8)" style={{ transform: [{ rotate: '90deg' }] }} />
        </Row>
        <Row gap={1.5}>
          {/* EMV chip */}
          <View style={{ width: 34, height: 26, borderRadius: 6, backgroundColor: '#E9C46A', borderWidth: 1, borderColor: '#C9A24A', justifyContent: 'center' }}>
            <View style={{ height: 1, backgroundColor: '#B8913F', marginHorizontal: 4 }} />
            <View style={{ position: 'absolute', left: 14, top: 4, bottom: 4, width: 1, backgroundColor: '#B8913F' }} />
          </View>
          <Txt variant="bodyStrong" style={{ color: 'rgba(255,255,255,0.85)', letterSpacing: 2 }}>
            {last4 ? `••••  ${last4}` : '••••'}
          </Txt>
        </Row>
        {children}
      </View>
    </View>
  );
}
