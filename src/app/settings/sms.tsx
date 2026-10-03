import { router } from 'expo-router';
import { useTable } from '@/data/hooks';
import { Button, Card, ListRow, Section, Txt } from '@/ui/components/core';
import { Screen } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

/**
 * The app never reads the SMS inbox and asks for no SMS permission. Bank messages are captured
 * only when the user pastes one, and taught formats help the parser recognise them.
 */
export default function SmsSettings() {
  const { colors } = useTheme();
  const formats = useTable('sms_formats');

  return (
    <Screen title="Bank SMS" back>
      <Card>
        <Txt tone="muted">ExpenseMonster doesn't read your messages. To record a bank SMS, copy it in your Messages app and paste it here.</Txt>
      </Card>

      <Section title="Paste a message" style={{ marginTop: space(1) }}>
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <ListRow icon="clipboard-outline" iconColor={colors.info} title="Paste a bank SMS" subtitle="Works without any permission" chevron onPress={() => router.push('/paste-sms')} />
        </Card>
      </Section>

      <Section title="Your bank's formats" action="Teach new" onAction={() => router.push('/settings/sms-format')}>
        <Txt variant="small" tone="muted" style={{ paddingHorizontal: 4 }}>
          If your bank's messages aren't recognised, teach the format once from a sample. Formats are shared with family phones when you sync.
        </Txt>
        {formats.length ? (
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {formats.map((f) => (
              <ListRow
                key={f.id}
                icon={f.direction === 'debit' ? 'arrow-up' : 'arrow-down'}
                iconColor={f.direction === 'debit' ? colors.expense : colors.income}
                title={f.name}
                subtitle={`${f.sender ? `From ${f.sender}` : 'Any sender'}${f.isCard ? ' · credit card' : ''}`}
                chevron
                onPress={() => router.push({ pathname: '/settings/sms-format', params: { id: f.id } })}
              />
            ))}
          </Card>
        ) : (
          <Button title="Teach a format" icon="school-outline" variant="secondary" onPress={() => router.push('/settings/sms-format')} />
        )}
      </Section>
    </Screen>
  );
}
