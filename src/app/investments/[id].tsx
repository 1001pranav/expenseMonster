import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { formatDay } from '@/domain/dates';
import { ASSET_CLASSES, formatQuantity, ledger, liveTrades, premiumOverMetal, sameMetal, unitLabel } from '@/domain/investments';
import { parseAmount } from '@/domain/money';
import { setHoldingClosed, setPrice } from '@/data/investments';
import { useMembers, useSelfId, useTable } from '@/data/hooks';
import { Button, Card, Divider, EmptyState, ListRow, Money, Row, Section, Txt, useMoneyText } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { SwitchRow, TextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

/** One holding: what is held, at what cost, its purchases and sales with their gains. */
export default function HoldingDetail() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const holdings = useTable('holdings');
  const holding = holdings.find((h) => h.id === id);
  const trades = useTable('trades');
  const txns = useTable('transactions');
  const members = useMembers();
  const selfId = useSelfId();
  const money = useMoneyText();
  const [priceText, setPriceText] = useState(holding?.priceNow ? String(holding.priceNow / 100) : '');
  const [allOfMetal, setAllOfMetal] = useState(true);
  const s = useMemo(() => (holding ? ledger(holding, liveTrades(trades, txns).filter((t) => t.holdingId === holding.id)) : null), [holding, trades, txns]);
  if (!holding || !s) {
    return (
      <Screen title="Investment" back>
        <EmptyState icon="alert-circle-outline" title="Not found" body="It may have been deleted on this or another phone." />
      </Screen>
    );
  }
  const meta = ASSET_CLASSES[holding.assetClass];
  const owner = holding.memberId ? (holding.memberId === selfId ? 'Yours' : `${members.find((m) => m.id === holding.memberId)?.name ?? 'Someone'}'s`) : 'Joint';
  const gainOf = new Map(s.realised.map((r) => [r.trade.id, r]));
  const others = holdings.filter((h) => h.id !== holding.id && sameMetal(holding, h)).length;
  const per = unitLabel(holding.unit, false) || 'unit';
  const gain = s.value !== null ? s.value - s.invested : null;
  const savePrice = async () => {
    const p = parseAmount(priceText);
    if (!p) return toast(`Enter the price per ${per}`, { tone: 'error' });
    const n = await setPrice(holding.id, p, { sameMetal: allOfMetal && others > 0 });
    toast(n > 1 ? `Price set for ${n} holdings` : 'Price saved', { tone: 'success' });
  };
  const exchangeable = (holding.assetClass === 'gold' || holding.assetClass === 'silver') && holding.unit === 'g' && holding.form !== 'sgb';

  return (
    <Screen
      title={holding.name}
      subtitle={[meta.label, meta.forms.find((f) => f.value === holding.form)?.label, owner].filter(Boolean).join(' · ')}
      back
      footer={
        <Row gap={1}>
          <Button title="Buy more" icon="add" variant="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/investments/new', params: { side: 'buy', holdingId: holding.id } })} />
          {!s.soldOut ? <Button title="Sell" icon="cash-outline" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/investments/new', params: { side: 'sell', holdingId: holding.id } })} /> : null}
        </Row>
      }
    >
      <Card style={{ gap: space(1) }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt tone="muted">{s.soldOut ? 'Sold out' : 'Held'}</Txt>
          <Txt variant="bodyStrong">
            {holding.unit === 'none' ? '' : s.quantityComplete ? formatQuantity(s.quantity, holding.unit) : `${formatQuantity(s.quantity, holding.unit)} recorded`}
          </Txt>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt tone="muted">Cost</Txt>
          <Money value={s.invested} decimals="never" />
        </Row>
        {s.value !== null && gain !== null ? (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt tone="muted">Worth now</Txt>
              <Money value={s.value} decimals="never" />
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt tone="muted">{gain >= 0 ? 'Gain if sold' : 'Loss if sold'}</Txt>
              <Money value={gain} decimals="never" signed colorBySign />
            </Row>
          </>
        ) : null}
        {s.costs ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt tone="muted">of which charges & taxes</Txt>
            <Money value={s.costs} decimals="never" />
          </Row>
        ) : null}
        {!s.quantityComplete && holding.unit !== 'none' && !s.soldOut ? (
          <Txt variant="small" tone="warn">
            Some purchases have no {holding.unit === 'g' ? 'weight' : 'quantity'}. Add it to them to track the value and work out gains on a partial sale.
          </Txt>
        ) : null}
      </Card>

      {!s.soldOut && holding.unit !== 'none' ? (
        <Section title="Current price">
          <Card style={{ gap: space(1) }}>
            <TextField
              label={`Price per ${per} today`}
              value={priceText}
              onChangeText={setPriceText}
              keyboardType="decimal-pad"
              placeholder="₹"
              hint={holding.priceAsOf ? `Last set ${formatDay(holding.priceAsOf, { year: true })}` : 'Not set yet'}
            />
            {others ? <SwitchRow label={`Same rate for ${others} other ${holding.purity ? `${holding.purity} ` : ''}${ASSET_CLASSES[holding.assetClass].label.toLowerCase()} holding${others > 1 ? 's' : ''}`} value={allOfMetal} onChange={setAllOfMetal} /> : null}
            {!s.quantityComplete ? (
              <Txt variant="small" tone="muted">
                It can be valued once every purchase has its {holding.unit === 'g' ? 'weight' : 'quantity'}.
              </Txt>
            ) : null}
            <Button title="Save price" size="sm" variant="secondary" onPress={savePrice} />
          </Card>
        </Section>
      ) : null}

      <Section title="History">
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {[...s.trades].reverse().map((t, i) => {
            const r = gainOf.get(t.id);
            const qty = t.quantity !== null && holding.unit !== 'none' ? formatQuantity(t.quantity, holding.unit) : t.side === 'sell' && t.quantity === null ? 'all of it' : null;
            return (
              <View key={t.id}>
                {i ? <Divider inset={space(9)} /> : null}
                <ListRow
                  icon={t.side === 'buy' ? 'arrow-down' : 'arrow-up'}
                  iconColor={t.side === 'buy' ? colors.income : colors.info}
                  title={`${t.side === 'buy' ? (t.txnId ? 'Bought' : 'Received') : t.txnId ? 'Sold' : 'Traded in / given'}${qty ? ` ${qty}` : ''}`}
                  subtitle={[
                    formatDay(t.tradeDate, { year: true }),
                    premiumOverMetal(t) ? `${money(premiumOverMetal(t)!.premium, { decimals: 'never' })} (${Math.round(premiumOverMetal(t)!.share * 100)}%) over the metal` : null,
                    r ? (r.gain === null ? 'gain unknown' : `${r.gain >= 0 ? 'gain' : 'loss'} ${r.beyondRecorded ? 'at least ' : ''}${money(Math.abs(r.gain), { decimals: 'never' })}`) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  right={<Money value={t.amount} decimals="never" />}
                  chevron
                  onPress={() => router.push(`/investments/trade/${t.id}`)}
                />
              </View>
            );
          })}
        </Card>
      </Section>

      {exchangeable && !s.soldOut ? (
        <Button title="Trade in for new jewellery" icon="swap-horizontal" variant="secondary" onPress={() => router.push({ pathname: '/investments/exchange', params: { holdingId: holding.id } })} />
      ) : null}
      <Button
        title={holding.closed ? 'Show in the list again' : 'Hide from the list'}
        variant="ghost"
        onPress={() => setHoldingClosed(holding.id, !holding.closed).then(() => toast(holding.closed ? 'Shown again' : 'Hidden; find it under Sold'))}
      />
    </Screen>
  );
}
