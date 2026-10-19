import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { formatDay, isoToYMD } from '@/domain/dates';
import { ASSET_CLASSES, ASSET_ORDER, formatQuantity, investedByOwner, legacyInvestmentExpenses, summarizeHoldings } from '@/domain/investments';
import { useMembers, useSelfId, useTable } from '@/data/hooks';
import { Button, Card, Divider, EmptyState, ListRow, Money, Row, Section, Txt, type IconName } from '@/ui/components/core';
import { Screen } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

/** What the family has put into investments, at cost (current values come with prices, phase 2). */
export default function Investments() {
  const { colors } = useTheme();
  const holdings = useTable('holdings');
  const trades = useTable('trades');
  const txns = useTable('transactions');
  const members = useMembers();
  const selfId = useSelfId();
  const [showSold, setShowSold] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);

  const summaries = useMemo(() => summarizeHoldings(holdings, trades, txns).filter((s) => s.trades.length), [holdings, trades, txns]);
  const held = summaries.filter((s) => !s.soldOut && !s.holding.closed);
  const sold = summaries.filter((s) => s.soldOut || s.holding.closed);
  const owners = investedByOwner(held);
  const realised = summaries.flatMap((s) => s.realised).filter((r) => r.gain !== null);
  const legacy = useMemo(() => legacyInvestmentExpenses(txns), [txns]);
  const nameOf = (id: string) => (id === selfId ? 'You' : (members.find((m) => m.id === id)?.name ?? 'Someone'));

  const row = (s: (typeof summaries)[number]) => {
    const meta = ASSET_CLASSES[s.holding.assetClass];
    const qty = s.holding.unit === 'none' ? null : s.quantityComplete ? formatQuantity(s.quantity, s.holding.unit) : 'Add quantities to track its value';
    const whose = s.holding.memberId ? nameOf(s.holding.memberId) : 'Joint';
    return (
      <ListRow
        key={s.holding.id}
        icon={meta.icon as IconName}
        iconColor={colors.income}
        title={s.holding.name}
        subtitle={[qty, members.length > 1 ? whose : null].filter(Boolean).join(' · ')}
        right={<Money value={s.invested} decimals="never" />}
        chevron
        onPress={() => router.push(`/investments/${s.holding.id}`)}
      />
    );
  };

  return (
    <Screen title="Investments" subtitle="At cost: what was put in" back footer={<Button title="Invest / sell" icon="add" size="lg" onPress={() => router.push('/investments/new')} />}>
      <Card style={{ gap: space(1) }}>
        <Txt variant="small" tone="muted">
          Household total
        </Txt>
        <Money value={owners.total} variant="h1" decimals="never" />
        {Object.keys(owners.byMember).length ? (
          <View style={{ gap: 4 }}>
            {Object.entries(owners.byMember).map(([id, v]) => (
              <Row key={id} style={{ justifyContent: 'space-between' }}>
                <Txt tone="muted">{nameOf(id)}</Txt>
                <Money value={v} decimals="never" />
              </Row>
            ))}
            {owners.joint ? (
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt tone="muted">Joint</Txt>
                <Money value={owners.joint} decimals="never" />
              </Row>
            ) : null}
          </View>
        ) : null}
        {realised.length ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="small" tone="muted">
              Gains from sales so far
            </Txt>
            <Money value={realised.reduce((a, r) => a + (r.gain ?? 0), 0)} decimals="never" signed colorBySign />
          </Row>
        ) : null}
      </Card>

      {legacy.length ? (
        <Card style={{ gap: space(1), borderWidth: 1.5, borderColor: colors.warn }}>
          <Txt variant="bodyStrong">
            {legacy.length} older {legacy.length === 1 ? 'entry is' : 'entries are'} filed under Investments as spending
          </Txt>
          <Txt variant="small" tone="muted">
            They count as money spent, which lowers your savings rate. Record each as an investment to move it here. Past months' totals change when you do.
          </Txt>
          <Button title={showLegacy ? 'Hide them' : 'Review them'} size="sm" variant="secondary" onPress={() => setShowLegacy((v) => !v)} />
          {showLegacy
            ? legacy.map((t) => (
                <Row key={t.id} gap={1}>
                  <View style={{ flex: 1 }}>
                    <Txt numberOfLines={1}>{t.payee || 'Investment'}</Txt>
                    <Txt variant="small" tone="muted">
                      {formatDay(isoToYMD(t.occurredAt), { year: true })}
                    </Txt>
                  </View>
                  <Money value={t.amount} decimals="never" />
                  <Button title="Record" size="sm" onPress={() => router.push({ pathname: '/investments/new', params: { fromTxn: t.id } })} />
                </Row>
              ))
            : null}
        </Card>
      ) : null}

      {!held.length && !sold.length ? <EmptyState icon="trending-up-outline" title="Nothing recorded yet" body="Gold, silver, shares, funds and deposits you buy appear here, by person and joint." /> : null}

      {ASSET_ORDER.map((c) => {
        const list = held.filter((s) => s.holding.assetClass === c);
        if (!list.length) return null;
        return (
          <Section key={c} title={ASSET_CLASSES[c].label}>
            <Card padded={false} style={{ overflow: 'hidden' }}>
              {list.map((s, i) => (
                <View key={s.holding.id}>
                  {i ? <Divider inset={space(9)} /> : null}
                  {row(s)}
                </View>
              ))}
            </Card>
          </Section>
        );
      })}

      {sold.length ? (
        <Section title="Sold" action={showSold ? 'Hide' : `Show ${sold.length}`} onAction={() => setShowSold((v) => !v)}>
          {showSold ? (
            <Card padded={false} style={{ overflow: 'hidden' }}>
              {sold.map((s, i) => (
                <View key={s.holding.id}>
                  {i ? <Divider inset={space(9)} /> : null}
                  {row(s)}
                </View>
              ))}
            </Card>
          ) : null}
        </Section>
      ) : null}
    </Screen>
  );
}
