import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { formatDay, isoToYMD } from '@/domain/dates';
import { ASSET_CLASSES, ASSET_ORDER, formatQuantity, investedByOwner, legacyInvestmentExpenses, portfolioValue, summarizeHoldings } from '@/domain/investments';
import { applyFundPrices } from '@/data/investments';
import { useMembers, useSelfId, useTable } from '@/data/hooks';
import { proposeFundPrices, type NavProposal } from '@/services/navPrices';
import { Sheet, toast } from '@/ui/components/feedback';
import { Button, Card, Divider, EmptyState, ListRow, Money, Row, Section, Txt, useMoneyText, type IconName } from '@/ui/components/core';
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
  const money = useMoneyText();
  const [navs, setNavs] = useState<{ proposals: NavProposal[]; unmatched: number } | null>(null);
  const [fetching, setFetching] = useState(false);
  const getFundPrices = async () => {
    setFetching(true);
    try {
      const r = await proposeFundPrices();
      setNavs({ proposals: r.proposals, unmatched: r.unmatched.length });
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setFetching(false);
    }
  };

  const summaries = useMemo(() => summarizeHoldings(holdings, trades, txns).filter((s) => s.trades.length), [holdings, trades, txns]);
  const held = summaries.filter((s) => !s.soldOut && !s.holding.closed);
  const sold = summaries.filter((s) => s.soldOut || s.holding.closed);
  const owners = investedByOwner(held);
  const worth = portfolioValue(held);
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
        right={
          s.value !== null ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Money value={s.value} decimals="never" />
              <Money value={s.value - s.invested} decimals="never" variant="small" signed colorBySign />
            </View>
          ) : (
            <Money value={s.invested} decimals="never" />
          )
        }
        chevron
        onPress={() => router.push(`/investments/${s.holding.id}`)}
      />
    );
  };

  return (
    <Screen title="Investments" subtitle="What was put in, and what it's worth where a price is set" back footer={<Button title="Invest / sell" icon="add" size="lg" onPress={() => router.push('/investments/new')} />}>
      <Card style={{ gap: space(1) }}>
        <Txt variant="small" tone="muted">
          Household total, at cost
        </Txt>
        <Money value={owners.total} variant="h1" decimals="never" />
        {worth.valuedCost ? (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="small" tone="muted">
                {worth.unvalued ? 'Worth now (priced holdings)' : 'Worth now'}
              </Txt>
              <Money value={worth.value} decimals="never" />
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="small" tone="muted">
                Gain not yet taken
              </Txt>
              <Money value={worth.value - worth.valuedCost} decimals="never" signed colorBySign />
            </Row>
          </>
        ) : null}
        {worth.unvalued && held.length ? (
          <Txt variant="small" tone="faint">
            {worth.unvalued === held.length ? 'Set a current price on a holding to see what it is worth.' : `${worth.unvalued} without a price: counted at cost.`}
          </Txt>
        ) : null}
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

      <Button title="Import CDSL / NSDL statement" icon="document-text-outline" variant="secondary" onPress={() => router.push('/investments/cas')} />
      {held.some((x) => x.holding.assetClass === 'mf') ? (
        <Button title="Get today's fund prices (AMFI)" icon="cloud-download-outline" variant="secondary" loading={fetching} onPress={getFundPrices} />
      ) : null}
      <Sheet visible={Boolean(navs)} onClose={() => setNavs(null)} title="Fund prices from AMFI">
        <Txt variant="small" tone="muted">
          Each fund's latest NAV from AMFI's public file, dated as published. Nothing is saved until you apply; you can still change a price on its fund.
        </Txt>
        {navs?.proposals.map((p) => (
          <View key={p.holding.id} style={{ gap: 2 }}>
            <Txt numberOfLines={1}>{p.holding.name}</Txt>
            <Txt variant="small" tone="muted">
              {p.current ? `${money(p.current)} → ` : ''}
              {money(p.scheme.nav)} · {formatDay(p.scheme.date, { year: true })}
            </Txt>
          </View>
        ))}
        {navs?.unmatched ? (
          <Txt variant="small" tone="warn">
            {navs.unmatched === 1 ? 'One fund has' : `${navs.unmatched} funds have`} no scheme code: open {navs.unmatched === 1 ? 'it' : 'each'} and link it to its AMFI scheme.
          </Txt>
        ) : null}
        {navs?.proposals.length ? (
          <Button
            title={`Apply ${navs.proposals.length} price${navs.proposals.length > 1 ? 's' : ''}`}
            icon="checkmark"
            onPress={async () => {
              await applyFundPrices(navs.proposals.map((p) => ({ holdingId: p.holding.id, nav: p.scheme.nav, date: p.scheme.date })));
              toast('Fund prices updated', { tone: 'success' });
              setNavs(null);
            }}
          />
        ) : null}
        <Button title="Close" variant="secondary" onPress={() => setNavs(null)} />
      </Sheet>

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
