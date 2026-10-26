import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { formatDay } from '@/domain/dates';
import { searchSchemes, type SchemeNav } from '@/domain/navFile';
import { formatINR } from '@/domain/money';
import { loadSchemes } from '@/services/navPrices';
import { space, useTheme } from '../theme';
import { Txt } from './core';
import { Sheet } from './feedback';
import { TextField } from './forms';

/**
 * Find a mutual fund scheme in AMFI's NAV list by words of its name, to link a holding to its daily
 * price. The list is downloaded when the sheet opens (services/navPrices.ts), only then.
 */
export function SchemePicker({ visible, onClose, onPick, initialQuery = '' }: { visible: boolean; onClose: () => void; onPick: (s: SchemeNav) => void; initialQuery?: string }) {
  const { colors } = useTheme();
  const [query, setQuery] = useState(initialQuery);
  const [schemes, setSchemes] = useState<SchemeNav[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || schemes) return;
    let live = true;
    loadSchemes()
      .then((s) => live && setSchemes(s))
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, [visible, schemes]);

  const results = schemes ? searchSchemes(schemes, query) : [];

  return (
    <Sheet visible={visible} onClose={onClose} title="Find the scheme">
      <TextField label="Scheme name" value={query} onChangeText={setQuery} placeholder="e.g. parag flexi direct growth" autoFocus icon="search" />
      <Txt variant="small" tone="muted">
        Pick the exact plan and option on your statement (Direct or Regular, Growth or IDCW): each has its own price.
      </Txt>
      {error ? (
        <Txt tone="expense">{error}</Txt>
      ) : !schemes ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1) }}>
          <ActivityIndicator color={colors.primary} />
          <Txt tone="muted">Getting the scheme list from AMFI…</Txt>
        </View>
      ) : query.trim().length > 1 && !results.length ? (
        <Txt tone="muted">No scheme has all those words.</Txt>
      ) : null}
      {results.map((s) => (
        <Pressable
          key={s.code}
          accessibilityRole="button"
          onPress={() => {
            onPick(s);
            onClose();
          }}
          style={({ pressed }) => ({ paddingVertical: space(1), borderBottomWidth: 1, borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 })}
        >
          <Txt>{s.name}</Txt>
          <Txt variant="small" tone="muted">
            Code {s.code} · NAV {formatINR(s.nav)} on {formatDay(s.date)}
          </Txt>
        </Pressable>
      ))}
    </Sheet>
  );
}
