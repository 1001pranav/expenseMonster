import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { formatTime, isoToYMD, relativeDay, toYMD } from '@/domain/dates';
import { getCaptureText, type CaptureText } from '@/db/repo';
import { fonts, space, useTheme } from '../theme';
import { Row, Txt } from './core';
import { Sheet } from './feedback';

/**
 * The bank SMS a capture was read from, kept on this phone only while the capture waits in Check
 * captures. Null while loading, and for captures that have none (screenshots, older captures).
 */
export function useCaptureSms(txnId: string | undefined): CaptureText | null {
  // Tagged with its capture, so a stale message never shows for the next one while it loads.
  const [got, setGot] = useState<{ txnId: string; sms: CaptureText | null } | null>(null);
  useEffect(() => {
    if (!txnId) return;
    let live = true;
    getCaptureText(txnId)
      .then((sms) => live && setGot({ txnId, sms }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [txnId]);
  return txnId && got?.txnId === txnId ? got.sms : null;
}

function whenOf(sms: CaptureText) {
  return sms.receivedAt ? `${relativeDay(isoToYMD(sms.receivedAt), toYMD(new Date()))}, ${formatTime(sms.receivedAt)}` : 'Pasted';
}

/**
 * Sender, time and message as a tappable bubble. Collapsed to `lines`; tapping expands it in place,
 * or calls `onPress` instead (e.g. to open the full message in a sheet).
 */
export function SmsBubble({ sms, lines = 2, inset, onSurface, onPress }: { sms: CaptureText; lines?: number; inset?: boolean; /** Sits on a surfaceAlt card: use the lighter fill so it still reads as a bubble. */ onSurface?: boolean; onPress?: () => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      onPress={onPress ?? (() => setOpen((o) => !o))}
      accessibilityRole="button"
      accessibilityLabel={`SMS from ${sms.sender ?? 'unknown sender'}: ${sms.body}`}
      accessibilityHint={onPress ? 'Opens the whole message' : open ? 'Shows less' : 'Shows the whole message'}
      style={({ pressed }) => ({
        marginTop: inset ? space(1) : 0,
        marginLeft: inset ? space(6.5) : 0,
        padding: space(1.25),
        borderRadius: 12,
        borderTopLeftRadius: 4,
        backgroundColor: onSurface ? colors.surface : colors.surfaceAlt,
        gap: 4,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Row gap={0.75}>
        <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.textMuted} />
        <Txt variant="small" style={{ fontWeight: fonts.bold, flexShrink: 1 }} numberOfLines={1}>
          {sms.sender ?? 'Sender unknown'}
        </Txt>
        <Txt variant="caption" tone="muted" style={{ flexShrink: 0 }}>
          · {whenOf(sms)}
        </Txt>
      </Row>
      <Txt variant="small" tone="muted" numberOfLines={open ? undefined : lines}>
        {sms.body}
      </Txt>
    </Pressable>
  );
}

/** A capture's SMS in Check captures; renders nothing when the capture has none. */
export function SmsSource({ txnId, inset }: { txnId: string; inset?: boolean }) {
  const sms = useCaptureSms(txnId);
  return sms ? <SmsBubble sms={sms} inset={inset} /> : null;
}

/** The whole message in a bottom sheet, selectable, so it can be read without leaving the form. */
export function SmsSheet({ sms, visible, onClose }: { sms: CaptureText; visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title="Bank SMS">
      <View style={{ gap: space(1) }}>
        <Row gap={1}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="bodyStrong" numberOfLines={1}>
              {sms.sender ?? 'Sender unknown'}
            </Txt>
            <Txt variant="small" tone="muted">
              {whenOf(sms)}
            </Txt>
          </View>
        </Row>
        <View style={{ padding: space(1.75), borderRadius: 16, borderTopLeftRadius: 4, backgroundColor: colors.surfaceAlt }}>
          <Txt selectable style={{ lineHeight: 22 }}>
            {sms.body}
          </Txt>
        </View>
        <Txt variant="caption" tone="muted" style={{ textAlign: 'center' }}>
          Kept on this phone only, until the capture is approved or rejected
        </Txt>
      </View>
    </Sheet>
  );
}
