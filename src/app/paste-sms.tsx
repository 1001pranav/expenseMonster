import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { captureText } from '@/services/capture';
import { Button, Card, Txt } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { TextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';
import { space } from '@/ui/theme';

/** SMS capture without the SMS permission: share a bank SMS to the app, or copy and paste it here. */
export default function PasteSms() {
  const params = useLocalSearchParams<{ text?: string }>();
  const [text, setText] = useState(params.text ?? '');
  const [unrecognised, setUnrecognised] = useState(false);

  const read = async () => {
    if (!text.trim()) return;
    const r = await captureText(text);
    if (!r.recognised) return setUnrecognised(true);
    if (r.added || r.bills) {
      toast('Added to Review', { tone: 'success' });
      router.replace('/review');
    } else toast(r.duplicates ? 'Already recorded' : 'Nothing to record in this message');
  };

  // Shared from Messages: read it straight away so sharing is the whole job.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (params.text) read();
    // Only for the text this screen was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.text]);

  return (
    <Screen title="Paste a bank SMS" subtitle="No SMS permission needed" back footer={<Button title="Read message" icon="sparkles" size="lg" onPress={read} disabled={!text.trim()} />}>
      <Txt tone="muted">
        {params.text
          ? "Shared from another app. If it wasn't picked up, check it's the bank message and tap Read message. It's read on this phone and not saved."
          : 'Fastest: in Messages, long-press the bank SMS → Share → ExpenseMonster. Or copy it and paste it here. The message is read on this phone and not saved.'}
      </Txt>
      <Button
        title="Paste from clipboard"
        icon="clipboard-outline"
        variant="secondary"
        onPress={async () => {
          setText(await Clipboard.getStringAsync());
          setUnrecognised(false);
        }}
      />
      <TextField
        label="Message"
        value={text}
        onChangeText={(v) => {
          setText(v);
          setUnrecognised(false);
        }}
        multiline
        placeholder="Sent Rs.250.00 From HDFC Bank A/C *1234 To SWIGGY On 12/09/26 Ref 425612345678"
      />
      {unrecognised ? (
        <Card style={{ gap: space(1) }}>
          <Txt variant="bodyStrong">This format isn't recognised yet</Txt>
          <Txt variant="small" tone="muted">
            Teach it once by tapping the amount, payee and date. After that, every message like this is read automatically.
          </Txt>
          <Button title="Teach this format" icon="school-outline" onPress={() => router.push({ pathname: '/settings/sms-format', params: { text } })} />
          <Button title="Add it manually instead" variant="ghost" onPress={() => router.replace('/txn/new')} />
        </Card>
      ) : null}
    </Screen>
  );
}
