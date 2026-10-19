import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { CAPITAL_GAINS_RULES, capitalGains } from '@/domain/capitalGains';
import { summarizeHoldings } from '@/domain/investments';
import { taxSummary, type TaxSection } from '@/domain/tax';
import { useTable, useToday } from '@/data/hooks';
import { Button, Card, Divider, EmptyState, IconCircle, Money, Pill, ProgressBar, Row, Section, Txt, useMoneyText, type IconName } from '@/ui/components/core';
import { Screen } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

const R = CAPITAL_GAINS_RULES;
const pct = (rate: number) => `${+(rate * 100).toFixed(2)}%`;

const META: Record<TaxSection, { title: string; body: string; icon: IconName; tip: string }> = {
  '80C': {
    title: 'Section 80C',
    body: 'Life & term premiums, home-loan principal',
    icon: 'shield-checkmark',
    tip: 'PPF, ELSS, EPF, tuition fees and 5-year FDs also count here. Add them to reach ₹1.5L.',
  },
  '80D': {
    title: 'Section 80D',
    body: 'Health insurance for you, spouse and children',
    icon: 'medkit',
    tip: "Parents' health cover gets a separate ₹25K (₹50K if they're senior citizens).",
  },
  '24b': {
    title: 'Section 24(b)',
    body: 'Interest on a self-occupied home loan',
    icon: 'home',
    tip: 'A co-owner who also pays the EMI can claim their own ₹2L.',
  },
  '80E': {
    title: 'Section 80E',
    body: 'Interest on an education loan · no upper limit',
    icon: 'school',
    tip: 'Claimable for up to 8 years from when repayment starts.',
  },
};

export default function Tax() {
  const { colors } = useTheme();
  const money = useMoneyText();
  const today = useToday();
  const policies = useTable('policies');
  const loans = useTable('loans');
  const transactions = useTable('transactions');
  const { fy, sections } = useMemo(() => taxSummary({ policies, loans, transactions }, today), [policies, loans, transactions, today]);
  const total = sections.reduce((a, s) => a + s.claimed, 0);
  const tracked = sections.filter((s) => s.lines.length);
  const headroom80C = sections.find((s) => s.section === '80C')?.headroom ?? 0;
  const holdings = useTable('holdings');
  const trades = useTable('trades');
  const gains = useMemo(() => capitalGains(summarizeHoldings(holdings, trades, transactions), fy), [holdings, trades, transactions, fy]);
  const anyGains = gains.listedEquity.short || gains.listedEquity.long || gains.otherAsset.short || gains.otherAsset.long || gains.unestimated.length;
  const gainRow = (label: string, value: number, tax?: { amount: number; how: string }) => (
    <View key={label} style={{ gap: 2, paddingVertical: space(0.75) }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="small">{label}</Txt>
        <Money value={value} variant="small" signed colorBySign decimals="never" />
      </Row>
      {tax ? (
        <Txt variant="caption" tone="muted">
          {tax.how}: about {money(tax.amount, { decimals: 'never' })}
        </Txt>
      ) : null}
    </View>
  );

  return (
    <Screen title="Tax saver" subtitle={`${fy.label} · old tax regime`} back>
      <Card tone="primary" style={{ gap: space(1) }}>
        <Txt variant="small" tone="inverse" style={{ opacity: 0.85 }}>
          Deductions tracked so far
        </Txt>
        <Money value={total} variant="display" tone="inverse" decimals="never" fit="narrow" />
        <Txt variant="small" tone="inverse" style={{ opacity: 0.85 }}>
          {headroom80C > 0 ? `${money(headroom80C, { compact: true })} of 80C still unused before 31 Mar` : '80C limit reached for this year'}
        </Txt>
      </Card>

      {!tracked.length ? (
        <Card>
          <EmptyState
            icon="receipt-outline"
            title="Nothing tracked yet"
            body="Pay insurance premiums from Dues and add your home or education loan. Their deductible part shows up here automatically."
            action="Add a policy or loan"
            onAction={() => router.push('/add')}
          />
        </Card>
      ) : null}

      {sections.map((s) => {
        const meta = META[s.section];
        const raw = s.lines.reduce((a, l) => a + l.amount, 0);
        return (
          <Section key={s.section}>
            <Card style={{ gap: space(1.25) }}>
              <Row gap={1.5}>
                <IconCircle name={meta.icon} color={s.lines.length ? colors.income : colors.textFaint} />
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong">{meta.title}</Txt>
                  <Txt variant="small" tone="muted">
                    {meta.body}
                  </Txt>
                </View>
                {s.limit !== null && s.headroom === 0 ? <Pill label="Maxed" tone="income" /> : null}
              </Row>
              {s.limit !== null ? (
                <View style={{ gap: 6 }}>
                  <ProgressBar value={raw / s.limit} color={colors.income} height={6} />
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Txt variant="small" tone="muted">
                      {money(s.claimed, { compact: true })} of {money(s.limit, { compact: true })}
                    </Txt>
                    {s.headroom ? (
                      <Txt variant="small" tone="primary">
                        {money(s.headroom, { compact: true })} left
                      </Txt>
                    ) : null}
                  </Row>
                </View>
              ) : (
                <Money value={s.claimed} variant="h3" />
              )}
              {s.lines.length ? (
                <View>
                  {s.lines.map((l, i) => (
                    <View key={l.key}>
                      {i ? <Divider /> : null}
                      <Row style={{ justifyContent: 'space-between', paddingVertical: space(1) }} gap={1}>
                        <Txt variant="small" style={{ flex: 1 }} numberOfLines={1}>
                          {l.label}
                        </Txt>
                        <Money value={l.amount} variant="small" />
                      </Row>
                    </View>
                  ))}
                </View>
              ) : null}
              <Txt variant="small" tone="faint">
                {meta.tip}
              </Txt>
            </Card>
          </Section>
        );
      })}

      {anyGains ? (
        <Section title={`Capital gains · ${fy.label}`}>
          <Card style={{ gap: space(0.5) }}>
            <Txt variant="small" tone="muted">
              From investments sold this year, under either tax regime. Short or long term by how long each purchase was held, earliest purchases sold first.
            </Txt>
            {gains.listedEquity.short || gains.listedEquity.long ? (
              <>
                <Divider />
                <Txt variant="bodyStrong">Shares and equity funds</Txt>
                {gainRow(`Short term (${R.listedEquity.longAfterMonths} months or less)`, gains.listedEquity.short, { amount: gains.tax.equityShort, how: `Taxed at ${pct(R.listedEquity.shortRate)}` })}
                {gainRow('Long term', gains.listedEquity.long, { amount: gains.tax.equityLong, how: `${pct(R.listedEquity.longRate)} on gains above ${money(R.listedEquity.longExemption, { compact: true })} a year` })}
              </>
            ) : null}
            {gains.otherAsset.short || gains.otherAsset.long ? (
              <>
                <Divider />
                <Txt variant="bodyStrong">Gold and silver (physical, digital)</Txt>
                <View style={{ paddingVertical: space(0.75) }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Txt variant="small">Short term ({R.otherAsset.longAfterMonths} months or less)</Txt>
                    <Money value={gains.otherAsset.short} variant="small" signed colorBySign decimals="never" />
                  </Row>
                  <Txt variant="caption" tone="muted">
                    Added to your income, taxed at your slab rate
                  </Txt>
                </View>
                {gainRow('Long term', gains.otherAsset.long, { amount: gains.tax.otherLong, how: `Taxed at ${pct(R.otherAsset.longRate)}, no indexation` })}
              </>
            ) : null}
            {gains.unestimated.length ? (
              <>
                <Divider />
                <Txt variant="bodyStrong">Not estimated: check with your CA</Txt>
                {gains.unestimated.map((u, i) => (
                  <View key={`${u.holding.id}-${i}`} style={{ paddingVertical: space(0.5) }}>
                    <Row style={{ justifyContent: 'space-between' }} gap={1}>
                      <Txt variant="small" style={{ flex: 1 }} numberOfLines={1}>
                        {u.holding.name}
                      </Txt>
                      {u.gain !== null ? <Money value={u.gain} variant="small" signed colorBySign decimals="never" /> : <Txt variant="small" tone="muted">gain unknown</Txt>}
                    </Row>
                    <Txt variant="caption" tone="muted">
                      {u.reason}
                    </Txt>
                  </View>
                ))}
              </>
            ) : null}
            <Txt variant="caption" tone="faint" style={{ marginTop: space(0.5) }}>
              An estimate, not tax advice. Losses are netted within each line only (the return's set-off rules can do more). Surcharge and cess not included. Rules: {R.source}
            </Txt>
          </Card>
        </Section>
      ) : null}

      <Card tone="alt" style={{ gap: 6 }}>
        <Txt variant="bodyStrong">Good to know</Txt>
        <Txt variant="small" tone="muted">
          These deductions only apply under the old tax regime. The new regime (the default) has lower rates but allows almost none of them, so compare both before you file. This is an estimate from your entries, not tax advice.
        </Txt>
      </Card>
      <Button title="Add insurance policy" icon="add" variant="secondary" onPress={() => router.push('/policy/new')} />
    </Screen>
  );
}
