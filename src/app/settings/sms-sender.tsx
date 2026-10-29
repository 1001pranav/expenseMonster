import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { isPhoneSender, normalizeSender } from '@/domain/smsSender';
import { insert, remove, update } from '@/db/repo';
import { useTable } from '@/data/hooks';
import { smsCaptureAvailable } from '@/services/smsInbox';
import { Button, Txt } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { ChipSelect, Segmented, TextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';

const NONE = '__none';

/**
 * Mark an SMS sender (a DLT id like VM-HDFCBK, or a plain phone number) as a bank, and say which of
 * your accounts or cards its messages are about; or block it. Opened with `id` to edit, or with
 * `sender` to start from a pasted message's sender.
 */
export default function SmsSenderScreen() {
  const params = useLocalSearchParams<{ id?: string; sender?: string }>();
  const senders = useTable('sms_senders');
  const accounts = useTable('accounts');
  const cards = useTable('cards');
  const existing = senders.find((s) => s.id === params.id);
  const [sender, setSender] = useState(existing?.sender ?? params.sender ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [kind, setKind] = useState<'bank' | 'blocked'>(existing?.kind ?? 'bank');
  const [link, setLink] = useState<string>(existing?.cardId ? `card:${existing.cardId}` : existing?.accountId ? `account:${existing.accountId}` : NONE);

  const key = normalizeSender(sender);
  const clash = senders.find((s) => s.sender === key && s.id !== existing?.id);
  const linkOptions = [
    { value: NONE, label: 'Work it out from the SMS' },
    ...accounts.map((a) => ({ value: `account:${a.id}`, label: a.last4 ? `${a.name} ••${a.last4}` : a.name })),
    ...cards.map((c) => ({ value: `card:${c.id}`, label: c.last4 ? `${c.name} ••${c.last4}` : c.name })),
  ];

  const save = async () => {
    if (!key) return toast('Enter the sender as it shows in Messages', { tone: 'error' });
    const [type, linkId] = link === NONE ? [null, null] : link.split(':');
    const data = {
      sender: key,
      name: name.trim() || null,
      kind,
      accountId: kind === 'bank' && type === 'account' ? linkId : null,
      cardId: kind === 'bank' && type === 'card' ? linkId : null,
    };
    // One mark per sender: saving a sender that's already marked updates that one.
    const target = existing ?? clash;
    if (target) await update('sms_senders', target.id, data);
    else await insert('sms_senders', { ...data, scope: 'household' });
    toast(kind === 'bank' ? `${key} marked as your bank` : `${key} blocked`, { tone: 'success' });
    router.back();
  };

  return (
    <Screen
      title={existing ? (existing.name ?? existing.sender) : 'Mark a sender'}
      subtitle="Bank number or SMS sender id"
      back
      footer={<Button title="Save" icon="checkmark" size="lg" onPress={save} disabled={!key} />}
    >
      <TextField
        label="Sender"
        value={sender}
        onChangeText={setSender}
        placeholder="VM-HDFCBK or 98765 43210"
        autoCapitalize="characters"
        hint={key ? `Matches ${isPhoneSender(key) ? `the number ${key}` : `${key}, with any prefix like VM- or AD-`}` : 'As it shows at the top of the message'}
        error={clash && !existing ? `${key} is already marked; saving replaces it` : null}
      />
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'bank', label: 'My bank' },
          { value: 'blocked', label: 'Block it' },
        ]}
      />
      {kind === 'bank' ? (
        <>
          <TextField label="Name (optional)" value={name} onChangeText={setName} placeholder="MyCoop Bank" />
          <ChipSelect label="Its messages are about" options={linkOptions} value={link} onChange={(v) => setLink(v ?? NONE)} wrap />
          <Txt variant="small" tone="muted">
            Used when a message doesn't say which account or card. When it names one by its last 4 digits, that one wins.
          </Txt>
          {smsCaptureAvailable && isPhoneSender(key) ? (
            <Txt variant="small" tone="muted">
              SMS import reads this number from now on (normally only bank sender ids are read).
            </Txt>
          ) : null}
        </>
      ) : (
        <Txt variant="small" tone="muted">
          Messages from this sender are never captured, even if they look like a payment.
        </Txt>
      )}
      {existing ? <Button title="Remove mark" variant="danger" onPress={() => remove('sms_senders', existing.id).then(() => router.back())} /> : null}
    </Screen>
  );
}
