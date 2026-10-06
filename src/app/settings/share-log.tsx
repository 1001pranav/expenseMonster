import * as Clipboard from 'expo-clipboard';
import { Button, Card, EmptyState, Row, Txt } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { Screen } from '@/ui/components/Screen';
import { clearShareLog, useShareLog } from '@/services/shareLog';

/** What happened to recently shared screenshots, step by step, to copy into a bug report. */
export default function ShareLog() {
  const lines = useShareLog((s) => s.lines);
  return (
    <Screen title="Share log" subtitle="Steps each shared screenshot went through" back>
      <Txt tone="muted">Share a screenshot to ExpenseMonster, come back here, tap Copy and send it. No amounts or names are recorded.</Txt>
      <Row gap={1}>
        <Button
          title="Copy"
          icon="copy-outline"
          style={{ flex: 1 }}
          disabled={!lines.length}
          onPress={async () => {
            await Clipboard.setStringAsync(lines.join('\n'));
            toast('Copied', { tone: 'success' });
          }}
        />
        <Button title="Clear" variant="secondary" style={{ flex: 1 }} disabled={!lines.length} onPress={clearShareLog} />
      </Row>
      {lines.length ? (
        <Card>
          <Txt selectable style={{ fontSize: 12, fontFamily: 'monospace' }}>
            {[...lines].reverse().join('\n')}
          </Txt>
        </Card>
      ) : (
        <EmptyState icon="share-outline" title="Nothing yet" body="Share a screenshot from GPay, PhonePe or BHIM to ExpenseMonster, then open this again." />
      )}
    </Screen>
  );
}
