import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Keyboard, View } from 'react-native';
import { formatDay, relativeDay, todayYMD } from '@/domain/dates';
import { formatINR } from '@/domain/money';
import { approveCapture, deleteTransaction } from '@/data/actions';
import { captureText, readSms } from '@/services/capture';
import { Button, Card, IconCircle, Row, Txt } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { TextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

/**
 * Long-press a bank SMS → Copy → paste here. It is read as you paste, and a payment saves from this
 * screen ("Change first" opens it in the entry form). Works without any SMS permission.
 */
export default function PasteSms() {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => readSms(text), [text]);
  const payment = parsed?.kind === 'transaction' ? parsed : null;
  const unrecognised = text.trim().length > 20 && !parsed;

  /** Capture it; returns the new entry's id, or null when it was already recorded or wasn't a payment. */
  const capture = async (): Promise<string | null> => {
    const r = await captureText(text);
    if (r.addedIds[0]) return r.addedIds[0];
    if (r.bills) {
      toast('Bill detected — check it in Check captures', { tone: 'success' });
      router.replace('/review');
    } else toast(r.duplicates ? 'Already recorded' : 'Nothing to record in this message');
    return null;
  };

  const save = async () => {
    setBusy(true);
    try {
      const id = await capture();
      if (!id) return;
      const row = await approveCapture(id);
      toast(`Saved ${formatINR(row.amount)}${row.payee ? ` to ${row.payee}` : ''}`, { tone: 'success', actionLabel: 'Undo', onAction: () => deleteTransaction(id) });
      router.back();
    } finally {
      setBusy(false);
    }
  };

  const changeFirst = async () => {
    setBusy(true);
    try {
      const id = await capture();
      if (id) router.replace(`/txn/${id}`);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Close the keyboard first: nothing is left to type, and keeping it open while the read card and
   * the Save footer appear squeezes the screen into the space above the keyboard.
   */
  const paste = async () => {
    Keyboard.dismiss();
    const clip = (await Clipboard.getStringAsync()).trim();
    if (clip) setText(clip);
    else toast('Clipboard is empty — copy the SMS first');
  };

  const today = todayYMD();
  const rows: [string, string, string][] = payment
    ? [
        ['Amount', formatINR(payment.amount), colors.expense],
        [payment.direction === 'credit' ? 'From' : 'Paid to', payment.payee ?? payment.vpa ?? 'Not in the message', colors.warn],
        [payment.direction === 'credit' ? 'Into' : 'From', [payment.bank, payment.cardLast4 ? `card ••${payment.cardLast4}` : payment.accountLast4 ? `••${payment.accountLast4}` : null].filter(Boolean).join(' ') || 'Not in the message', colors.primary],
        ['Date', payment.date ? `${relativeDay(payment.date, today)}, ${formatDay(payment.date)}` : 'Today', colors.info],
      ]
    : [];

  return (
    <Screen
      title="Paste a bank SMS"
      subtitle="No SMS permission needed"
      back
      footer={
        payment ? (
          <Row gap={1}>
            <Button title="Change first" variant="secondary" size="lg" style={{ flex: 1 }} disabled={busy} onPress={changeFirst} />
            <Button title={`Save ${formatINR(payment.amount, { decimals: 'auto' })}`} icon="checkmark" size="lg" style={{ flex: 1.4 }} loading={busy} onPress={save} />
          </Row>
        ) : parsed ? (
          <Button title="Read message" icon="sparkles" size="lg" loading={busy} onPress={changeFirst} />
        ) : undefined
      }
    >
      <Button title="Paste from clipboard" icon="clipboard-outline" variant="secondary" onPress={paste} />
      <TextField label="Message" value={text} onChangeText={setText} multiline placeholder="Sent Rs.250.00 From HDFC Bank A/C *1234 To SWIGGY On 12/09/26 Ref 425612345678" />

      {payment ? (
        <Card style={{ gap: space(1.5) }}>
          <Row gap={1.25}>
            <IconCircle name="checkmark" state="good" size={32} />
            <Txt variant="h3" style={{ flex: 1 }}>
              Read as {payment.direction === 'credit' ? 'money in' : 'a payment'}
              {payment.bank ? ` · ${payment.bank}` : ''}
            </Txt>
          </Row>
          <View style={{ gap: space(1) }}>
            {rows.map(([k, v, dot]) => (
              <Row key={k} gap={1}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
                <Txt variant="small" tone="muted" style={{ width: 80 }}>
                  {k}
                </Txt>
                <Txt variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                  {v}
                </Txt>
              </Row>
            ))}
          </View>
        </Card>
      ) : !text.trim() ? (
        <Txt tone="muted">In your Messages app, long-press the bank SMS, tap Copy, then paste it here. It's read on this phone and the message isn't kept.</Txt>
      ) : null}

      {unrecognised || (payment && !payment.payee && !payment.vpa) ? (
        <Card style={{ gap: space(1) }}>
          <Txt variant="bodyStrong">{unrecognised ? "This format isn't recognised yet" : 'Read wrong?'}</Txt>
          <Txt variant="small" tone="muted">
            Teach it once by tapping the amount, payee and date. After that, every message like this is read automatically.
          </Txt>
          <Button title="Teach this format" icon="school-outline" variant="secondary" onPress={() => router.push({ pathname: '/settings/sms-format', params: { text } })} />
          {unrecognised ? <Button title="Add it manually instead" variant="ghost" onPress={() => router.replace('/txn/new')} /> : null}
        </Card>
      ) : null}
    </Screen>
  );
}
