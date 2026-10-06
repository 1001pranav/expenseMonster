import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';
import { captureImage } from '@/services/capture';
import { stageImage } from '@/services/files';
import { logError, logInfo } from '@/services/diagnostics';
import { Button, Card, EmptyState, Row, Txt } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { Screen, goBack } from '@/ui/components/Screen';
import { radius, space, useTheme } from '@/ui/theme';

type Phase = 'idle' | 'reading' | 'failed' | 'unreadable';

export default function Scan() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ uri?: string }>();
  const [uri, setUri] = useState<string | null>(params.uri ?? null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [readText, setReadText] = useState('');
  const [showRead, setShowRead] = useState(false);

  const process = useCallback(async (incoming: string) => {
    setPhase('reading');
    setError(null);
    setShowRead(false);
    logInfo('scan: reading');
    try {
      const imageUri = await stageImage(incoming);
      setUri(imageUri);
      const res = await captureImage(imageUri);
      setReadText(res.text);
      logInfo(`scan: ${res.status}${res.transactionId ? ', added to Review' : res.duplicateOf ? ', already recorded' : ''} (${res.text.length} characters read)`);
      if (res.status === 'failed') return setPhase('failed');
      if (res.status === 'unreadable') return setPhase('unreadable');
      if (res.status === 'bill') {
        toast(res.summary.bills ? 'Bill detected — review it' : res.summary.unknownBillers.length ? `Add "${res.summary.unknownBillers[0]}" as a biller first` : 'Bill already recorded');
        router.replace('/review');
        return;
      }
      if (res.transactionId) {
        router.replace({ pathname: '/txn/[id]', params: { id: res.transactionId, ocr: res.text } });
      } else if (res.duplicateOf) {
        // Show the earlier entry rather than silently going back (which could leave the app).
        toast('Already recorded — this is the earlier entry');
        router.replace(`/txn/${res.duplicateOf}`);
      } else {
        toast('Nothing to record in this screenshot');
        goBack();
      }
    } catch (e) {
      logError(`scan failed: ${(e as Error).message}`);
      setError((e as Error).message);
      setPhase('idle');
    }
  }, []);

  // A screenshot shared from GPay/PhonePe arrives as a route param: process it once on arrival.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (params.uri) process(params.uri);
  }, [params.uri, process]);

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false });
    if (!res.canceled && res.assets[0]) process(res.assets[0].uri);
  };

  return (
    <Screen title="Scan screenshot" subtitle="Read on this phone — nothing is uploaded" back>
      {uri ? <Image source={{ uri }} style={{ width: '100%', height: 360, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt }} resizeMode="contain" accessibilityLabel="Selected screenshot" /> : null}

      {phase === 'reading' ? (
        <Card style={{ alignItems: 'center', gap: space(1) }}>
          <ActivityIndicator color={colors.primary} />
          <Txt variant="bodyStrong">Reading amount, payee and UPI reference…</Txt>
        </Card>
      ) : null}

      {phase === 'failed' ? (
        <Card style={{ gap: 6, borderWidth: 1.5, borderColor: colors.expense }}>
          <Txt variant="bodyStrong" tone="expense">
            This payment failed
          </Txt>
          <Txt tone="muted">Failed or declined payments aren't recorded. If money was debited, the bank's refund SMS will be captured separately.</Txt>
        </Card>
      ) : null}

      {phase === 'unreadable' ? (
        <Card style={{ gap: 6 }}>
          <Txt variant="bodyStrong">Couldn't find an amount</Txt>
          <Txt tone="muted">Use the payment's success screen (not the chat), uncropped, or add it manually.</Txt>
          <Button title="Add manually" variant="secondary" onPress={() => router.replace('/txn/new')} />
          {readText ? <Button title={showRead ? 'Hide what was read' : 'Show what was read'} variant="ghost" onPress={() => setShowRead((v) => !v)} /> : null}
          {showRead ? (
            <Txt tone="muted" selectable style={{ fontSize: 12 }}>
              {readText}
            </Txt>
          ) : null}
        </Card>
      ) : null}

      {error ? (
        <Card>
          <Txt tone="expense">{error}</Txt>
        </Card>
      ) : null}

      {!uri ? (
        <EmptyState icon="scan-outline" title="Pick a payment screenshot" body="GPay, PhonePe, BHIM, Paytm, bank apps, or a photo of a bill. Payments and money received are both read, with who it was paid to or received from. Tip: share the screenshot to ExpenseMonster to skip this step." />
      ) : null}

      <Row gap={1}>
        <Button title={uri ? 'Pick another' : 'Choose from gallery'} icon="images-outline" onPress={pick} style={{ flex: 1 }} disabled={phase === 'reading'} />
      </Row>
      <View style={{ height: space(1) }} />
    </Screen>
  );
}
