import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { formatDay, isoToYMD, type YMD } from '@/domain/dates';
import type { HoldDecision, SyncHold } from '@/domain/types';
import { asideRecords, type AsideRecord } from '@/db/repo';
import { useStore } from '@/db/store';
import { useTable, useToday } from '@/data/hooks';
import {
  claimHead,
  decideEntry,
  decideRule,
  deleteOwnDiscarded,
  handOverHead,
  HOUSEHOLD_ID,
  holdEdits,
  invalidRow,
  ownHeld,
  removeRule,
  separateFromHousehold,
  type OwnHeld,
} from '@/services/holds';
import { Button, Card, EmptyState, Pill, Row, Section, Txt } from '@/ui/components/core';
import { Sheet, toast } from '@/ui/components/feedback';
import { ChipSelect, DateField, SwitchRow } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';
import { keyRecipients, keyStatus, removedPhones, removePhone, type KeyStatus } from '@/services/rotation';
import { TABLE_LABEL, titleOf } from '@/ui/syncLabels';
import { space, useTheme } from '@/ui/theme';

const DECISION: Record<HoldDecision, { label: string; tone: 'warn' | 'income' | 'expense' }> = {
  hold: { label: 'On hold', tone: 'warn' },
  merge: { label: 'Merged', tone: 'income' },
  discard: { label: 'Discarded', tone: 'expense' },
};

/**
 * Household head: who it is, and reviewing edits other phones sent (services/holds.ts). Everyone
 * sees what is held; only the head decides.
 */
export default function Review() {
  const { colors } = useTheme();
  const today = useToday();
  const version = useStore((s) => s.version);
  const selfId = useStore((s) => s.identity.deviceId);
  const devices = useTable('devices');
  const holds = useTable('sync_holds');
  const headId = useTable('household').find((h) => h.id === HOUSEHOLD_ID)?.headDeviceId ?? null;
  const head = headId === selfId;

  const [aside, setAside] = useState<AsideRecord[]>([]);
  const [own, setOwn] = useState<OwnHeld[]>([]);
  const [busy, setBusy] = useState(false);
  const [holdPhone, setHoldPhone] = useState<string | null>(null);
  const [oneDay, setOneDay] = useState(false);
  const [day, setDay] = useState<YMD>(today);
  const [handTo, setHandTo] = useState<string | null>(null);
  const [confirmSeparate, setConfirmSeparate] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [key, setKey] = useState<KeyStatus>('current');

  const reload = useCallback(() => {
    asideRecords().then(setAside);
    ownHeld().then(setOwn);
    keyStatus().then(setKey);
  }, []);
  useEffect(() => {
    reload();
  }, [reload, version]);

  const nameOf = useCallback((id: string | null) => (id === selfId ? 'This phone' : (devices.find((d) => d.id === id)?.name ?? 'Another phone')), [devices, selfId]);
  const removed = removedPhones(useTable('household').find((h) => h.id === HOUSEHOLD_ID));
  const others = devices.filter((d) => d.id !== selfId && !d.deletedAt && !removed.includes(d.id)).map((d) => ({ value: d.id, label: d.name }));

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast(done, { tone: 'success' });
      reload();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const describe = (h: SyncHold) => {
    const who = h.holdDevice ? `Edits from ${nameOf(h.holdDevice)}` : 'Edits from every phone';
    return h.since ? `${who} on ${formatDay(isoToYMD(h.since))}` : `All ${who.charAt(0).toLowerCase()}${who.slice(1)}`;
  };
  const rules = holds.filter((h) => !h.recordId);
  const entryRule = (tbl: string, id: string) => holds.find((h) => h.tbl === tbl && h.recordId === id);
  const byPhone = useMemo(() => {
    const groups = new Map<string, AsideRecord[]>();
    for (const a of aside) groups.set(a.row.deviceId, [...(groups.get(a.row.deviceId) ?? []), a]);
    return [...groups.entries()];
  }, [aside]);
  const discarded = own.filter((o) => o.decision === 'discard').length;

  return (
    <Screen title="Household head" subtitle="Review edits from family phones" back>
      <Card style={{ gap: space(1) }}>
        <Txt variant="small" tone="muted">
          Household head
        </Txt>
        <Txt variant="h3">{headId ? nameOf(headId) : 'Nobody yet'}</Txt>
        <Txt variant="small" tone="muted">
          The head can hold back edits from a phone, a day or a single entry when something looks wrong, then merge them for everyone or discard them. Nothing is deleted.
        </Txt>
        {!headId ? <Button title="Make this phone the head" icon="shield-checkmark" onPress={() => act(claimHead, 'This phone is now the household head')} loading={busy} /> : null}
        {head && others.length ? (
          <>
            <ChipSelect label="Hand over to" value={handTo} onChange={setHandTo} allowNone options={others} />
            {handTo ? <Button title={`Make ${nameOf(handTo)} the head`} variant="secondary" onPress={() => act(() => handOverHead(handTo), 'Handed over')} loading={busy} /> : null}
          </>
        ) : null}
      </Card>

      {key === 'removed' ? (
        <Card style={{ gap: space(1), borderWidth: 1.5, borderColor: colors.expense }}>
          <Txt variant="bodyStrong">The household head removed this phone</Txt>
          <Txt variant="small" tone="muted">
            Everything already on this phone stays here, but it no longer receives the family's entries and cloud sync is off. Separate to keep using it on its own, or ask the head to pair it again by QR.
          </Txt>
          <Button title="Separate this phone" variant="secondary" onPress={() => setConfirmSeparate(true)} />
        </Card>
      ) : key === 'waiting' && !head ? (
        <Card style={{ gap: space(1), borderWidth: 1.5, borderColor: colors.warn }}>
          <Txt variant="bodyStrong">The family key changed</Txt>
          <Txt variant="small" tone="muted">
            The head removed a phone and gave the others a new key. This phone hasn't received one yet: it arrives on the next sync. If it doesn't, pair this phone with the head again by QR.
          </Txt>
        </Card>
      ) : key === 'waiting' && head ? (
        <Card style={{ gap: space(1), borderWidth: 1.5, borderColor: colors.warn }}>
          <Txt variant="bodyStrong">Removing a phone is not finished</Txt>
          <Txt variant="small" tone="muted">
            The new key goes to the family's phones on the next successful sync. Until then everyone, the removed phone included, stays on the old key.
          </Txt>
        </Card>
      ) : null}

      {own.length ? (
        <Card style={{ gap: space(1), borderWidth: 1.5, borderColor: discarded ? colors.expense : colors.warn }}>
          <Txt variant="bodyStrong">{discarded ? `The head didn't accept ${discarded} of your entries` : `${own.length} of your entries are on hold`}</Txt>
          <Txt variant="small" tone="muted">
            {discarded
              ? "They stay on this phone but won't appear on the others. Delete them, or separate this phone from the household and keep all your data on it."
              : 'The household head is reviewing them. They stay on this phone; the other phones see them once the head merges them.'}
          </Txt>
          {own.map((o) => (
            <Row key={`${o.table}:${o.row.id}`} gap={1}>
              <Txt variant="small" style={{ flex: 1 }} numberOfLines={1}>
                {titleOf(o.row) || TABLE_LABEL[o.table]}
              </Txt>
              <Pill label={DECISION[o.decision].label} tone={DECISION[o.decision].tone} />
            </Row>
          ))}
          {discarded ? (
            <Row gap={1}>
              <Button title="Delete them" size="sm" variant="danger" onPress={() => act(deleteOwnDiscarded, 'Deleted')} style={{ flex: 1 }} />
              <Button title="Separate this phone" size="sm" variant="secondary" onPress={() => setConfirmSeparate(true)} style={{ flex: 1 }} />
            </Row>
          ) : null}
        </Card>
      ) : null}

      {head ? (
        <Section title="Hold edits for review">
          <Card style={{ gap: space(1) }}>
            <ChipSelect label="From phone" value={holdPhone} onChange={setHoldPhone} allowNone options={others} />
            {holdPhone ? (
              <SwitchRow label="Only one day" description="Off: everything this phone sends, until you decide" value={oneDay} onChange={setOneDay} />
            ) : (
              <Txt variant="small" tone="muted">
                No phone picked: edits from every phone on the day below.
              </Txt>
            )}
            {oneDay || !holdPhone ? <DateField label="Saved on" value={day} onChange={setDay} allowFuture={false} /> : null}
            <Button
              title="Hold"
              icon="pause-circle"
              onPress={() => act(() => holdEdits({ deviceId: holdPhone, day: oneDay || !holdPhone ? day : null }), 'Held on every phone')}
              loading={busy}
            />
          </Card>
        </Section>
      ) : null}

      {head ? (
        <Section title="Remove a phone">
          <Card style={{ gap: space(1) }}>
            <Txt variant="small" tone="muted">
              The family gets a new key that the removed phone can't open. It keeps what it already has but receives nothing new. Needs cloud sync.
            </Txt>
            {others.map((o) => (
              <Row key={o.value} gap={1}>
                <Txt style={{ flex: 1 }}>{o.label}</Txt>
                <Button title="Remove" size="sm" variant="secondary" onPress={() => setRemoving(o.value)} />
              </Row>
            ))}
            {!others.length ? (
              <Txt variant="small" tone="faint">
                No other phones yet. A phone appears here after it syncs with this version of the app.
              </Txt>
            ) : null}
            {removed.length ? (
              <Txt variant="small" tone="muted">
                Removed: {removed.map(nameOf).join(', ')}
              </Txt>
            ) : null}
          </Card>
        </Section>
      ) : null}

      {rules.length ? (
        <Section title="Rules">
          {rules.map((h) => (
            <Card key={h.id} style={{ gap: space(1) }}>
              <Row gap={1}>
                <Txt variant="bodyStrong" style={{ flex: 1 }}>
                  {describe(h)}
                </Txt>
                <Pill label={DECISION[h.decision].label} tone={DECISION[h.decision].tone} />
              </Row>
              {head ? (
                <Row gap={1}>
                  {h.decision !== 'merge' ? <Button title="Merge all" size="sm" variant="success" onPress={() => act(() => decideRule(h.id, 'merge'), 'Merged on every phone')} style={{ flex: 1 }} /> : null}
                  {h.decision !== 'discard' ? <Button title="Discard all" size="sm" variant="secondary" onPress={() => act(() => decideRule(h.id, 'discard'), 'Discarded')} style={{ flex: 1 }} /> : null}
                  <Button title="Remove" size="sm" variant="ghost" onPress={() => act(() => removeRule(h.id))} />
                </Row>
              ) : null}
            </Card>
          ))}
        </Section>
      ) : null}

      <Section title="Set aside on this phone">
        {!aside.length ? <EmptyState icon="checkmark-done-circle-outline" title="Nothing waiting" body="Edits from family phones are applied as they arrive." /> : null}
        {byPhone.map(([deviceId, list]) => (
          <Card key={deviceId} padded={false} style={{ overflow: 'hidden' }}>
            <View style={{ padding: space(1.5), paddingBottom: 0 }}>
              <Txt variant="caption" tone="muted">
                {nameOf(deviceId).toUpperCase()} · {list.length}
              </Txt>
            </View>
            {list.map((a) => {
              const problem = a.reason === 'invalid' ? invalidRow(a.tbl, a.row) : null;
              const decision = entryRule(a.tbl, a.row.id)?.decision;
              return (
                <View key={`${a.tbl}:${a.row.id}`} style={{ padding: space(1.5), gap: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Row gap={1}>
                    <Txt variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                      {titleOf(a.row) || TABLE_LABEL[a.tbl] || a.tbl}
                    </Txt>
                    <Pill label={problem ? 'Damaged' : decision ? DECISION[decision].label : 'On hold'} tone={problem ? 'expense' : decision ? DECISION[decision].tone : 'warn'} />
                  </Row>
                  <Txt variant="small" tone="muted">
                    {TABLE_LABEL[a.tbl] ?? a.tbl} · saved {new Date(a.row.updatedAt).toLocaleString()}
                    {a.row.deletedAt ? ' · deletes it' : ''}
                    {problem ? ` · ${problem}` : ''}
                  </Txt>
                  {head && decision !== 'discard' ? (
                    <Row gap={1}>
                      {/* A damaged entry can't be shown, so merging it would change nothing: the sender has to fix it. */}
                      {!problem ? <Button title="Merge" size="sm" variant="success" onPress={() => act(() => decideEntry(a.tbl, a.row.id, 'merge'), 'Merged on every phone')} style={{ flex: 1 }} /> : null}
                      <Button title="Discard" size="sm" variant="secondary" onPress={() => act(() => decideEntry(a.tbl, a.row.id, 'discard'), 'Discarded')} style={{ flex: 1 }} />
                    </Row>
                  ) : null}
                </View>
              );
            })}
          </Card>
        ))}
      </Section>

      <Sheet visible={Boolean(removing)} onClose={() => setRemoving(null)} title={`Remove ${nameOf(removing)}?`}>
        <Txt tone="muted">
          {nameOf(removing)} keeps the entries it already has, but can't read anything added from now on. The new family key goes to:
        </Txt>
        {removing
          ? keyRecipients(removing).map((r) => (
              <Txt key={r.id} variant="bodyStrong">
                • {r.name}
                {r.hasKey ? '' : ' (older app: pair again by QR)'}
              </Txt>
            ))
          : null}
        <Txt variant="small" tone="muted">
          Don't recognise a phone in this list? Remove it as well. Phones not listed here pair again by QR.
        </Txt>
        <Button
          title="Remove"
          variant="danger"
          onPress={() => {
            const id = removing!;
            setRemoving(null);
            act(async () => {
              const r = await removePhone(id);
              if (r.needQr.length) toast(`Pair again by QR: ${r.needQr.join(', ')} (older app version)`, { tone: 'error' });
              else toast(r.finished ? `${nameOf(id)} removed. The others switch on their next sync.` : 'Removing: it finishes when this phone is back online.', { tone: 'success' });
            });
          }}
        />
        <Button title="Cancel" variant="secondary" onPress={() => setRemoving(null)} />
      </Sheet>

      <Sheet visible={confirmSeparate} onClose={() => setConfirmSeparate(false)} title="Separate this phone?">
        <Txt tone="muted">
          This phone leaves the household and keeps all its data as a household of its own. Family phones keep what they already have. Cloud sync turns off; you can pair again later.
        </Txt>
        <Button
          title="Separate"
          variant="danger"
          onPress={() => {
            setConfirmSeparate(false);
            act(separateFromHousehold, 'This phone is on its own now').then(() => router.back());
          }}
        />
        <Button title="Cancel" variant="secondary" onPress={() => setConfirmSeparate(false)} />
      </Sheet>
    </Screen>
  );
}
