import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { todayYMD } from '@/domain/dates';
import { formatINR } from '@/domain/money';
import { ROLE_LABEL, applyFormat, buildPattern, tokenize, type TokenRole } from '@/domain/parsers/custom';
import { insert, remove } from '@/db/repo';
import { useTable } from '@/data/hooks';
import { captureText, smsPermissionGranted, testFormatOnInbox } from '@/services/capture';
import { Button, Card, Chip, Row, Txt } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { Field, Segmented, SwitchRow, TextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';
import { radius, space, useTheme } from '@/ui/theme';

const ROLES: TokenRole[] = ['amount', 'payee', 'date', 'account', 'card', 'ref'];
const ROLE_COLOR: Record<TokenRole, string> = { amount: '#E5484D', payee: '#4F46E5', date: '#0D9488', account: '#D97706', card: '#BE185D', ref: '#0284C7' };

/**
 * Teach the app a bank SMS format it doesn't understand: paste one real message, tap the words
 * that are the amount, payee, date… Only the resulting pattern is saved, never the message itself.
 */
export default function TeachSmsFormat() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ text?: string; id?: string }>();
  const existing = useTable('sms_formats').find((f) => f.id === params.id);
  const [sample, setSample] = useState(params.text ?? '');
  const [sender, setSender] = useState(existing?.sender ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [direction, setDirection] = useState<'debit' | 'credit'>(existing?.direction ?? 'debit');
  const [isCard, setIsCard] = useState(Boolean(existing?.isCard));
  const [role, setRole] = useState<TokenRole>('amount');
  const [tags, setTags] = useState<(TokenRole | null)[]>([]);
  const [testing, setTesting] = useState(false);

  const tokens = useMemo(() => tokenize(sample), [sample]);
  const tagList = tokens.map((_, i) => tags[i] ?? null);
  const built = useMemo(() => buildPattern(tokens, tagList), [tokens, tagList]);
  const format = { pattern: built.pattern, roles: JSON.stringify(built.roles), direction, isCard: (isCard ? 1 : 0) as 0 | 1, sender: sender.trim() || null, active: 1 as const };
  const preview = tokens.length && built.roles.includes('amount') ? applyFormat(format, sender, sample, todayYMD()) : null;

  const tap = (i: number) => {
    setTags((prev) => {
      const next = tokens.map((_, k) => prev[k] ?? null);
      // Amount, date, ref, account and card are single values: move the tag instead of adding another.
      if (role !== 'payee' && next[i] !== role) for (let k = 0; k < next.length; k++) if (next[k] === role) next[k] = null;
      next[i] = next[i] === role ? null : role;
      return next;
    });
  };

  const save = async () => {
    if (!preview) return toast('Tap at least the amount so the sample can be read', { tone: 'error' });
    await insert('sms_formats', { ...format, name: name.trim() || sender.trim() || 'My bank SMS', scope: 'household' });
    toast('Format saved. Matching SMS will now be captured.', { tone: 'success' });
    if (params.text) await captureText(sample, sender);
    router.back();
  };

  const test = async () => {
    if (!(await smsPermissionGranted())) return toast('Allow SMS access to test against your inbox', { tone: 'error' });
    setTesting(true);
    try {
      const r = await testFormatOnInbox(format);
      toast(r.matched ? `Matches ${r.matched} messages from the last 60 days, e.g. ${r.examples[0]}` : 'No other messages in your inbox match yet');
    } finally {
      setTesting(false);
    }
  };

  if (existing) {
    return (
      <Screen title={existing.name} back>
        <Card style={{ gap: 6 }}>
          <Txt>
            {existing.direction === 'debit' ? 'Money out' : 'Money in'}
            {existing.isCard ? ' · credit card' : ''} · sender {existing.sender ?? 'any'}
          </Txt>
          <Txt variant="small" tone="muted">
            Captures: {(JSON.parse(existing.roles) as TokenRole[]).map((r) => ROLE_LABEL[r]).join(', ')}
          </Txt>
          <Txt variant="small" tone="faint">
            To change it, delete and teach it again from a fresh message (the original SMS isn't stored).
          </Txt>
        </Card>
        <Button title="Delete format" variant="danger" onPress={() => remove('sms_formats', existing.id).then(() => router.back())} />
      </Screen>
    );
  }

  return (
    <Screen title="Teach an SMS format" subtitle="For banks the app doesn't recognise" back footer={<Button title="Save format" icon="checkmark" size="lg" onPress={save} disabled={!preview} />}>
      <TextField
        label="1. Paste one bank SMS"
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
      {preview ? <Button title="Test on my inbox" icon="flask-outline" variant="secondary" loading={testing} onPress={test} /> : null}
      <Txt variant="small" tone="faint" style={{ marginBottom: space(1) }}>
        Only a pattern is saved (and shared with family phones), not the message: the words you tap and every number become placeholders.
      </Txt>
    </Screen>
  );
}
