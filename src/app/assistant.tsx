import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import type { ChatMessage } from '@/domain/assistant/answer';
import { ask, friendly, packState } from '@/services/assistant';
import { Button, Card, Chip, IconButton, Pill, Row, Txt } from '@/ui/components/core';
import { TextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';
import { radius, space, useTheme } from '@/ui/theme';

interface Turn {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  verified?: boolean;
  toolsUsed?: string[];
}

/** Where to see the full picture behind each tool. */
const TOOL_LINKS: Record<string, { label: string; href: string }> = {
  month_summary: { label: 'Insights', href: '/insights' },
  spending_by_category: { label: 'Insights', href: '/insights' },
  financial_health: { label: 'Insights', href: '/insights' },
  budget_status: { label: 'Budgets', href: '/budgets' },
  upcoming_dues: { label: 'Dues', href: '/dues' },
  loans: { label: 'Dues', href: '/dues' },
  credit_cards: { label: 'Dues', href: '/dues' },
  find_transactions: { label: 'Activity', href: '/activity' },
};

const SUGGESTIONS = ['How is my financial health?', 'Where did my money go this month?', 'What is due in the next two weeks?', 'How much did we spend on food last month?', 'How much is left on my loans?'];

export default function Assistant() {
  const { colors } = useTheme();
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const sources = useRef<string[]>([]);
  const abort = useRef<AbortController | null>(null);
  const list = useRef<FlatList<Turn>>(null);
  const nextId = useRef(0);

  useFocusEffect(
    useCallback(() => {
      packState().then((s) => setInstalled(s.kind === 'installed'));
    }, []),
  );

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setInput('');
    const history: ChatMessage[] = turns.map((t) => ({ role: t.role, content: t.text }));
    setTurns((t) => [...t, { id: nextId.current++, role: 'user', text: question }]);
    setBusy(true);
    abort.current = new AbortController();
    try {
      const a = await ask(question, history, sources.current, abort.current.signal);
      // Only verified figures may be repeated in later turns.
      if (a.verified) sources.current = [...sources.current, ...a.sources].slice(-12);
      setTurns((t) => [...t, { id: nextId.current++, role: 'assistant', text: a.text, verified: a.verified, toolsUsed: a.toolsUsed }]);
    } catch (e) {
      setTurns((t) => [...t, { id: nextId.current++, role: 'assistant', text: friendly(e), verified: false }]);
    } finally {
      abort.current = null;
      setBusy(false);
      setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  if (installed === false) {
    return (
      <Screen title="Assistant" back>
        <Card style={{ gap: space(1.25) }}>
          <Txt variant="bodyStrong">Not installed</Txt>
          <Txt tone="muted">The assistant is an optional download that runs entirely on this phone.</Txt>
          <Button title="Set up assistant" icon="download-outline" onPress={() => router.replace('/settings/assistant')} />
        </Card>
      </Screen>
    );
  }

  const bubble = ({ item }: { item: Turn }) => {
    const mine = item.role === 'user';
    const links = [...new Map((item.toolsUsed ?? []).filter((t) => TOOL_LINKS[t]).map((t) => [TOOL_LINKS[t].href, TOOL_LINKS[t]])).values()];
    return (
      <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 6 }}>
        <View style={{ maxWidth: '88%', padding: space(1.5), borderRadius: radius.lg, backgroundColor: mine ? colors.primary : colors.surface }}>
          <Txt selectable style={mine ? { color: colors.primaryText } : undefined}>
            {item.text}
          </Txt>
        </View>
        {!mine ? (
          <Row gap={0.75} wrap>
            {item.verified ? <Pill label="Figures checked" tone="income" /> : item.toolsUsed?.length ? <Pill label="Shown from your data" tone="warn" /> : null}
            {links.map((l) => (
              <Chip key={l.href} compact label={l.label} icon="open-outline" onPress={() => router.push(l.href as never)} />
            ))}
          </Row>
        ) : null}
      </View>
    );
  };

  return (
    <Screen
      title="Assistant"
      subtitle="On this phone · reads your data, never changes it"
      back
      scroll={false}
      footer={
        <Row gap={1} style={{ alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <TextField value={input} onChangeText={setInput} placeholder="Ask about your money" maxLength={300} />
          </View>
          {busy ? <IconButton name="stop-circle" label="Stop" onPress={() => abort.current?.abort()} size={30} color={colors.expense} /> : <IconButton name="send" label="Send" onPress={() => send(input)} size={26} color={colors.primary} />}
        </Row>
      }
    >
      <FlatList
        ref={list}
        data={turns}
        keyExtractor={(t) => String(t.id)}
        renderItem={bubble}
        contentContainerStyle={{ padding: space(2), gap: space(1.5) }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={{ gap: space(1.5) }}>
            <Txt tone="muted">Try asking:</Txt>
            <Row gap={1} wrap>
              {SUGGESTIONS.map((s) => (
                <Chip key={s} label={s} onPress={() => send(s)} />
              ))}
            </Row>
            <Txt variant="small" tone="faint">
              Not financial advice. For investments, insurance or tax, talk to a SEBI-registered adviser.
            </Txt>
          </View>
        }
        ListFooterComponent={
          busy ? (
            <Row gap={1} style={{ paddingTop: space(1) }}>
              <ActivityIndicator color={colors.primary} />
              <Txt tone="muted">Thinking… the first answer takes longer while the model loads.</Txt>
            </Row>
          ) : null
        }
      />
    </Screen>
  );
}
