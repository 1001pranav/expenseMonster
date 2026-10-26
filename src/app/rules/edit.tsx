import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { describeRule, isLearned, ruleMatches } from '@/domain/rules';
import type { CategoryRule, PayMethod, RuleField, RuleSource } from '@/domain/types';
import { insert, update } from '@/db/repo';
import { useCategoryMap, useSortedCategories, useTable } from '@/data/hooks';
import { Button, Card, Txt, type IconName } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { Field, Segmented, TextField } from '@/ui/components/forms';
import { Screen, goBack } from '@/ui/components/Screen';
import { Tile, TileGrid, TileRow } from '@/ui/components/tiles';
import { space } from '@/ui/theme';
import { confirmDelete } from './index';

/** Make or change a rule: when <words> appear in <where>, then set category / how it was paid / name. */
export default function RuleEdit() {
  const params = useLocalSearchParams<{ id?: string; payee?: string; categoryId?: string; method?: PayMethod; cardId?: string; source?: RuleSource }>();
  const rules = useTable('rules');
  const cards = useTable('cards');
  const accounts = useTable('accounts');
  const txns = useTable('transactions');
  const catMap = useCategoryMap();
  const categories = [...useSortedCategories('expense'), ...useSortedCategories('income')];
  const existing = rules.find((r) => r.id === params.id);

  const [field, setField] = useState<RuleField>(existing?.field === 'text' ? 'text' : 'payee');
  const [pattern, setPattern] = useState(existing?.pattern ?? params.payee?.toLowerCase() ?? '');
  const [source, setSource] = useState<RuleSource>(existing?.source ?? params.source ?? 'any');
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? params.categoryId ?? '');
  const [method, setMethod] = useState<PayMethod | null>(existing ? (isLearned(existing) ? null : existing.method) : (params.method ?? null));
  const [cardId, setCardId] = useState<string | null>(existing?.cardId ?? (params.cardId || null));
  const [rename, setRename] = useState(existing?.rename ?? '');
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);

  const draft: CategoryRule = {
    ...(existing ?? { id: 'draft', createdAt: '', updatedAt: '', deletedAt: null, deviceId: '', scope: 'household' }),
    pattern: pattern.trim().toLowerCase(),
    field,
    source,
    categoryId,
    method,
    cardId: method === 'card' ? cardId : null,
    accountId: null,
    rename: rename.trim() || null,
    learned: 0,
  };
  const sentence = describeRule(draft, { category: (id) => catMap.get(id)?.name, card: (id) => cards.find((c) => c.id === id)?.name, account: (id) => accounts.find((a) => a.id === id)?.name });
  // Past entries it would have matched. Screenshot and SMS text isn't kept, so only the payee can be checked.
  const matches = useMemo(() => (draft.pattern ? txns.filter((t) => t.status === 'confirmed' && ruleMatches({ ...draft, field: 'payee' }, { payee: t.payee, vpa: t.vpa, source: t.source })).length : 0), [txns, draft.pattern, source]); // eslint-disable-line react-hooks/exhaustive-deps

  const payOptions: { key: string; icon: IconName; label: string; sub?: string; method: PayMethod | null; cardId?: string }[] = [
    { key: 'none', icon: 'remove-outline', label: 'Leave as read', method: null },
    { key: 'upi', icon: 'qr-code', label: 'UPI', method: 'upi' },
    ...cards.map((c) => ({ key: c.id, icon: 'card' as IconName, label: c.name, sub: c.last4 ? `••${c.last4}` : 'Credit card', method: 'card' as PayMethod, cardId: c.id })),
    { key: 'cash', icon: 'cash', label: 'Cash', method: 'cash' },
    { key: 'bank', icon: 'business', label: 'Bank', method: 'bank' },
  ];
  const shownCats = showAll ? categories : [...categories.slice(0, 11), ...categories.slice(11).filter((c) => c.id === categoryId)];

  const save = async () => {
    if (draft.pattern.length < 2) return toast('Type the words to look for', { tone: 'error' });
    if (!categoryId && !method && !draft.rename) return toast('Pick at least one thing the rule should do', { tone: 'error' });
    setSaving(true);
    const data = { pattern: draft.pattern, field, source, categoryId, method, cardId: draft.cardId, accountId: null, rename: draft.rename, learned: 0 as const, scope: existing?.scope ?? ('household' as const) };
    try {
      if (existing) await update('rules', existing.id, data);
      else await insert('rules', data);
      toast(existing ? 'Rule saved' : 'Rule added. New entries will follow it.', { tone: 'success' });
      goBack();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      title={existing ? 'Edit rule' : 'New rule'}
      back
      right={existing ? <Button title="Delete" variant="ghost" size="sm" onPress={() => confirmDelete(existing, sentence.when, goBack)} /> : undefined}
      footer={<Button title="Save rule" icon="checkmark" size="lg" loading={saving} onPress={save} />}
    >
      {existing && isLearned(existing) ? (
        <Card tone="alt">
          <Txt variant="small" tone="muted">
            Learned from how you filed {existing.pattern}. Once you save it here it becomes your rule and stops changing on its own.
          </Txt>
        </Card>
      ) : null}

      <Txt variant="h3">When</Txt>
      <Segmented
        value={field}
        onChange={setField}
        options={[
          { value: 'payee', label: 'The payee name' },
          { value: 'text', label: 'Anything on it' },
        ]}
      />
      <TextField
        label={field === 'text' ? 'mentions these words' : 'contains these words'}
        value={pattern}
        onChangeText={setPattern}
        placeholder={field === 'text' ? 'credit card' : 'swiggy'}
        autoCapitalize="none"
        hint={field === 'text' ? 'Looks through everything read from a screenshot or SMS, e.g. "HDFC Credit Card" or "XX1234".' : matches ? `Matches ${matches} past ${matches === 1 ? 'entry' : 'entries'}` : 'Matches no past entries yet'}
      />
      <Field label="in">
        <Segmented
          value={source}
          onChange={setSource}
          options={[
            { value: 'any', label: field === 'text' ? 'Screenshots and SMS' : 'Everything' },
            { value: 'ocr', label: 'Screenshots' },
            { value: 'sms', label: 'SMS' },
          ]}
        />
      </Field>

      <Txt variant="h3" style={{ marginTop: space(1) }}>
        Then
      </Txt>
      <Field label="Mark it as paid with">
        <TileRow>
          {payOptions.map((o) => (
            <Tile
              key={o.key}
              width={92}
              icon={o.icon}
              label={o.label}
              sub={o.sub}
              selected={method === o.method && (o.method !== 'card' || cardId === o.cardId)}
              onPress={() => {
                setMethod(o.method);
                if (o.cardId) setCardId(o.cardId);
              }}
            />
          ))}
        </TileRow>
      </Field>
      <Field label="File under" hint={categoryId ? 'Tap it again to leave the category alone' : 'Optional'}>
        <TileGrid columns={4}>
          {(w) => (
            <>
              {shownCats.map((c) => (
                <Tile key={c.id} width={w} icon={c.icon as IconName} tint={c.color} label={c.name} selected={categoryId === c.id} onPress={() => setCategoryId((v) => (v === c.id ? '' : c.id))} />
              ))}
              {categories.length > 11 ? <Tile width={w} icon={showAll ? 'chevron-up' : 'apps-outline'} label={showAll ? 'Fewer' : `All ${categories.length}`} onPress={() => setShowAll((v) => !v)} /> : null}
            </>
          )}
        </TileGrid>
      </Field>
      <TextField label="Call the payee (optional)" value={rename} onChangeText={setRename} placeholder="e.g. Swiggy" />

      <Card tone="alt" style={{ gap: 4 }}>
        <Txt variant="caption" tone="muted">
          This rule reads
        </Txt>
        <Txt variant="bodyStrong">{sentence.when}</Txt>
        {sentence.then.map((t) => (
          <Txt key={t} variant="small">
            → {t}
          </Txt>
        ))}
        <View style={{ height: 4 }} />
        <Txt variant="small" tone="muted">
          Your rules come before learned ones and before how a payee was filed in the past. Entries already saved don't change.
        </Txt>
      </Card>
    </Screen>
  );
}
