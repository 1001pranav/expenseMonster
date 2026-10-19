import * as DocumentPicker from 'expo-document-picker';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { formatDay } from '@/domain/dates';
import type { CasStatement, Word } from '@/domain/cas';
import { byIsin, matchCas } from '@/domain/casImport';
import { formatQuantity, summarizeHoldings } from '@/domain/investments';
import { parseAmount, type Paise } from '@/domain/money';
import { applyCasImport, type CasAction } from '@/data/investments';
import { useMembers, useSelfId, useTable } from '@/data/hooks';
import { discardStatement, readStatement, shareAnonymised } from '@/services/cas';
import { Button, Card, Chip, Pill, Row, Txt, useMoneyText } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { ChipSelect, TextField } from '@/ui/components/forms';
import { Screen, goBack } from '@/ui/components/Screen';
import { space } from '@/ui/theme';
import { casPdfAvailable, CasPdfError } from '../../../modules/cas-pdf';

type Choice = 'price' | 'link' | 'add' | 'skip';

/**
 * Import a CDSL or NSDL consolidated account statement: every share and fund one person holds, as on
 * the statement date. Read on the phone; nothing is saved until the user has gone through the list.
 */
export default function ImportCas() {
  const money = useMoneyText();
  const members = useMembers();
  const selfId = useSelfId();
  const holdings = useTable('holdings');
  const trades = useTable('trades');
  const txns = useTable('transactions');

  const [file, setFile] = useState<{ uri: string; name: string } | null>(null);
  const [password, setPassword] = useState('');
  const [owner, setOwner] = useState<string>(selfId || members[0]?.id || '');
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<{ statement: CasStatement; words: Word[] } | null>(null);
  const [choices, setChoices] = useState<Record<string, { choice: Choice; linkTo?: string; cost?: string }>>({});
  const [saving, setSaving] = useState(false);

  const matches = useMemo(() => {
    if (!result) return [];
    return matchCas(byIsin(result.statement.rows), holdings, summarizeHoldings(holdings, trades, txns), owner || null);
  }, [result, holdings, trades, txns, owner]);

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: 'application/pdf' });
    if (res.canceled || !res.assets[0]) return;
    if (file) discardStatement(file.uri);
    setFile({ uri: res.assets[0].uri, name: res.assets[0].name });
    setResult(null);
  };

  const read = async () => {
    if (!file) return;
    setReading(true);
    try {
      const r = await readStatement(file.uri, password);
      setResult(r);
      setPassword('');
      // Read: the copy and the password are no longer needed.
      discardStatement(file.uri);
      setFile(null);
      if (!r.statement.rows.length) toast("No holdings could be read from this statement. You can share an anonymised copy so the reader can learn its layout.", { tone: 'error' });
    } catch (e) {
      toast(e instanceof CasPdfError ? e.message : 'The statement could not be read.', { tone: 'error' });
    } finally {
      setReading(false);
    }
  };

  const choiceOf = (isin: string, matched: boolean) => choices[isin]?.choice ?? (matched ? 'price' : 'skip');
  const setChoice = (isin: string, patch: { choice?: Choice; linkTo?: string; cost?: string }) =>
    setChoices((c) => {
      const matched = matches.some((m) => m.line.isin === isin && m.holding);
      return { ...c, [isin]: { ...c[isin], ...patch, choice: patch.choice ?? choiceOf(isin, matched) } };
    });

  const apply = async () => {
    if (!result?.statement.asOf) return toast("The statement date couldn't be read, so its prices can't be dated.", { tone: 'error' });
    const items: { line: (typeof matches)[number]['line']; action: CasAction }[] = [];
    for (const m of matches) {
      const c = choiceOf(m.line.isin, Boolean(m.holding));
      if (c === 'price' && m.holding) items.push({ line: m.line, action: { kind: 'price', holdingId: m.holding.id } });
      else if (c === 'link') {
        const to = choices[m.line.isin]?.linkTo;
        if (!to) return toast(`Pick which holding ${m.line.name || m.line.isin} is`, { tone: 'error' });
        items.push({ line: m.line, action: { kind: 'link', holdingId: to } });
      } else if (c === 'add') {
        const cost = parseAmount(choices[m.line.isin]?.cost ?? '') ?? (m.line.invested as Paise | null);
        if (!cost) return toast(`Enter what ${m.line.name || m.line.isin} cost, or use today's value`, { tone: 'error' });
        items.push({ line: m.line, action: { kind: 'add', cost } });
      }
    }
    if (!items.length) return toast('Nothing chosen to import', { tone: 'error' });
    setSaving(true);
    try {
      const r = await applyCasImport({ asOf: result.statement.asOf, owner: owner || null, scope: 'household' }, items);
      toast(`${r.priced} price${r.priced === 1 ? '' : 's'} updated, ${r.added} added`, { tone: 'success' });
      goBack();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (!casPdfAvailable()) {
    return (
      <Screen title="Import statement" back>
        <Card style={{ gap: space(1) }}>
          <Txt variant="bodyStrong">Needs the latest app</Txt>
          <Txt tone="muted">Reading CDSL and NSDL statements was added after this build of the app. Install the latest version, then try again.</Txt>
        </Card>
      </Screen>
    );
  }

  const s = result?.statement;
  return (
    <Screen
      title="Import statement"
      subtitle="CDSL or NSDL consolidated account statement"
      back
      footer={s && matches.length ? <Button title="Apply" icon="checkmark" size="lg" loading={saving} onPress={apply} /> : undefined}
    >
      {!s ? (
        <Card style={{ gap: space(1) }}>
          <Txt tone="muted">
            The monthly statement CDSL or NSDL e-mails you (or download one from their website) lists every share and mutual fund you hold, with its value. It is read on this phone; the file and its password are not kept.
          </Txt>
          <Button title={file ? file.name : 'Choose the PDF'} icon="document-outline" variant="secondary" onPress={pick} />
          <TextField label="Password" value={password} onChangeText={(t) => setPassword(t.toUpperCase())} secure autoCapitalize="characters" placeholder="Usually your PAN, in capitals" />
          {members.length > 1 ? <ChipSelect label="Whose statement" value={owner} onChange={(v) => setOwner(v ?? '')} options={members.map((m) => ({ value: m.id, label: m.id === selfId ? 'Mine' : m.name, color: m.color }))} /> : null}
          <Button title="Read statement" icon="scan-outline" loading={reading} onPress={read} disabled={!file} />
        </Card>
      ) : (
        <>
          <Card tone="alt" style={{ gap: 4 }}>
            <Txt variant="bodyStrong">
              {s.depository ?? 'Depository'} statement{s.asOf ? `, holdings as on ${formatDay(s.asOf, { year: true })}` : ''}
            </Txt>
            <Txt variant="small" tone="muted">
              {s.rows.length} holding{s.rows.length === 1 ? '' : 's'} read, each checked: quantity × price = value.
              {s.unreadable ? ` ${s.unreadable} row${s.unreadable === 1 ? '' : 's'} didn't add up and ${s.unreadable === 1 ? 'was' : 'were'} left out.` : ''}
            </Txt>
            {!s.asOf ? (
              <Txt variant="small" tone="warn">
                The statement date couldn't be found, so nothing can be imported from it.
              </Txt>
            ) : null}
            {s.unreadable || !s.rows.length ? (
              <Button
                title="Share an anonymised copy to improve the reader"
                size="sm"
                variant="ghost"
                onPress={() => shareAnonymised(result.words).catch((e) => toast((e as Error).message, { tone: 'error' }))}
              />
            ) : null}
          </Card>

          {matches.map((m) => {
            const c = choiceOf(m.line.isin, Boolean(m.holding));
            const gap = m.holding && m.appQuantity !== null && m.appQuantity !== m.line.quantity;
            const unit = m.line.kind === 'equity' ? 'share' : 'unit';
            return (
              <Card key={m.line.isin} style={{ gap: space(1) }}>
                <Row gap={1}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="bodyStrong" numberOfLines={2}>
                      {m.line.name || m.line.isin}
                    </Txt>
                    <Txt variant="small" tone="muted">
                      {m.line.isin} · {formatQuantity(m.line.quantity, unit)} × {money(m.line.price)} = {money(m.line.value, { decimals: 'never' })}
                    </Txt>
                  </View>
                  <Pill label={m.holding ? 'In the app' : 'New'} tone={m.holding ? 'income' : 'info'} />
                </Row>
                {gap ? (
                  <Txt variant="small" tone="warn">
                    The app records {formatQuantity(m.appQuantity!, unit)}. Record the missing purchase or sale on the holding: the statement doesn't say what it cost.
                  </Txt>
                ) : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {m.holding ? <Chip label="Update price" selected={c === 'price'} onPress={() => setChoice(m.line.isin, { choice: 'price' })} /> : null}
                  {!m.holding ? <Chip label="Add" selected={c === 'add'} onPress={() => setChoice(m.line.isin, { choice: 'add', cost: choices[m.line.isin]?.cost ?? (m.line.invested ? String(m.line.invested / 100) : '') })} /> : null}
                  {!m.holding && m.linkable.length ? <Chip label="It's one I have" selected={c === 'link'} onPress={() => setChoice(m.line.isin, { choice: 'link' })} /> : null}
                  <Chip label="Skip" selected={c === 'skip'} onPress={() => setChoice(m.line.isin, { choice: 'skip' })} />
                </View>
                {c === 'link' ? (
                  <ChipSelect label="Which one" value={choices[m.line.isin]?.linkTo ?? null} onChange={(v) => setChoice(m.line.isin, { linkTo: v ?? undefined })} options={m.linkable.map((h) => ({ value: h.id, label: h.name }))} />
                ) : null}
                {c === 'add' ? (
                  <>
                    <TextField
                      label="What it cost in total"
                      value={choices[m.line.isin]?.cost ?? ''}
                      onChangeText={(t) => setChoice(m.line.isin, { cost: t })}
                      keyboardType="decimal-pad"
                      placeholder="₹"
                      hint={m.line.invested ? 'From the statement' : 'From your contract notes or broker'}
                    />
                    <Button title="Use today's value as the cost" size="sm" variant="ghost" onPress={() => setChoice(m.line.isin, { cost: String(m.line.value / 100) })} />
                    <Txt variant="caption" tone="faint">
                      With today's value as the cost, gains are counted from today, not from when it was bought.
                    </Txt>
                  </>
                ) : null}
              </Card>
            );
          })}
          <Button
            title="Read another statement"
            variant="ghost"
            onPress={() => {
              setResult(null);
              setChoices({});
            }}
          />
        </>
      )}
      {result ? null : (
        <Txt variant="caption" tone="faint" style={{ paddingHorizontal: 2 }}>
          Values are as on the statement date. CDSL and NSDL send a statement each month you have transactions, otherwise every six months.
        </Txt>
      )}
    </Screen>
  );
}
