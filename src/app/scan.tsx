import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';
import { formatDay } from '@/domain/dates';
import { formatINR, parseAmount } from '@/domain/money';
import { autoSaveCapture, deleteTransaction } from '@/data/actions';
import { readScreenshot, saveScreenshot, type ImageCapture, type ScreenshotRead } from '@/services/capture';
import { logError, logInfo } from '@/services/diagnostics';
import { stageImage } from '@/services/files';
import { Button, Card, EmptyState, Row, Txt } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { TextField } from '@/ui/components/forms';
import { Screen, goBack } from '@/ui/components/Screen';
import { radius, space, useTheme } from '@/ui/theme';

type Phase = 'idle' | 'reading' | 'confirm' | 'saving' | 'failed' | 'unreadable';
type StepState = 'waiting' | 'active' | 'found' | 'missing';
interface Step {
  label: string;
  state: StepState;
  value?: string;
}

const STEPS = ['Reading the screenshot', 'Identifying amount', 'Identifying who it was paid to', 'Checking date and UPI reference'];
/** The findings appear one after another over at most this long once OCR is done; no forced wait. */
const REVEAL_MS = 450;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));


export default function Scan() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ uri?: string }>();
  const [uri, setUri] = useState<string | null>(params.uri ?? null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [steps, setSteps] = useState<Step[]>([]);
  const [read, setRead] = useState<ScreenshotRead | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showRead, setShowRead] = useState(false);
  const run = useRef(0);

  const setStep = (i: number, patch: Partial<Step>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  /** Open what was saved: the approval screen, the earlier duplicate, or Review for a bill. */
  const finish = useCallback(async (res: ImageCapture) => {
    logInfo(`scan: ${res.status}${res.transactionId ? ', added to Review' : res.duplicateOf ? ', already recorded' : ''} (${res.text.length} characters read)`);
    if (res.status === 'failed') return setPhase('failed');
    if (res.status === 'unreadable') return setPhase('unreadable');
    if (res.status === 'bill') {
      toast(res.summary.bills ? 'Bill detected — review it' : res.summary.unknownBillers.length ? `Add "${res.summary.unknownBillers[0]}" as a biller first` : 'Bill already recorded');
      router.replace('/review');
      return;
    }
    if (res.transactionId) {
      // Read clearly? Save it now and offer Undo, instead of another screen to approve.
      const auto = await autoSaveCapture(res.transactionId).catch((e) => {
        logError(`scan: auto-save failed: ${(e as Error).message}`);
        return null;
      });
      // Clear: saved already, so open the saved entry (with its screenshot) and offer Undo there.
      // Otherwise open it to check: the screenshot, the amount and any question on one screen.
      if (auto) {
        logInfo('scan: saved automatically');
        const id = res.transactionId;
        toast(`Saved ${formatINR(auto.amount)}${auto.payee ? ` to ${auto.payee}` : ''}`, {
          tone: 'success',
          actionLabel: 'Undo',
          onAction: () => deleteTransaction(id).then(goBack),
        });
      }
      router.replace({ pathname: '/txn/[id]', params: { id: res.transactionId, ocr: res.text } });
    }
    else if (res.duplicateOf) {
      // Show the earlier entry rather than silently going back (which could leave the app).
      toast('Already recorded — this is the earlier entry');
      router.replace(`/txn/${res.duplicateOf}`);
    } else {
      toast('Nothing to record in this screenshot');
      goBack();
    }
  }, []);

  const process = useCallback(
    async (incoming: string) => {
      const id = ++run.current;
      const alive = () => id === run.current;
      const started = Date.now();
      setPhase('reading');
      setError(null);
      setShowRead(false);
      setRead(null);
      setSteps(STEPS.map((label, i) => ({ label, state: i === 0 ? 'active' : 'waiting' })));
      logInfo('scan: reading');
      try {
        const imageUri = await stageImage(incoming);
        if (!alive()) return;
        setUri(imageUri);
        const [r] = await Promise.all([readScreenshot(imageUri), sleep(500)]);
        if (!alive()) return;
        setRead(r);
        setStep(0, { state: 'found', value: r.kind === 'bill' ? 'Looks like a bill' : undefined });

        // Reveal the three findings in turn, briefly; skip the animation if OCR already took a while.
        const pause = Date.now() - started > 1500 ? 0 : REVEAL_MS / 3;
        const p = r.kind === 'payment' ? r.payment : null;
        const findings: [StepState, string | undefined][] = [
          p?.amount ? ['found', `${formatINR(p.amount)}${p.amountSure ? '' : ' — please confirm'}`] : ['missing', 'Not found — you can type it'],
          p?.payee ? ['found', `${p.direction === 'credit' ? 'From' : 'To'} ${p.payee}`] : ['missing', 'Not found'],
          p && (p.ref || p.date) ? ['found', [p.date ? formatDay(p.date, { year: true }) : null, p.ref ? `Ref ${p.ref}` : null].filter(Boolean).join(' · ')] : ['missing', 'Not found'],
        ];
        if (r.kind === 'payment' && p?.direction === 'credit') setStep(2, { label: 'Identifying who sent it' });
        for (let i = 0; i < findings.length; i++) {
          setStep(i + 1, { state: 'active' });
          await sleep(pause);
          if (!alive()) return;
          setStep(i + 1, { state: findings[i][0], value: findings[i][1] });
        }
        if (pause) await sleep(120);
        if (!alive()) return;

        if (r.kind === 'payment' && r.payment.status !== 'failed' && !r.payment.amount) {
          // No amount at all: ask for it here (an entry can't exist without one). An unsure amount is
          // saved for checking instead, where the screenshot sits beside it with a one-tap fix.
          const anythingFound = r.payment.payee || r.payment.ref || r.payment.date || r.payment.amount;
          if (!anythingFound) {
            logInfo('scan: nothing recognisable');
            return setPhase('unreadable');
          }
          logInfo('scan: asking for the amount (not found)');
          setAmountInput('');
          return setPhase('confirm');
        }
        setPhase('saving');
        await finish(await saveScreenshot(r));
      } catch (e) {
        logError(`scan failed: ${(e as Error).message}`);
        setError((e as Error).message);
        setPhase('idle');
      }
    },
    [finish],
  );

  const confirmAmount = async () => {
    const amount = parseAmount(amountInput);
    if (!read || !amount) return toast('Enter the amount shown on the screenshot', { tone: 'error' });
    setPhase('saving');
    try {
      logInfo('scan: amount confirmed by user');
      await finish(await saveScreenshot(read, { amount }));
    } catch (e) {
      logError(`scan save failed: ${(e as Error).message}`);
      setError((e as Error).message);
      setPhase('confirm');
    }
  };

  // A screenshot shared from GPay/PhonePe/BHIM arrives as a route param: process it once on arrival.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (params.uri) process(params.uri);
  }, [params.uri, process]);

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false });
    if (!res.canceled && res.assets[0]) process(res.assets[0].uri);
  };

  const payment = read?.kind === 'payment' ? read.payment : null;
  const busy = phase === 'reading' || phase === 'saving';

  return (
    <Screen title="Scan screenshot" subtitle="Read on this phone — nothing is uploaded" back>
      {uri && phase !== 'confirm' ? (
        <Image
          source={{ uri }}
          style={{ width: '100%', height: 300, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt }}
          resizeMode="contain"
          accessibilityLabel="Selected screenshot"
        />
      ) : null}

      {phase === 'reading' || phase === 'saving' ? (
        <Card style={{ gap: space(1.25) }}>
          {steps.map((s) => (
            <Row key={s.label} gap={1} style={{ alignItems: 'flex-start' }}>
              <View style={{ width: 22, alignItems: 'center', paddingTop: 1 }}>
                {s.state === 'active' ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons
                    name={s.state === 'found' ? 'checkmark-circle' : s.state === 'missing' ? 'alert-circle' : 'ellipse-outline'}
                    size={20}
                    color={s.state === 'found' ? colors.good : s.state === 'missing' ? colors.warn : colors.textFaint}
                  />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong" tone={s.state === 'waiting' ? 'faint' : 'default'}>
                  {s.label}
                  {s.state === 'active' ? '…' : ''}
                </Txt>
                {s.value ? (
                  <Txt variant="small" tone={s.state === 'missing' ? 'warn' : 'muted'}>
                    {s.value}
                  </Txt>
                ) : null}
              </View>
            </Row>
          ))}
          {phase === 'saving' ? (
            <Txt variant="small" tone="muted">
              Opening for approval…
            </Txt>
          ) : null}
        </Card>
      ) : null}

      {phase === 'confirm' && payment ? (
        <Card style={{ gap: space(1), borderWidth: 1.5, borderColor: colors.warn }}>
          <Txt variant="bodyStrong">Couldn't read the amount</Txt>
          <Txt tone="muted">Type the amount shown on the screenshot. Everything else that was found is kept.</Txt>
          {payment.payee || payment.date ? (
            <Txt variant="small" tone="muted">
              {[payment.payee ? `${payment.direction === 'credit' ? 'From' : 'To'} ${payment.payee}` : null, payment.date ? formatDay(payment.date, { year: true }) : null].filter(Boolean).join(' · ')}
            </Txt>
          ) : null}
          <TextField label="Amount (₹)" value={amountInput} onChangeText={setAmountInput} keyboardType="decimal-pad" autoFocus placeholder="0.00" />
          <Row gap={1}>
            <Button title="Continue" icon="checkmark" onPress={confirmAmount} style={{ flex: 1 }} disabled={!parseAmount(amountInput)} />
            <Button title="Cancel" variant="secondary" onPress={goBack} />
          </Row>
        </Card>
      ) : null}
      {/* While confirming, the amount box comes first so the keyboard never covers it; the screenshot to compare with is below. */}
      {uri && phase === 'confirm' ? (
        <Image source={{ uri }} style={{ width: '100%', height: 260, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt }} resizeMode="contain" accessibilityLabel="Selected screenshot" />
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
          <Txt variant="bodyStrong">This doesn't look like a payment</Txt>
          <Txt tone="muted">Use the payment's success screen (not the chat), uncropped, or add it manually.</Txt>
          <Button title="Add manually" variant="secondary" onPress={() => router.replace('/txn/new')} />
        </Card>
      ) : null}

      {(phase === 'unreadable' || phase === 'confirm') && read?.text ? (
        <>
          <Button title={showRead ? 'Hide what was read' : 'Show what was read'} variant="ghost" onPress={() => setShowRead((v) => !v)} />
          {showRead ? (
            <Txt tone="muted" selectable style={{ fontSize: 12 }}>
              {read.text}
            </Txt>
          ) : null}
        </>
      ) : null}

      {error ? (
        <Card>
          <Txt tone="expense">{error}</Txt>
        </Card>
      ) : null}

      {!uri ? (
        <EmptyState icon="scan-outline" title="Pick a payment screenshot" body="GPay, PhonePe, BHIM, Paytm, bank apps, or a photo of a bill. Payments and money received are both read, with who it was paid to or received from. Tip: share the screenshot to ExpenseMonster to skip this step." />
      ) : null}

      {phase !== 'confirm' ? (
        <Row gap={1}>
          <Button title={uri ? 'Pick another' : 'Choose from gallery'} icon="images-outline" onPress={pick} style={{ flex: 1 }} disabled={busy} />
        </Row>
      ) : null}
      <View style={{ height: space(1) }} />
    </Screen>
  );
}
