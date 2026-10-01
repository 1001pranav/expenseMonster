import { useState } from 'react';
import { View } from 'react-native';
import type { Paise } from '@/domain/money';
import type { Account, AccountType } from '@/domain/types';
import { insert, remove, update } from '@/db/repo';
import { useTable } from '@/data/hooks';
import { Button, Card, EmptyState, ListRow, Txt, type IconName } from '@/ui/components/core';
import { Sheet, toast } from '@/ui/components/feedback';
import { AmountField, ChipSelect, SwitchRow, TextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';
import { useTheme } from '@/ui/theme';

const ICON: Record<AccountType, IconName> = { bank: 'business', cash: 'cash', wallet: 'wallet' };

export default function Accounts() {
  const { colors } = useTheme();
  const accounts = useTable('accounts');
  const [editing, setEditing] = useState<Partial<Account> | null>(null);
  const [opening, setOpening] = useState<Paise | null>(null);

  const open = (a?: Account) => {
    setEditing(a ?? { name: '', type: 'bank', last4: null, scope: 'personal' });
    setOpening(a?.openingBalance ?? null);
  };

  const save = async () => {
    if (!editing?.name?.trim()) return toast('Name the account', { tone: 'error' });
    if (editing.last4 && !/^\d{3,4}$/.test(editing.last4)) return toast('Last 4 digits only', { tone: 'error' });
    const data = { name: editing.name.trim(), type: editing.type ?? 'bank', last4: editing.last4 || null, openingBalance: opening ?? 0, scope: editing.scope ?? 'personal' };
    if (editing.id) await update('accounts', editing.id, data);
    else await insert('accounts', data);
    setEditing(null);
  };

  return (
    <Screen title="Accounts & wallets" back footer={<Button title="Add account" icon="add" onPress={() => open()} />}>
      <Txt variant="small" tone="muted">
        The last 4 digits let bank SMS land in the right account automatically. Never enter full account numbers.
      </Txt>
      {accounts.length ? (
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {accounts.map((a) => (
            <ListRow key={a.id} icon={ICON[a.type]} iconColor={colors.info} title={a.name} subtitle={`${a.type}${a.last4 ? ` · ••${a.last4}` : ''}${a.scope === 'personal' ? ' · private' : ''}`} chevron onPress={() => open(a)} />
          ))}
        </Card>
      ) : (
        <EmptyState icon="business-outline" title="No accounts" body="Optional, but helps match SMS and see where money moved." />
      )}
      <Sheet visible={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit account' : 'Add account'}>
        <TextField label="Name" value={editing?.name ?? ''} onChangeText={(v) => setEditing((e) => ({ ...e, name: v }))} placeholder="HDFC Savings, Cash, Paytm wallet" />
        <ChipSelect
          label="Type"
          value={editing?.type ?? 'bank'}
          onChange={(v) => v && setEditing((e) => ({ ...e, type: v }))}
          options={[
            { value: 'bank', label: 'Bank' },
            { value: 'cash', label: 'Cash' },
            { value: 'wallet', label: 'Wallet' },
          ]}
        />
        {editing?.type === 'bank' ? <TextField label="Last 4 digits" value={editing?.last4 ?? ''} onChangeText={(v) => setEditing((e) => ({ ...e, last4: v.replace(/\D/g, '').slice(0, 4) }))} keyboardType="number-pad" /> : null}
        <AmountField key={editing?.id ?? 'new'} label="Opening balance (optional)" value={opening} onChange={setOpening} />
        <SwitchRow label="Share with family" value={editing?.scope === 'household'} onChange={(v) => setEditing((e) => ({ ...e, scope: v ? 'household' : 'personal' }))} />
        <Button title="Save" onPress={save} />
        {editing?.id ? (
          <View>
            <Button
              title="Delete account"
              variant="ghost"
              onPress={async () => {
                await remove('accounts', editing.id!);
                setEditing(null);
              }}
            />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
