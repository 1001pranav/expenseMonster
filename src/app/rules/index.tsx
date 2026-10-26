import { router } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';
import { describeRule, isLearned, orderRules } from '@/domain/rules';
import type { CategoryRule } from '@/domain/types';
import { remove, restore } from '@/db/repo';
import { useCategoryMap, useTable } from '@/data/hooks';
import { Button, Card, EmptyState, IconCircle, Section, Txt } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { MoreMenu } from '@/ui/components/MoreMenu';
import { Screen } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

/**
 * Every rule as a sentence ("When a screenshot mentions “credit card” → Paid with HDFC"), split
 * into the user's own and the ones learned from filing. Tap to edit; deleting asks first.
 */
export default function Rules() {
  const rules = useTable('rules');
  const mine = orderRules(rules.filter((r) => !isLearned(r)));
  const learned = orderRules(rules.filter(isLearned));

  return (
    <Screen title="Rules" subtitle="What happens to new entries automatically" back footer={<Button title="New rule" icon="add" size="lg" onPress={() => router.push('/rules/edit')} />}>
      <Section title={`Your rules${mine.length ? ` · ${mine.length}` : ''}`}>
        {mine.length ? (
          <View style={{ gap: space(1) }}>
            {mine.map((r) => (
              <RuleCard key={r.id} rule={r} />
            ))}
          </View>
        ) : (
          <Card>
            <EmptyState icon="flash-outline" title="No rules yet" body="For example: when a screenshot mentions “credit card”, mark it as paid with your HDFC card." action="Make one" onAction={() => router.push('/rules/edit')} />
          </Card>
        )}
      </Section>

      <Section title={`Learned from you${learned.length ? ` · ${learned.length}` : ''}`}>
        <Txt variant="small" tone="muted" style={{ paddingHorizontal: 4 }}>
          Made when you file a payee under a category, and updated when you file it differently. Edit one to make it yours: then it stays as you set it.
        </Txt>
        {learned.length ? (
          <View style={{ gap: space(1) }}>
            {learned.map((r) => (
              <RuleCard key={r.id} rule={r} />
            ))}
          </View>
        ) : null}
      </Section>
    </Screen>
  );
}

function RuleCard({ rule }: { rule: CategoryRule }) {
  const { colors } = useTheme();
  const catMap = useCategoryMap();
  const cards = useTable('cards');
  const accounts = useTable('accounts');
  const { when, then } = describeRule(rule, {
    category: (id) => catMap.get(id)?.name,
    card: (id) => cards.find((c) => c.id === id)?.name,
    account: (id) => accounts.find((a) => a.id === id)?.name,
  });
  const learned = isLearned(rule);
  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      <Pressable
        onPress={() => router.push({ pathname: '/rules/edit', params: { id: rule.id } })}
        accessibilityRole="button"
        accessibilityLabel={`${when}. ${then.join('. ')}. Tap to edit`}
        style={({ pressed }) => ({ flexDirection: 'row', gap: space(1.5), padding: space(2), paddingRight: space(1), backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}
      >
        <IconCircle name={learned ? 'sparkles-outline' : 'flash'} size={36} state={learned ? undefined : 'good'} />
        <View style={{ flex: 1, gap: 4 }}>
          <Txt variant="bodyStrong">{when}</Txt>
          {then.map((t) => (
            <Txt key={t} variant="small" tone="muted">
              → {t}
            </Txt>
          ))}
        </View>
        <MoreMenu
          title={when}
          actions={[
            { label: 'Edit', icon: 'create-outline', onPress: () => router.push({ pathname: '/rules/edit', params: { id: rule.id } }) },
            { label: 'Delete rule', icon: 'trash-outline', destructive: true, onPress: () => confirmDelete(rule, when) },
          ]}
        />
      </Pressable>
    </Card>
  );
}

export function confirmDelete(rule: CategoryRule, when: string, after?: () => void) {
  Alert.alert('Delete this rule?', `${when}. New entries won't get this any more; entries already saved stay as they are.`, [
    { text: 'Keep', style: 'cancel' },
    {
      text: 'Delete',
      style: 'destructive',
      onPress: async () => {
        await remove('rules', rule.id);
        toast('Rule deleted', { actionLabel: 'Undo', onAction: () => restore('rules', rule.id) });
        after?.();
      },
    },
  ]);
}
