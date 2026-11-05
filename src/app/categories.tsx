import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { categoryTree, isEmpty, moveCategory } from '@/domain/categories';
import { monthKey, isoToYMD } from '@/domain/dates';
import type { Category } from '@/domain/types';
import { SYSTEM_CATEGORIES, moveAndDeleteCategory, refsOf } from '@/data/actions';
import { insert, remove, restore, saveSettings, update } from '@/db/repo';
import { MEMBER_COLORS } from '@/db/seed';
import { useStore } from '@/db/store';
import { useTable, useToday } from '@/data/hooks';
import { Button, Chip, IconButton, IconCircle, List, ListRow, Row, Section, Txt, type IconName } from '@/ui/components/core';
import { Sheet, toast } from '@/ui/components/feedback';
import { ChipSelect, Field, Segmented, TextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';
import { radius, space, useTheme } from '@/ui/theme';

/** One colour, many shapes: categories are told apart by icon and name, never by colour. */
const ICONS: IconName[] = [
  'basket', 'cart', 'restaurant', 'fast-food', 'cafe', 'pizza', 'beer', 'wine',
  'car', 'bus', 'train', 'bicycle', 'airplane', 'speedometer', 'home', 'construct',
  'flash', 'water', 'flame', 'wifi', 'phone-portrait', 'tv', 'medkit', 'fitness',
  'school', 'book', 'film', 'musical-notes', 'game-controller', 'shirt', 'bag-handle', 'cut',
  'sparkles', 'heart', 'gift', 'paw', 'flower', 'people', 'happy', 'briefcase',
  'storefront', 'cash', 'card', 'wallet', 'receipt', 'shield-checkmark', 'trending-down', 'pricetag',
];

type Draft = Partial<Category> & { kind: Category['kind'] };

export default function Categories() {
  const { colors } = useTheme();
  const today = useToday();
  const cats = useTable('categories');
  const txns = useTable('transactions');
  const rules = useTable('rules');
  const order = useStore((s) => s.settings.categoryOrder);
  const [kind, setKind] = useState<Category['kind']>('expense');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [moving, setMoving] = useState(false);

  const month = monthKey(today);
  const thisMonth = useMemo(() => {
    const n = new Map<string, number>();
    for (const t of txns) if (t.categoryId && !t.deletedAt && t.status !== 'rejected' && monthKey(isoToYMD(t.occurredAt)) === month) n.set(t.categoryId, (n.get(t.categoryId) ?? 0) + 1);
    return n;
  }, [txns, month]);

  const tree = categoryTree(cats, kind);
  const shown = tree.filter((c) => !c.hidden);
  const hidden = tree.filter((c) => c.hidden);
  const parents = shown.filter((c) => !c.parentId && c.id !== editing?.id);
  const refs = editing?.id ? refsOf(editing.id) : null;
  const system = editing?.id ? SYSTEM_CATEGORIES.has(editing.id) : false;
  const targets = editing?.id ? shown.filter((c) => c.id !== editing.id && c.kind === editing.kind) : [];

  const open = (c: Draft | null) => {
    setMoving(false);
    setEditing(c);
  };

  const save = async () => {
    if (!editing?.name?.trim()) return toast('Give it a name', { tone: 'error' });
    const data = {
      name: editing.name.trim(),
      icon: editing.icon ?? 'pricetag',
      kind: editing.kind,
      // Kept as it was: editing a sub-category used to drop it out of its parent.
      parentId: editing.parentId ?? null,
    };
    if (editing.id) await update('categories', editing.id, data);
    else {
      const last = Math.max(0, ...cats.filter((c) => c.kind === editing.kind).map((c) => c.sortOrder));
      await insert('categories', { ...data, color: MEMBER_COLORS[0], sortOrder: last + 10, hidden: 0, scope: 'household' });
    }
    open(null);
  };

  const setHidden = async (c: Draft, value: 0 | 1) => {
    await update('categories', c.id!, { hidden: value });
    open(null);
    toast(value ? `${c.name} hidden. Its entries keep it.` : `${c.name} is back in the pickers`, value ? { actionLabel: 'Undo', onAction: () => update('categories', c.id!, { hidden: 0 }) } : undefined);
  };

  const deleteEmpty = async (c: Draft) => {
    await remove('categories', c.id!);
    open(null);
    toast(`${c.name} deleted`, { actionLabel: 'Undo', onAction: () => restore('categories', c.id!) });
  };

  const moveTo = (from: Draft, to: Category) =>
    Alert.alert(`Move to ${to.name}?`, `Every entry, budget and rule filed under ${from.name} moves to ${to.name}, then ${from.name} is deleted. This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Move and delete',
        style: 'destructive',
        onPress: async () => {
          const n = await moveAndDeleteCategory(from.id!, to.id);
          open(null);
          toast(`${n === 1 ? '1 entry' : `${n} entries`} moved to ${to.name}`);
        },
      },
    ]);

  const reorder = async (id: string, dir: -1 | 1) => {
    for (const x of moveCategory(cats, id, dir)) await update('categories', x.id, { sortOrder: x.sortOrder });
  };

  const row = (c: Category) => {
    const n = thisMonth.get(c.id) ?? 0;
    const siblings = shown.filter((s) => (s.parentId ?? null) === (c.parentId ?? null));
    const i = siblings.findIndex((s) => s.id === c.id);
    return (
      <View key={c.id} style={{ paddingLeft: c.parentId ? space(3) : 0 }}>
        <ListRow
          leading={<IconCircle name={c.icon as IconName} />}
          title={c.name}
          subtitle={c.hidden ? 'Hidden from pickers' : n ? `${n} this month` : 'None this month'}
          onPress={() => open(c)}
          chevron={order !== 'manual' || Boolean(c.hidden)}
          right={
            order === 'manual' && !c.hidden ? (
              <Row gap={0}>
                <IconButton name="chevron-up" label={`Move ${c.name} up`} disabled={i <= 0} onPress={() => reorder(c.id, -1)} />
                <IconButton name="chevron-down" label={`Move ${c.name} down`} disabled={i >= siblings.length - 1} onPress={() => reorder(c.id, 1)} />
              </Row>
            ) : undefined
          }
        />
      </View>
    );
  };

  return (
    <Screen title="Categories" back footer={<Button title="New category" icon="add" onPress={() => open({ kind, icon: 'pricetag' })} />}>
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'expense', label: 'Spending' },
          { value: 'income', label: 'Money in' },
        ]}
      />

      <View style={{ gap: space(1) }}>
        <Txt variant="small" tone="muted">
          Order in Quick Add
        </Txt>
        <Segmented
          value={order}
          onChange={(v) => saveSettings({ categoryOrder: v })}
          options={[
            { value: 'usage', label: 'Most used first' },
            { value: 'manual', label: 'As listed here' },
          ]}
        />
        <Txt variant="small" tone="muted">
          {order === 'manual' ? 'Use the arrows to choose the order. Quick Add still puts its suggestion first.' : 'The ones you use most come first. Choose "As listed here" to set the order yourself.'}
        </Txt>
      </View>

      <Section title={kind === 'expense' ? 'Spending categories' : 'Money in categories'}>
        <List>{shown.map(row)}</List>
      </Section>

      {hidden.length ? (
        <Section title="Hidden">
          <List>{hidden.map(row)}</List>
        </Section>
      ) : null}

      <List>
        <ListRow icon="flash-outline" title="Rules" subtitle={`${rules.length} · file payees and cards automatically`} chevron onPress={() => router.push('/rules')} />
      </List>

      <Sheet visible={Boolean(editing)} onClose={() => open(null)} title={editing?.id ? 'Edit category' : 'New category'}>
        {editing?.id ? null : (
          <Segmented
            value={editing?.kind ?? 'expense'}
            onChange={(v) => setEditing((e) => (e ? { ...e, kind: v, parentId: null } : e))}
            options={[
              { value: 'expense', label: 'Spending' },
              { value: 'income', label: 'Money in' },
            ]}
          />
        )}
        <TextField label="Name" value={editing?.name ?? ''} onChangeText={(v) => setEditing((e) => (e ? { ...e, name: v } : e))} autoCapitalize="sentences" />
        {parents.length && !cats.some((c) => c.parentId === editing?.id && !c.deletedAt) ? (
          <ChipSelect
            label="Inside (optional)"
            value={editing?.parentId ?? null}
            allowNone
            onChange={(v) => setEditing((e) => (e ? { ...e, parentId: v } : e))}
            options={parents.filter((p) => p.kind === editing?.kind).map((p) => ({ value: p.id, label: p.name }))}
          />
        ) : null}
        <Field label="Icon">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(1) }}>
            {ICONS.map((i) => {
              const on = editing?.icon === i;
              return (
                <Pressable
                  key={i}
                  onPress={() => setEditing((e) => (e ? { ...e, icon: i } : e))}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={i.replace(/-/g, ' ')}
                  style={{ borderRadius: radius.md, borderWidth: 2, borderColor: on ? colors.primary : 'transparent', padding: 1 }}
                >
                  <IconCircle name={i} size={40} />
                </Pressable>
              );
            })}
          </View>
        </Field>
        <Button title="Save" onPress={save} />

        {editing?.id && refs ? (
          <View style={{ gap: space(1), marginTop: space(1) }}>
            {editing.hidden ? (
              <Button title="Show in pickers again" variant="secondary" icon="eye-outline" onPress={() => setHidden(editing, 0)} />
            ) : (
              <>
                <Button title="Hide" variant="secondary" icon="eye-off-outline" onPress={() => setHidden(editing, 1)} />
                <Txt variant="small" tone="muted">
                  Hidden categories stay on the entries already filed under them but aren't offered for new ones.
                </Txt>
              </>
            )}

            {system ? (
              <Txt variant="small" tone="muted">
                Bills, EMIs or premiums are filed here when you mark them paid, so it can be hidden or renamed but not deleted.
              </Txt>
            ) : isEmpty(refs) ? (
              <Button title="Delete category" variant="ghost" onPress={() => deleteEmpty(editing)} />
            ) : moving ? (
              <View style={{ gap: space(1) }}>
                <Txt variant="bodyStrong">Move {refs.transactions === 1 ? '1 entry' : `${refs.transactions} entries`} to:</Txt>
                <Row gap={1} wrap>
                  {targets.map((t) => (
                    <Chip key={t.id} compact icon={t.icon as IconName} label={t.name} onPress={() => moveTo(editing, t)} />
                  ))}
                </Row>
                <Button title="Cancel" variant="ghost" size="sm" onPress={() => setMoving(false)} />
              </View>
            ) : (
              <Button
                title={refs.transactions ? `Move ${refs.transactions === 1 ? '1 entry' : `${refs.transactions} entries`} and delete…` : 'Move its budgets and rules, then delete…'}
                variant="ghost"
                onPress={() => setMoving(true)}
              />
            )}
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
