import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { changedFields } from '@/domain/sync/merge';
import { formatINR } from '@/domain/money';
import type { BaseRow } from '@/domain/types';
import { loadConflicts, resolveConflicts, type PendingConflict } from '@/services/sync';
import { Button, Card, EmptyState, Pill, Row, Txt } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { Screen } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

const TABLE_LABEL: Record<string, string> = {
  transactions: 'Transaction',
  loans: 'Loan',
  cards: 'Credit card',
  billers: 'Bill',
  bills: 'Bill amount',
  policies: 'Insurance',
  incomes: 'Income',
  members: 'Member',
  accounts: 'Account',
  categories: 'Category',
  budgets: 'Budget',
  rules: 'Auto-category rule',
  sms_formats: 'SMS format',
  card_overrides: 'Card statement',
};
const MONEY = /amount|principal|emi|premium|limit|total|minDue|fixedAmount|sumAssured|lateFee|openingBalance/i;
const key = (c: PendingConflict) => `${c.table}:${c.local.id}`;
const rec = (r: BaseRow) => r as unknown as Record<string, unknown>;

function show(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (field === 'deletedAt') return 'Deleted';
  if (typeof v === 'number' && MONEY.test(field)) return formatINR(v);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString();
  return String(v);
}

const titleOf = (r: BaseRow) => {
  const x = rec(r);
  return String(x.payee ?? x.name ?? x.pattern ?? x.insurer ?? (typeof x.amount === 'number' ? formatINR(x.amount) : '') ?? '');
};

export default function Conflicts() {
  const { colors } = useTheme();
  const [list, setList] = useState<PendingConflict[]>([]);
  const reload = useCallback(() => loadConflicts().then(setList), []);
  useEffect(() => {
    reload();
  }, [reload]);

  const resolve = async (keys: string[], choice: 'mine' | 'theirs') => {
    const left = await resolveConflicts(keys, choice);
    await reload();
    if (!left) {
      toast(choice === 'mine' ? 'Done. Send to your family so their phones get your version.' : 'Done', { tone: 'success' });
      router.back();
    }
  };

  return (
    <Screen
      title="Resolve conflicts"
      subtitle="Changed on both phones since the last sync"
      back
      footer={
        list.length > 1 ? (
          <Row gap={1}>
            <Button title="Keep all mine" variant="secondary" onPress={() => resolve(list.map(key), 'mine')} style={{ flex: 1 }} />
            <Button title="Use all theirs" onPress={() => resolve(list.map(key), 'theirs')} style={{ flex: 1 }} />
          </Row>
        ) : undefined
      }
    >
      {!list.length ? <EmptyState icon="checkmark-done-circle-outline" title="No conflicts" /> : null}
      {list.map((c) => {
        const fields = changedFields(c.local, c.incoming).filter((f) => f !== 'deviceId');
        return (
          <Card key={key(c)} style={{ gap: space(1.25) }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                {titleOf(c.local) || titleOf(c.incoming) || TABLE_LABEL[c.table]}
              </Txt>
              <Pill label={TABLE_LABEL[c.table] ?? c.table} />
            </Row>
            <Row>
              <Txt variant="caption" tone="muted" style={{ flex: 1 }}>
                FIELD
              </Txt>
              <Txt variant="caption" tone="primary" style={{ flex: 1.2 }}>
                MINE
              </Txt>
              <Txt variant="caption" tone="info" style={{ flex: 1.2 }}>
                {c.from.toUpperCase()}
              </Txt>
            </Row>
            {fields.map((f) => (
              <Row key={f} style={{ alignItems: 'flex-start' }}>
                <Txt variant="small" tone="muted" style={{ flex: 1 }}>
                  {f === 'deletedAt' ? 'Status' : f}
                </Txt>
                <Txt variant="small" style={{ flex: 1.2 }}>
                  {show(f, rec(c.local)[f])}
                </Txt>
                <Txt variant="small" style={{ flex: 1.2 }}>
                  {show(f, rec(c.incoming)[f])}
                </Txt>
              </Row>
            ))}
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <Txt variant="caption" tone="faint">
              Edited here {new Date(c.local.updatedAt).toLocaleString()} · there {new Date(c.incoming.updatedAt).toLocaleString()} (stored as UTC)
            </Txt>
            <Row gap={1}>
              <Button title="Keep mine" size="sm" variant="secondary" onPress={() => resolve([key(c)], 'mine')} style={{ flex: 1 }} />
              <Button title="Use theirs" size="sm" onPress={() => resolve([key(c)], 'theirs')} style={{ flex: 1 }} />
            </Row>
          </Card>
        );
      })}
    </Screen>
  );
}
