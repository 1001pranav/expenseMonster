import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { todayYMD } from '@/domain/dates';
import { formatINR } from '@/domain/money';
import { ROLE_LABEL, applyFormat, buildPattern, describeFormat, tokenize, type FormatStep, type TokenRole } from '@/domain/parsers/custom';
import { insert, remove, update } from '@/db/repo';
import { useTable } from '@/data/hooks';
import { captureText } from '@/services/capture';
import { Button, Card, Chip, Row, Txt } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { Field, Segmented, SwitchRow, TextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';
import { radius, space, useTheme } from '@/ui/theme';

const ROLES: TokenRole[] = ['amount', 'payee', 'date', 'account', 'card', 'ref'];
const ROLE_COLOR: Record<TokenRole, string> = { amount: '#E5484D', payee: '#4F46E5', date: '#0D9488', account: '#D97706', card: '#BE185D', ref: '#0284C7' };

/** "After “Txn” → Amount", one line per value the format picks out. */
function Steps({ steps }: { steps: FormatStep[] }) {
  return (
    <View style={{ gap: 6 }}>
      {steps.map((s, i) => (
        <Row key={i} gap={1}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ROLE_COLOR[s.role] }} />
          <Txt variant="small" style={{ flex: 1 }}>
            {s.after ? `After “${s.after}”` : 'At the start'}
            {s.skip ? ` and ${s.skip === 1 ? 'one changing word' : `${s.skip} changing words`}` : ''}
            <Txt variant="small" tone="muted">
              {'  →  '}
            </Txt>
            <Txt variant="bodyStrong">{ROLE_LABEL[s.role]}</Txt>
          </Txt>
        </Row>
      ))}
    </View>
  );
}

/**
 * Teach the app a bank SMS format it doesn't understand, or reads wrongly: paste one real message,
 * tap the words that are the amount, payee, date… Only the resulting pattern is saved, never the
 * message itself. Taught formats are tried before the built-in parser. Opened with `id` to edit one
 * (and optionally re-teach it from a new message).
 */
export default function TeachSmsFormat() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ text?: string; id?: string; sender?: string }>();
  const existing = useTable('sms_formats').find((f) => f.id === params.id);
  const [sample, setSample] = useState(params.text ?? '');
  const [sender, setSender] = useState(existing?.sender ?? params.sender ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [direction, setDirection] = useState<'debit' | 'credit'>(existing?.direction ?? 'debit');
  const [isCard, setIsCard] = useState(Boolean(existing?.isCard));
  const [active, setActive] = useState(existing ? Boolean(existing.active) : true);
  const [role, setRole] = useState<TokenRole>('amount');
  const [tags, setTags] = useState<(TokenRole | null)[]>([]);

  const tokens = useMemo(() => tokenize(sample), [sample]);
  const tagList = tokens.map((_, i) => tags[i] ?? null);
  const built = useMemo(() => buildPattern(tokens, tagList), [tokens, tagList]);
  const retaught = built.roles.includes('amount');
  const format = {
    pattern: retaught || !existing ? built.pattern : existing.pattern,
    roles: retaught || !existing ? JSON.stringify(built.roles) : existing.roles,
    direction,
    isCard: (isCard ? 1 : 0) as 0 | 1,
    sender: sender.trim() || null,
    active: 1 as const,
  };
  const preview = tokens.length && retaught ? applyFormat(format, sender, sample, todayYMD()) : null;
  const steps = describeFormat(format.pattern, format.roles);

  const tap = (i: number) => {
    setTags((prev) => {
      const next = tokens.map((_, k) => prev[k] ?? null);
      // Amount, date, ref, account and card are single values: move the tag instead of adding another.
      if (role !== 'payee' && next[i] !== role) for (let k = 0; k < next.length; k++) if (next[k] === role) next[k] = null;
      next[i] = next[i] === role ? null : role;
      return next;
    });
  };

  const canSave = existing ? !tokens.length || Boolean(preview) : Boolean(preview);

  const save = async () => {
    if (!canSave) return toast('Tap at least the amount so the sample can be read', { tone: 'error' });
    const data = { ...format, active: (active ? 1 : 0) as 0 | 1, name: name.trim() || sender.trim() || 'My bank SMS' };
    if (existing) await update('sms_formats', existing.id, data);
    else await insert('sms_formats', { ...data, scope: 'household' });
    toast(existing ? 'Format updated' : 'Format saved. Matching SMS will now be read this way.', { tone: 'success' });
    if (params.text && preview) await captureText(sample, sender);
    router.back();
  };

  return (
    <Screen
      title={existing ? existing.name : 'Teach an SMS format'}
      subtitle={existing ? 'Taught format' : 'For messages the app misses or reads wrongly'}
      back
      footer={<Button title={existing ? 'Save changes' : 'Save format'} icon="checkmark" size="lg" onPress={save} disabled={!canSave} />}
    >
      {existing ? (
        <Card style={{ gap: space(1) }}>
          <Txt variant="bodyStrong">What it looks for</Txt>
          {steps.length ? <Steps steps={steps} /> : <Txt tone="muted">Nothing readable in this format; re-teach it below.</Txt>}
          <Txt variant="small" tone="faint">
            The original SMS isn't stored. To change which words are read, paste a new message of this kind below.
          </Txt>
        </Card>
      ) : null}
      <TextField
        label={existing ? 'Re-teach from a new message (optional)' : '1. Paste one bank SMS'}
        value={sample}
        onChangeText={(v) => {
          setSample(v);
          setTags([]);
        }}
        multiline
        placeholder="e.g. MyCoop: Rs.1,250.00 withdrawn from SB XX4321 towards RAMESH KIRANA on 12-09-26"
      />
      <Row gap={1.5} style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <TextField label="Sender (optional)" value={sender} onChangeText={setSender} placeholder="MYCOOP" autoCapitalize="characters" hint="from VM-MYCOOP" />
        </View>
      </Row>
      <Segmented
        value={direction}
        onChange={setDirection}
        options={[
          { value: 'debit', label: 'Money out' },
          { value: 'credit', label: 'Money in' },
        ]}
      />
      <SwitchRow icon="card-outline" label="This is a credit card message" value={isCard} onChange={setIsCard} />

      {tokens.length ? (
        <>
          <Field label="2. Pick what you're marking, then tap those words">
            <Row gap={1} wrap>
              {ROLES.filter((r) => (isCard ? r !== 'account' : r !== 'card')).map((r) => (
                <Chip key={r} label={ROLE_LABEL[r]} color={ROLE_COLOR[r]} selected={role === r} onPress={() => setRole(r)} compact />
              ))}
            </Row>
          </Field>
          <Card style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {tokens.map((t, i) => {
              const tag = tagList[i];
              return (
                <Pressable
                  key={`${i}-${t}`}
                  onPress={() => tap(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`${t}${tag ? `, marked as ${ROLE_LABEL[tag]}` : ''}`}
                  style={{ paddingHorizontal: 8, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: tag ? ROLE_COLOR[tag] : colors.surfaceAlt }}
                >
                  <Txt variant="small" style={{ color: tag ? '#fff' : colors.text }}>
                    {t}
                  </Txt>
                  {tag ? (
                    <Txt variant="caption" style={{ color: '#fff', opacity: 0.85 }}>
                      {ROLE_LABEL[tag]}
                    </Txt>
                  ) : null}
                </Pressable>
              );
            })}
          </Card>
          <Txt variant="small" tone="faint">
            Words with numbers that you don't tap are treated as "changes every time".
          </Txt>
        </>
      ) : null}

      {tokens.length ? (
        <Card tone="alt" style={{ gap: 4 }}>
          <Txt variant="bodyStrong">3. Preview</Txt>
          {retaught ? <Steps steps={steps} /> : null}
          {preview ? (
            <Txt>
              {direction === 'debit' ? 'Paid' : 'Received'} {formatINR(preview.amount)}
              {preview.payee ? ` · ${preview.payee}` : ''} · {preview.date}
              {preview.accountLast4 ? ` · a/c ••${preview.accountLast4}` : ''}
              {preview.cardLast4 ? ` · card ••${preview.cardLast4}` : ''}
              {preview.ref ? ` · ref ${preview.ref}` : ''}
            </Txt>
          ) : (
            <Txt tone="muted">Tap the amount to see what will be captured.</Txt>
          )}
        </Card>
      ) : null}

      <TextField label="Name (optional)" value={name} onChangeText={setName} placeholder="MyCoop debit" />
      {existing ? <SwitchRow icon="power-outline" label="Use this format" value={active} onChange={setActive} /> : null}
      <Txt variant="small" tone="faint" style={{ marginBottom: space(1) }}>
        Only a pattern is saved (and shared with family phones), not the message: the words you tap and every number become placeholders.
      </Txt>
      {existing ? <Button title="Delete format" variant="danger" onPress={() => remove('sms_formats', existing.id).then(() => router.back())} /> : null}
    </Screen>
  );
}
