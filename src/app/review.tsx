import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { cardHintOf, duplicateOf, splitCaptures } from '@/domain/captures';
import { formatDay, formatTime, isoToYMD, relativeDay, toYMD } from '@/domain/dates';
import { formatINR } from '@/domain/money';
import { flagsOf } from '@/domain/transactions';
import type { Category, CreditCard, Transaction } from '@/domain/types';
import { findById, getCaptureText, remove, saveSettings, update, type CaptureText } from '@/db/repo';
import { useStore } from '@/db/store';
import { answerCardHint, approveCapture, keepBothCaptures, rejectCapture } from '@/data/actions';
import { useCategoryMap, usePending, useTable, useToday } from '@/data/hooks';
import { importBankSms, requestSmsPermission, smsCaptureAvailable } from '@/services/smsInbox';
import { Button, Card, Chip, EmptyState, IconCircle, Money, Pill, Row, Section, Txt, type IconName } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { Screen } from '@/ui/components/Screen';
import { SwipeRow } from '@/ui/components/SwipeRow';
import { fonts, space, useTheme } from '@/ui/theme';

export default function Review() {
  const { colors } = useTheme();
  const { transactions, bills } = usePending();
  const cats = useCategoryMap();
  const cards = useTable('cards');
  const billers = useTable('billers');
  const today = useToday();
  const importedTo = useStore((s) => s.settings.smsImportedTo);
  const [importing, setImporting] = useState(false);
  const { ready, needsYou } = useMemo(() => splitCaptures(transactions), [transactions]);

  const approve = async (t: Transaction) => {
    await approveCapture(t.id);
    toast('Approved', { tone: 'success', actionLabel: 'Undo', onAction: () => update('transactions', t.id, { status: 'pending' }) });
  };
  const reject = async (t: Transaction) => {
    await rejectCapture(t.id);
    toast('Rejected', { actionLabel: 'Undo', onAction: () => update('transactions', t.id, { status: 'pending' }) });
  };
  const approveReady = async () => {
    for (const t of ready) await approveCapture(t.id);
    toast(`Approved ${ready.length}`, { tone: 'success' });
  };

  // Tapping Import is the user asking, so the Android prompt may show here (never on its own).
  const importSms = async () => {
    if (!importedTo) return router.push('/settings/sms');
    if ((await requestSmsPermission()) !== 'granted') return toast('Android did not allow reading SMS. Allow it in Bank SMS settings.', { tone: 'error' });
    setImporting(true);
    try {
      const { added, startedAt } = await importBankSms(importedTo);
      await saveSettings({ smsImportedTo: startedAt });
      toast(added ? `${added} new from your bank SMS` : 'No new bank SMS', { tone: added ? 'success' : 'default' });
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Screen
      title="Check captures"
      subtitle={
        transactions.length
          ? [`${transactions.length} to check`, importedTo ? `SMS read ${relativeDay(toYMD(new Date(importedTo)), today).replace(/^(Today|Yesterday)$/, (w) => w.toLowerCase())}` : null].filter(Boolean).join(' · ')
          : 'Nothing is saved until you approve it'
      }
      back
      right={smsCaptureAvailable ? <Button title="Import" icon="download-outline" variant="ghost" size="sm" loading={importing} onPress={importSms} /> : undefined}
      footer={ready.length ? <Button title={ready.length === 1 ? 'Approve the one read clearly' : `Approve ${ready.length} that were read clearly`} icon="checkmark-done" variant="success" size="lg" onPress={approveReady} /> : undefined}
    >
      {transactions.length + bills.length === 0 ? (
        <EmptyState icon="checkmark-done-circle-outline" title="All caught up" body="Share a payment screenshot from GPay / PhonePe to ExpenseMonster, or paste a bank SMS." action="Scan a screenshot" onAction={() => router.replace('/scan')} />
      ) : null}

      {ready.length ? (
        <Section>
          <SectionHead title={`Ready · ${ready.length}`} note="Read clearly, known payee" />
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {ready.map((t, i) => (
              <View key={t.id}>
                {i ? <View style={{ height: 1, backgroundColor: colors.surfaceAlt, marginLeft: space(8.5) }} /> : null}
                <Pressable onPress={() => router.push(`/txn/${t.id}`)} accessibilityRole="button" style={({ pressed }) => ({ paddingHorizontal: space(2), paddingVertical: space(1.5), backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}>
                  <CaptureLine t={t} cat={cats.get(t.categoryId ?? '')} card={cards.find((c) => c.id === t.cardId)} today={today} />
                  {t.source === 'sms' ? <SmsSource txnId={t.id} inset /> : null}
                </Pressable>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      {needsYou.length ? (
        <Section>
          <SectionHead title={`Needs you · ${needsYou.length}`} note="One question each" />
          <View style={{ gap: space(1.25) }}>
            {needsYou.map((t) => (
              <Card key={t.id} padded={false} style={{ overflow: 'hidden' }}>
                <SwipeRow left={[{ label: 'Approve', icon: 'checkmark', color: colors.good, onPress: () => approve(t) }]} right={[{ label: 'Reject', icon: 'close', color: colors.expense, onPress: () => reject(t) }]}>
                  <View style={{ padding: space(2), gap: space(1.25) }}>
                    <Pressable onPress={() => router.push(`/txn/${t.id}`)} accessibilityRole="button" accessibilityHint="Opens it to change">
                      <CaptureLine t={t} cat={cats.get(t.categoryId ?? '')} card={cards.find((c) => c.id === t.cardId)} today={today} />
                    </Pressable>
                    {t.source === 'sms' ? <SmsSource txnId={t.id} /> : null}
                    <Question t={t} cards={cards} hasCategory={Boolean(cats.get(t.categoryId ?? ''))} onApprove={() => approve(t)} onReject={() => reject(t)} />
                  </View>
                </SwipeRow>
              </Card>
            ))}
          </View>
        </Section>
      ) : null}

      {bills.length ? (
        <Section title={`Bills detected · ${bills.length}`}>
          {bills.map((b) => {
            const biller = billers.find((x) => x.id === b.billerId);
            return (
              <Card key={b.id} style={{ gap: space(1.25) }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="bodyStrong">{biller?.name ?? 'Bill'}</Txt>
                    <Txt variant="small" tone="muted">
                      Due {formatDay(b.dueDate)} · {relativeDay(b.dueDate, today)}
                      {b.usage ? ` · ${b.usage} ${biller?.usageUnit ?? 'units'}` : ''}
                    </Txt>
                  </View>
                  <Money value={b.amount} variant="h3" />
                </Row>
                <Row gap={1}>
                  <Button title="Add bill" size="sm" variant="success" icon="checkmark" style={{ flex: 1 }} onPress={() => update('bills', b.id, { status: 'open' }).then(() => toast('Bill added — reminder set', { tone: 'success' }))} />
                  <Button title="Edit" size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/bill/new', params: { id: b.id } })} />
                  <Button title="Ignore" size="sm" variant="ghost" onPress={() => remove('bills', b.id)} />
                </Row>
              </Card>
            );
          })}
        </Section>
      ) : null}
    </Screen>
  );
}

/** Section title with a short muted note on the right (the design's "Ready · 3   Read clearly"). */
function SectionHead({ title, note }: { title: string; note: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingHorizontal: 4 }}>
      <Txt variant="h3" style={{ fontFamily: fonts.displaySemi, fontSize: 17 }}>
        {title}
      </Txt>
      <Txt variant="small" tone="muted">
        {note}
      </Txt>
    </Row>
  );
}

/**
 * Who sent the SMS and what it said, so you can tell what a payment was before approving it. Kept
 * on this phone only while the capture waits here; older captures (and pasted ones from before this
 * was kept) have none, and then nothing is shown. Tap to see the whole message.
 */
function SmsSource({ txnId, inset }: { txnId: string; inset?: boolean }) {
  const { colors } = useTheme();
  const [sms, setSms] = useState<CaptureText | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    getCaptureText(txnId)
      .then((r) => live && setSms(r))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [txnId]);
  if (!sms) return null;
  const when = sms.receivedAt ? `${relativeDay(isoToYMD(sms.receivedAt), toYMD(new Date()))}, ${formatTime(sms.receivedAt)}` : 'Pasted';
  return (
    <Pressable
      onPress={() => setOpen((o) => !o)}
      accessibilityRole="button"
      accessibilityLabel={`SMS from ${sms.sender ?? 'unknown sender'}: ${sms.body}`}
      accessibilityHint={open ? 'Shows less' : 'Shows the whole message'}
      style={{ marginTop: inset ? space(1) : 0, marginLeft: inset ? space(6.5) : 0, padding: space(1.25), borderRadius: 10, backgroundColor: colors.surfaceAlt, gap: 4 }}
    >
      <Row gap={0.75}>
        <Txt variant="small" style={{ fontFamily: fonts.bold, flexShrink: 1 }} numberOfLines={1}>
          {sms.sender ?? 'Sender unknown'}
        </Txt>
        <Txt variant="caption" tone="muted">
          · {when}
        </Txt>
      </Row>
      <Txt variant="small" tone="muted" numberOfLines={open ? undefined : 2}>
        {sms.body}
      </Txt>
    </Pressable>
  );
}

function CaptureLine({ t, cat, card, today }: { t: Transaction; cat?: Category; card?: CreditCard; today: string }) {
  const how = t.method === 'card' ? (card?.name ?? 'Credit card') : t.method === 'upi' ? 'UPI' : t.method.charAt(0).toUpperCase() + t.method.slice(1);
  return (
    <Row gap={1.5}>
      <IconCircle name={t.type === 'income' ? 'arrow-down' : t.type === 'transfer' ? 'swap-horizontal' : ((cat?.icon as IconName) ?? 'arrow-up')} state={t.type === 'income' ? 'income' : undefined} />
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong" numberOfLines={1}>
          {t.payee ?? (t.type === 'income' ? 'Money received' : 'Payment')}
        </Txt>
        <Txt variant="small" tone="muted" numberOfLines={1}>
          {[relativeDay(isoToYMD(t.occurredAt), today), t.source === 'sms' ? 'SMS' : 'Screenshot', cat?.name, how].filter(Boolean).join(' · ')}
        </Txt>
      </View>
      <Money value={t.type === 'expense' ? -t.amount : t.amount} variant="h3" tone={t.type === 'income' ? 'income' : 'default'} />
    </Row>
  );
}

/** The one thing a capture needs from you, answered right on its card. */
function Question({ t, cards, hasCategory, onApprove, onReject }: { t: Transaction; cards: CreditCard[]; hasCategory: boolean; onApprove: () => void; onReject: () => void }) {
  const flags = flagsOf(t);
  const hint = cardHintOf(t);
  const dupId = duplicateOf(t);

  if (dupId) {
    const other = findById('transactions', dupId);
    return (
      <>
        <Row gap={1} wrap>
          <Pill label="Possible duplicate" tone="expense" />
          {other ? (
            <Txt variant="small" tone="muted">
              {formatINR(other.amount)}
              {other.payee ? ` to ${other.payee}` : ''}, {formatDay(isoToYMD(other.occurredAt))}
            </Txt>
          ) : null}
        </Row>
        <Row gap={1}>
          <Button title="Same one, discard" size="sm" variant="secondary" style={{ flex: 1 }} onPress={onReject} />
          <Button title="Keep both" size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => keepBothCaptures(t.id)} />
        </Row>
      </>
    );
  }

  return (
    <>
      {hint ? (
        <>
          <Row gap={1} wrap>
            <Pill label="Which card?" tone="warn" />
            <Txt variant="small" tone="muted">
              Card ending {hint} isn't saved
            </Txt>
          </Row>
          <Row gap={1} wrap>
            {cards.map((c) => (
              <Chip
                key={c.id}
                compact
                icon="card"
                label={c.name}
                onPress={async () => {
                  await answerCardHint(t.id, c.id);
                  toast(`${c.name} ••${hint}: remembered`, { tone: 'success' });
                }}
              />
            ))}
            <Chip compact icon="add" label="New card" onPress={() => router.push('/card/new')} />
          </Row>
        </>
      ) : (
        <Row gap={1} wrap>
          {[
            flags.includes('amount-unsure') ? <Pill key="amt" label="Check the amount" tone="warn" /> : null,
            flags.includes('payment-pending') ? <Pill key="pend" label="Payment was pending" tone="warn" /> : null,
            !hasCategory ? <Pill key="cat" label="No category" tone="warn" /> : null,
            !t.payee?.trim() ? <Pill key="payee" label="Who was it paid to?" tone="warn" /> : null,
            (t.confidence ?? 1) < 0.8 ? <Pill key="sure" label="Not read clearly" tone="warn" /> : null,
          ]
            .filter(Boolean)
            .slice(0, 2)}
        </Row>
      )}
      <Row gap={1}>
        <Button title="Approve" size="sm" variant="success" icon="checkmark" onPress={onApprove} style={{ flex: 1 }} disabled={Boolean(hint)} />
        <Button title="Change" size="sm" variant="secondary" onPress={() => router.push(`/txn/${t.id}`)} style={{ flex: 1 }} />
      </Row>
    </>
  );
}
