import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { addMonths, monthEnd, monthStart, todayYMD } from '@/domain/dates';
import { createBackup, exportCsv, restoreBackup } from '@/services/sync';
import { Button, Card, Chip, Row, Section, Txt } from '@/ui/components/core';
import { Sheet, toast } from '@/ui/components/feedback';
import { TextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';
import { space } from '@/ui/theme';

export default function Backup() {
  const [mode, setMode] = useState<'backup' | 'restore' | null>(null);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [file, setFile] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState<'month' | 'last' | 'year'>('month');

  const run = async () => {
    setBusy(true);
    try {
      if (mode === 'backup') {
        if (pass !== pass2) throw new Error("Passphrases don't match");
        await createBackup(pass);
        toast('Backup created. Keep the passphrase safe; it cannot be recovered.', { tone: 'success' });
      } else if (file) {
        const r = await restoreBackup(file, pass);
        toast(`Restored: ${r.inserted} new, ${r.updated} updated`, { tone: 'success' });
      }
      setMode(null);
      setPass('');
      setPass2('');
    } catch (e) {
      toast((e as Error).message.includes('Wrong household') ? 'Wrong passphrase or damaged file' : (e as Error).message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const csv = async () => {
    const today = todayYMD();
    const [from, to] = range === 'month' ? [monthStart(today), today] : range === 'last' ? [monthStart(addMonths(today, -1)), monthEnd(addMonths(today, -1))] : [`${today.slice(0, 4)}-01-01`, today];
    const n = await exportCsv(from, to);
    toast(`${n} transactions exported`);
  };

  return (
    <Screen title="Backup & export" back>
      <Section title="Encrypted backup">
        <Card style={{ gap: space(1.5) }}>
          <Txt tone="muted">One file with everything on this phone, including private entries, locked with your passphrase. Save it to Google Drive or a computer. Without the passphrase the file can't be opened, by us or anyone else.</Txt>
          <Row gap={1}>
            <Button title="Create backup" icon="lock-closed" onPress={() => setMode('backup')} style={{ flex: 1 }} />
            <Button
              title="Restore"
              icon="refresh"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={async () => {
                const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: '*/*' });
                if (!r.canceled && r.assets[0]) {
                  setFile(r.assets[0].uri);
                  setMode('restore');
                }
              }}
            />
          </Row>
        </Card>
      </Section>
      <Section title="Spreadsheet (CSV)">
        <Card style={{ gap: space(1.5) }}>
          <Row gap={1}>
            <Chip label="This month" selected={range === 'month'} onPress={() => setRange('month')} />
            <Chip label="Last month" selected={range === 'last'} onPress={() => setRange('last')} />
            <Chip label="This year" selected={range === 'year'} onPress={() => setRange('year')} />
          </Row>
          <Button title="Export CSV" icon="document-text" variant="secondary" onPress={csv} />
          <Txt variant="small" tone="muted">
            A CSV is not encrypted. Share it carefully.
          </Txt>
        </Card>
      </Section>
      <Sheet visible={mode !== null} onClose={() => setMode(null)} title={mode === 'backup' ? 'Choose a passphrase' : 'Enter backup passphrase'}>
        <TextField label="Passphrase" value={pass} onChangeText={setPass} secure hint="8+ characters" autoCapitalize="none" />
        {mode === 'backup' ? <TextField label="Repeat passphrase" value={pass2} onChangeText={setPass2} secure autoCapitalize="none" /> : null}
        <Button title={mode === 'backup' ? 'Encrypt & share' : 'Restore'} loading={busy} onPress={run} />
        {mode === 'restore' ? (
          <Txt variant="small" tone="muted">
            Restoring merges with what's on this phone. Newer edits win.
          </Txt>
        ) : null}
      </Sheet>
    </Screen>
  );
}
