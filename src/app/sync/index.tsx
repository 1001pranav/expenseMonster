import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { formatDay, isoToYMD } from '@/domain/dates';
import { encodePair } from '@/domain/sync/bundle';
import { fingerprint } from '@/domain/sync/crypto';
import type { Peer } from '@/domain/types';
import { listPeers, saveIdentity } from '@/db/repo';
import { useStore } from '@/db/store';
import { getHouseholdKey } from '@/services/secure';
import { importChanges, sendChanges } from '@/services/sync';
import { Avatar } from '@/ui/components/Avatar';
import { Button, Card, Divider, ListRow, Row, Section, Txt } from '@/ui/components/core';
import { Sheet, toast } from '@/ui/components/feedback';
import { TextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

export default function Sync() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ file?: string }>();
  const identity = useStore((s) => s.identity);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [qr, setQr] = useState<{ value: string; fp: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState(identity.deviceName);
  const [householdName, setHouseholdName] = useState(identity.householdName);

  const refresh = useCallback(() => listPeers().then(setPeers), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const receive = useCallback(
    async (uri: string) => {
      setBusy('receive');
      try {
        const r = await importChanges(uri);
        toast(`From ${r.from}: ${r.inserted} new, ${r.updated} updated${r.conflicts ? `, ${r.conflicts} conflicts (kept newer)` : ''}`, { tone: 'success' });
        refresh();
      } catch (e) {
        toast((e as Error).message, { tone: 'error' });
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  // A .emx file opened from another app arrives as a route param: import it once.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (params.file) receive(params.file);
  }, [params.file, receive]);

  const showQr = async () => {
    const key = await getHouseholdKey();
    if (!key) return;
    setQr({ value: encodePair({ householdId: identity.householdId, householdName: identity.householdName, deviceId: identity.deviceId, deviceName: identity.deviceName }, key), fp: fingerprint(key) });
  };

  const send = async (peer: Peer | null) => {
    setBusy(peer?.deviceId ?? 'all');
    try {
      const r = await sendChanges(peer);
      toast(r.rows ? `${r.rows} changes packed — pick WhatsApp, Nearby Share or Bluetooth` : 'Nothing new to send', { tone: 'success' });
      refresh();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: '*/*' });
    if (!res.canceled && res.assets[0]) receive(res.assets[0].uri);
  };

  const saveNames = async () => {
    await saveIdentity({ deviceName: deviceName.trim() || 'My phone', householdName: householdName.trim() || 'Our home' });
    toast('Saved');
  };

  return (
    <Screen title="Sync with family" subtitle="Phone to phone · no server · end-to-end encrypted" back>
      <Card tone="alt" style={{ gap: 6 }}>
        <Txt variant="bodyStrong">How it works</Txt>
        <Txt variant="small" tone="muted">
          1. Pair once in person: one phone shows a QR code, the other scans it.{'\n'}2. Tap "Send" to share an encrypted update file through WhatsApp, Nearby Share or Bluetooth.{'\n'}3. Open the file on the other phone. Only entries not marked private are shared.
        </Txt>
      </Card>

      <Row gap={1}>
        <Button title="Show my QR" icon="qr-code" onPress={showQr} style={{ flex: 1 }} />
        <Button title="Scan to join" icon="scan" variant="secondary" onPress={() => router.push('/sync/scan')} style={{ flex: 1 }} />
      </Row>

      <Section title="Paired phones">
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {peers.length ? (
            peers.map((p, i) => (
              <View key={p.deviceId}>
                {i ? <Divider inset={space(9)} /> : null}
                <ListRow
                  leading={<Avatar name={p.name} color={colors.primary} />}
                  title={p.name}
                  subtitle={`Sent ${p.lastSentAt ? formatDay(isoToYMD(p.lastSentAt)) : 'never'} · received ${p.lastReceivedAt ? formatDay(isoToYMD(p.lastReceivedAt)) : 'never'}`}
                  right={<Button title="Send" size="sm" icon="paper-plane" loading={busy === p.deviceId} onPress={() => send(p)} />}
                />
              </View>
            ))
          ) : (
            <View style={{ padding: space(2) }}>
              <Txt tone="muted">No phones paired yet.</Txt>
            </View>
          )}
        </Card>
      </Section>

      <Row gap={1}>
        <Button title="Send everything" icon="share-outline" variant="secondary" loading={busy === 'all'} onPress={() => send(null)} style={{ flex: 1 }} />
        <Button title="Receive file" icon="download-outline" variant="secondary" loading={busy === 'receive'} onPress={pick} style={{ flex: 1 }} />
      </Row>

      <Section title="Names">
        <Card style={{ gap: space(1.5) }}>
          <TextField label="This phone" value={deviceName} onChangeText={setDeviceName} />
          <TextField label="Household" value={householdName} onChangeText={setHouseholdName} />
          <Button title="Save names" size="sm" variant="secondary" onPress={saveNames} />
        </Card>
      </Section>

      <Sheet visible={Boolean(qr)} onClose={() => setQr(null)} title="Scan from the other phone">
        <View style={{ alignItems: 'center', gap: space(1.5), paddingVertical: space(1) }}>
          <View style={{ padding: space(2), backgroundColor: '#fff', borderRadius: 16 }}>{qr ? <QRCode value={qr.value} size={240} ecl="M" /> : null}</View>
          <Txt variant="small" tone="muted" style={{ textAlign: 'center' }}>
            Both phones should show the code {qr?.fp}. This QR holds your household key: show it only to family, in person.
          </Txt>
        </View>
      </Sheet>
    </Screen>
  );
}
