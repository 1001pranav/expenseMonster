import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { Category } from '@/domain/types';
import { insert, remove, update } from '@/db/repo';
import { MEMBER_COLORS } from '@/db/seed';
import { useCategoryMap, useTable } from '@/data/hooks';
import { Button, Card, IconCircle, ListRow, Section, Txt, type IconName } from '@/ui/components/core';
import { Sheet, toast } from '@/ui/components/feedback';
import { Field, Segmented, TextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

const ICONS: IconName[] = ['basket', 'restaurant', 'cafe', 'car', 'bus', 'medkit', 'school', 'film', 'airplane', 'shirt', 'paw', 'fitness', 'home', 'construct', 'gift', 'heart', 'book', 'game-controller', 'phone-portrait', 'flower'];

export default function Categories() {
  const { colors } = useTheme();
  const cats = useTable('categories');
  const rules = useTable('rules');
  const catMap = useCategoryMap();
  const [editing, setEditing] = useState<Partial<Category> | null>(null);

  const save = async () => {
    if (!editing?.name?.trim()) return toast('Name required', { tone: 'error' });
    const data = { name: editing.name.trim(), icon: editing.icon ?? 'pricetag', color: editing.color ?? MEMBER_COLORS[0], kind: editing.kind ?? 'expense', parentId: null, sortOrder: editing.sortOrder ?? 100, scope: 'household' as const };
    if (editing.id) await update('categories', editing.id, data);
    else await insert('categories', data);
    setEditing(null);
  };

  const list = (kind: Category['kind']) =>
    cats
      .filter((c) => c.kind === kind)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => <ListRow key={c.id} leading={<IconCircle name={c.icon as IconName} color={c.color} />} title={c.name} chevron onPress={() => setEditing(c)} />);

  return (
    <Screen title="Categories" back footer={<Button title="New category" icon="add" onPress={() => setEditing({ kind: 'expense', icon: 'pricetag', color: MEMBER_COLORS[0] })} />}>
      <Section title="Expense">
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {list('expense')}
        </Card>
      </Section>
      <Section title="Income">
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {list('income')}
        </Card>
      </Section>
      <Section title={`Learned rules · ${rules.length}`}>
        <Txt variant="small" tone="muted" style={{ paddingHorizontal: 4 }}>
          Created when you categorise a payee. Tap to forget one.
        </Txt>
        {rules.length ? (
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {rules.map((r) => (
              <ListRow key={r.id} icon="flash-outline" iconColor={colors.textMuted} title={r.pattern} subtitle={`→ ${catMap.get(r.categoryId)?.name ?? '?'}`} right={<Txt tone="primary">Forget</Txt>} onPress={() => remove('rules', r.id)} />
            ))}
          </Card>
        ) : null}
      </Section>

      <Sheet visible={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit category' : 'New category'}>
        <Segmented
          value={editing?.kind ?? 'expense'}
          onChange={(v) => setEditing((e) => ({ ...e, kind: v }))}
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
          ]}
        />
        <TextField label="Name" value={editing?.name ?? ''} onChangeText={(v) => setEditing((e) => ({ ...e, name: v }))} />
        <Field label="Icon">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(1) }}>
            {ICONS.map((i) => (
              <Pressable key={i} onPress={() => setEditing((e) => ({ ...e, icon: i }))} accessibilityRole="button" accessibilityLabel={i} style={{ opacity: editing?.icon === i ? 1 : 0.45 }}>
                <IconCircle name={i} color={editing?.color ?? colors.primary} size={40} />
              </Pressable>
            ))}
          </View>
        </Field>
        <Field label="Colour">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(1.25) }}>
            {MEMBER_COLORS.map((c) => (
              <Pressable key={c} onPress={() => setEditing((e) => ({ ...e, color: c }))} accessibilityRole="button" accessibilityLabel={`Colour ${c}`} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: editing?.color === c ? 3 : 0, borderColor: colors.text }} />
            ))}
          </View>
        </Field>
        <Button title="Save" onPress={save} />
        {editing?.id ? (
          <Button
            title="Delete category"
            variant="ghost"
            onPress={async () => {
              await remove('categories', editing.id!);
              setEditing(null);
            }}
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}
