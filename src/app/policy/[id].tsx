import { router, useLocalSearchParams } from 'expo-router';
import { formatDay, relativeDay } from '@/domain/dates';
import { FREQUENCY_LABEL } from '@/domain/recurrence';
import { parseIds } from '@/domain/settle';
import { remove, restore, update } from '@/db/repo';
import { useDues, useMembers, useTable, useToday } from '@/data/hooks';
import { Button, Card, EmptyState, IconButton, Money, Pill, Row, Section, Txt } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { TxnRow, openPay } from '@/ui/components/rows';
import { Screen } from '@/ui/components/Screen';
import { space } from '@/ui/theme';

export default function PolicyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const policy = useTable('policies').find((p) => p.id === id);
  const txns = useTable('transactions');
  const members = useMembers();
  const today = useToday();
  const dues = useDues(400);
  if (!policy) {
    return (
      <Screen title="Policy" back>
        <EmptyState icon="alert-circle-outline" title="Not found" />
      </Screen>
    );
  }
  const due = dues.find((d) => d.link?.type === 'policy' && d.link.id === policy.id);
  const payments = txns.filter((t) => t.linkType === 'policy' && t.linkId === policy.id && t.status === 'confirmed');
  const covered = parseIds(policy.coveredMemberIds).map((mid) => members.find((m) => m.id === mid)?.name).filter(Boolean);
  const info: [string, string | null][] = [
    ['Insurer', policy.insurer],
    ['Policy no.', policy.policyNo],
    ['Frequency', FREQUENCY_LABEL[policy.frequency]],
    ['Covers', covered.join(', ') || null],
    ['Nominee', policy.nominee],
  ];

  return (
    <Screen
      title={policy.name}
      back
      right={
        <>
          <IconButton name="create-outline" label="Edit" onPress={() => router.push({ pathname: '/policy/new', params: { id: policy.id } })} />
          <IconButton
            name="trash-outline"
            label="Delete"
            onPress={async () => {
              await remove('policies', policy.id);
              toast('Policy deleted', { actionLabel: 'Undo', onAction: () => restore('policies', policy.id) });
              router.back();
            }}
          />
        </>
      }
      footer={due ? <Button title="Pay premium" icon="checkmark" size="lg" onPress={() => openPay(due)} /> : undefined}
    >
      <Card style={{ gap: space(1) }}>
        <Txt variant="caption" tone="muted">
          NEXT PREMIUM
        </Txt>
        <Money value={policy.premium} variant="h1" />
        <Row gap={1}>
          <Pill label={`${formatDay(policy.nextDueDate, { year: true })} · ${relativeDay(policy.nextDueDate, today)}`} tone={policy.nextDueDate < today ? 'expense' : 'info'} />
          {policy.autopay ? <Pill label="Auto-debit" /> : null}
        </Row>
        {policy.sumAssured ? (
          <Row gap={1}>
            <Txt tone="muted">Cover</Txt>
            <Money value={policy.sumAssured} compact />
          </Row>
        ) : null}
      </Card>
      <Card style={{ gap: space(1) }}>
        {info
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <Row key={k} style={{ justifyContent: 'space-between' }}>
              <Txt tone="muted">{k}</Txt>
              <Txt variant="bodyStrong" style={{ flexShrink: 1, textAlign: 'right' }}>
                {v}
              </Txt>
            </Row>
          ))}
      </Card>
      {payments.length ? (
        <Section title="Premiums paid">
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {payments.map((t) => (
              <TxnRow key={t.id} t={t} />
            ))}
          </Card>
        </Section>
      ) : null}
      <Button title={policy.active ? 'Policy ended / lapsed' : 'Mark active again'} variant="ghost" onPress={() => update('policies', policy.id, { active: policy.active ? 0 : 1 })} />
    </Screen>
  );
}
