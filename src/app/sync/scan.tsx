import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { decodePair, type PairPayload } from '@/domain/sync/bundle';
import { fingerprint } from '@/domain/sync/crypto';
import { useStore } from '@/db/store';
import { joinHousehold } from '@/services/sync';
import { Button, Card, Txt } from '@/ui/components/core';
import { Sheet, toast } from '@/ui/components/feedback';
import { Screen } from '@/ui/components/Screen';
import { radius, space } from '@/ui/theme';

export default function ScanPair() {
  const [permission, requestPermission] = useCameraPermissions();
  const identity = useStore((s) => s.identity);
  const [found, setFound] = useState<{ payload: PairPayload; key: Uint8Array } | null>(null);
  const handled = useRef(false);

  const onScan = (data: string) => {
    if (handled.current) return;
    try {
      const res = decodePair(data);
      if (res.payload.deviceId === identity.deviceId) return;
      handled.current = true;
      setFound(res);
    } catch (e) {
      handled.current = true;
      toast((e as Error).message, { tone: 'error' });
      setTimeout(() => (handled.current = false), 2500);
    }
  };

  const join = async () => {
    if (!found) return;
    await joinHousehold(found.payload, found.key);
    toast(`Joined ${found.payload.householdName}. Now tap Send so ${found.payload.deviceName} gets your shared entries.`, { tone: 'success' });
    router.back();
  };

  if (!permission?.granted) {
    return (
      <Screen title="Scan pairing code" back>
        <Card style={{ gap: space(1.5) }}>
          <Txt>The camera is used only to read the pairing QR code. Nothing is recorded.</Txt>
          <Button title="Allow camera" icon="camera" onPress={requestPermission} />
        </Card>
      </Screen>
    );
  }

  const switching = found && found.payload.householdId !== identity.householdId;
  return (
    <Screen title="Scan pairing code" subtitle="On the other phone: Household → Sync → Show my QR" back scroll={false}>
      <View style={{ flex: 1, margin: space(2), borderRadius: radius.lg, overflow: 'hidden' }}>
        <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={(r) => onScan(r.data)} />
      </View>
      <Sheet
        visible={Boolean(found)}
        onClose={() => {
          setFound(null);
          handled.current = false;
        }}
        title={`Join "${found?.payload.householdName}"?`}
      >
        <Txt tone="muted">
          Paired with {found?.payload.deviceName}. Check that both phones show {found ? fingerprint(found.key) : ''}.
        </Txt>
        {switching ? (
          <Txt tone="warn">This phone will move to that household. Your entries stay on this phone; send them afterwards to share.</Txt>
        ) : null}
        <Button title="Join household" icon="checkmark" onPress={join} />
      </Sheet>
    </Screen>
  );
}
