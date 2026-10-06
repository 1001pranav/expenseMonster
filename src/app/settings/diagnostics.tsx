import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Button, Card, Chip, EmptyState, Row, Txt } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { Screen } from '@/ui/components/Screen';
import { clearDiagnostics, diagnosticsText, shareDiagnostics, useDiagnostics } from '@/services/diagnostics';

type Filter = 'all' | 'problems';

/** Errors, warnings and shared-screenshot steps, to send when something goes wrong. */
export default function Diagnostics() {
  const lines = useDiagnostics((s) => s.lines);
  const [filter, setFilter] = useState<Filter>('all');
  const shown = (filter === 'all' ? lines : lines.filter((l) => / (?:WARN|ERROR) /.test(l))).slice().reverse();
  const problems = lines.filter((l) => / (?:WARN|ERROR) /.test(l)).length;

  return (
    <Screen
      title="Error log"
      subtitle="Errors, warnings and shared-screenshot steps"
      back
      footer={
        <Row gap={1}>
          <Button
            title="Share"
            icon="share-social-outline"
            size="lg"
            style={{ flex: 1 }}
            disabled={!lines.length}
            onPress={() => shareDiagnostics().catch((e: Error) => toast(e.message, { tone: 'error' }))}
          />
          <Button
            title="Copy"
            icon="copy-outline"
            size="lg"
            variant="secondary"
            disabled={!lines.length}
            onPress={async () => {
              await Clipboard.setStringAsync(diagnosticsText());
              toast('Copied', { tone: 'success' });
            }}
          />
        </Row>
      }
    >
      <Txt tone="muted">Kept only on this phone until you tap Share. It records what the app did and any errors, never amounts or names.</Txt>
      <Row gap={1} wrap>
        <Chip label={`All (${lines.length})`} selected={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label={`Errors & warnings (${problems})`} selected={filter === 'problems'} onPress={() => setFilter('problems')} />
        <Chip label="Clear" icon="trash-outline" onPress={clearDiagnostics} />
      </Row>
      {shown.length ? (
        <Card>
          <Txt selectable style={{ fontSize: 11, fontFamily: 'monospace' }}>
            {shown.join('\n')}
          </Txt>
        </Card>
      ) : (
        <EmptyState icon="checkmark-circle-outline" title={lines.length ? 'No errors or warnings' : 'Nothing logged yet'} body="Share a screenshot to ExpenseMonster or use the app, then come back here." />
      )}
    </Screen>
  );
}
