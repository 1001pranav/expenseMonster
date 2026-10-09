import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { formatDay, isoToYMD } from '@/domain/dates';
import { VAULT_MIN_PASSWORD } from '@/domain/sync/vault';
import { saveIdentity } from '@/db/repo';
import { useStore } from '@/db/store';
import { changeVaultPassword, disableVault, enableVault, loadVaultStatus, recoveryCode, restoreVault, vaultAvailable, vaultSyncNow, type VaultStatus } from '@/services/vault';
import { Button, Card, Row, Section, Txt } from '@/ui/components/core';
import { Sheet, toast } from '@/ui/components/feedback';
import { TextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

type Mode = 'enable' | 'restore' | 'unlock' | 'change' | 'disable' | null;

/** Personal cloud backup, encrypted with a password only the user knows (services/vault.ts). */
export default function CloudBackup() {
  const { colors } = useTheme();
  const on = useStore((s) => s.settings.vaultSync);
  // Opened from the welcome screen of a new phone: go straight to restore.
  const params = useLocalSearchParams<{ restore?: string }>();
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(params.restore === '1' && !on ? 'restore' : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [current, setCurrent] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [newCode, setNewCode] = useState<string | null>(null);

  const refresh = useCallback(() => {
    loadVaultStatus().then(setStatus);
    recoveryCode().then(setCode);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh, on]);

  const close = () => {
    setMode(null);
    setPass('');
    setPass2('');
    setCurrent('');
    setCodeInput('');
  };

  const act = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const submit = () =>
    act('sheet', async () => {
      if (mode === 'enable' || mode === 'change') {
        if (pass !== pass2) throw new Error("Passwords don't match");
      }
      if (mode === 'enable') {
        setNewCode(await enableVault(pass));
      } else if (mode === 'restore') {
        const r = await restoreVault(codeInput, pass);
        toast(`Restored: ${r.inserted} new, ${r.updated} updated${r.joined ? ` · back in ${r.joined}` : ''}`, { tone: 'success' });
        const { identity } = useStore.getState();
        if (!identity.onboarded) {
          close();
          // The backup says who "me" is: setup is done. Older backups don't, so finish onboarding.
          if (identity.selfMemberId) {
            await saveIdentity({ onboarded: true });
            // Drop the welcome screen underneath, so Back can't return to it (same end state as finishing onboarding).
            if (router.canDismiss()) router.dismissAll();
            router.replace('/');
          } else router.back();
          return;
        }
      } else if (mode === 'unlock') {
        await restoreVault(code ?? '', pass);
        toast('Backup unlocked', { tone: 'success' });
      } else if (mode === 'change') {
        await changeVaultPassword(current, pass);
        toast('Password changed. Other phones will ask for it once.', { tone: 'success' });
      }
      close();
    });

  const syncNow = () =>
    act('sync', async () => {
      const r = await vaultSyncNow();
      toast(r.sent ? 'Backed up' : r.received ? `${r.received} entries received` : 'Already up to date', { tone: 'success' });
    });

  const turnOff = (deleteFromCloud: boolean) =>
    act(deleteFromCloud ? 'delete' : 'off', async () => {
      await disableVault(deleteFromCloud);
      toast(deleteFromCloud ? 'Backup deleted from the cloud' : 'Cloud backup turned off on this phone');
      close();
    });

  const copy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    toast('Recovery code copied', { tone: 'success' });
  };

  if (!vaultAvailable) {
    return (
      <Screen title="Cloud backup" back>
        <Card tone="alt">
          <Txt tone="muted">This build has no cloud server configured, so cloud backup is not available. Use Backup & export for an encrypted file instead.</Txt>
        </Card>
      </Screen>
    );
  }

  const sheetTitle =
    mode === 'enable' ? 'Choose a backup password' : mode === 'restore' ? 'Restore from cloud' : mode === 'unlock' ? 'Enter backup password' : mode === 'change' ? 'Change backup password' : 'Turn off cloud backup';

  return (
    <Screen title="Cloud backup" subtitle={on ? 'On · encrypted with your password' : 'Off'} back>
      <Card tone="alt" style={{ gap: 6 }}>
        <Txt variant="bodyStrong">How it works</Txt>
        <Txt variant="small" tone="muted">
          • Everything on this phone, private entries included, is encrypted here with your password before upload.{'\n'}• Your password is never sent or stored. The server keeps data it cannot read.{'\n'}• To restore on a new phone you need the recovery code and the password. If you forget the password, nobody can recover the backup.
        </Txt>
      </Card>

      {on ? (
        <>
          {status?.needsPassword ? (
            <Card onPress={() => setMode('unlock')} style={{ borderWidth: 1.5, borderColor: colors.warn, gap: 4 }}>
              <Txt variant="bodyStrong">Password needed</Txt>
              <Txt variant="small" tone="muted">
                {status.message} Tap to enter it.
              </Txt>
            </Card>
          ) : null}
          <Section title="Status">
            <Card style={{ gap: space(1.25) }}>
              {status ? (
                <Txt variant="small" tone={status.ok ? 'muted' : 'expense'}>
                  {formatDay(isoToYMD(status.at))} {new Date(status.at).toTimeString().slice(0, 5)} · {status.message}
                </Txt>
              ) : null}
              <Txt variant="small" tone="muted">
                Backs up when the app opens and shortly after each change.
              </Txt>
              <Button title="Back up now" icon="cloud-upload-outline" size="sm" variant="secondary" loading={busy === 'sync'} onPress={syncNow} />
            </Card>
          </Section>
          {code ? (
            <Section title="Recovery code">
              <Card style={{ gap: space(1.25) }}>
                <Txt variant="bodyStrong" selectable style={{ fontVariant: ['tabular-nums'], letterSpacing: 1 }}>
                  {code}
                </Txt>
                <Txt variant="small" tone="muted">
                  Write it down or save it in a password manager, separately from the password. It only finds your backup; it can't open it.
                </Txt>
                <Button title="Copy code" icon="copy-outline" size="sm" variant="secondary" onPress={() => copy(code)} />
              </Card>
            </Section>
          ) : null}
          <Row gap={1}>
            <Button title="Change password" icon="key-outline" variant="secondary" style={{ flex: 1 }} onPress={() => setMode('change')} />
            <Button title="Turn off" icon="cloud-offline-outline" variant="secondary" style={{ flex: 1 }} onPress={() => setMode('disable')} />
          </Row>
        </>
      ) : (
        <Row gap={1}>
          <Button title="Turn on" icon="cloud-upload-outline" style={{ flex: 1 }} onPress={() => setMode('enable')} />
          <Button title="Restore" icon="cloud-download-outline" variant="secondary" style={{ flex: 1 }} onPress={() => setMode('restore')} />
        </Row>
      )}

      <Sheet visible={mode !== null} onClose={close} title={sheetTitle}>
        {mode === 'disable' ? (
          <>
            <Txt tone="muted">Turning off stops backups from this phone and forgets the key here. The backup stays in the cloud for your other phones unless you delete it.</Txt>
            <Button title="Turn off on this phone" variant="secondary" loading={busy === 'off'} onPress={() => turnOff(false)} />
            <Button title="Turn off and delete from cloud" variant="danger" loading={busy === 'delete'} onPress={() => turnOff(true)} />
          </>
        ) : (
          <>
            {mode === 'restore' ? <TextField label="Recovery code" value={codeInput} onChangeText={setCodeInput} autoCapitalize="characters" hint="24 letters and numbers" /> : null}
            {mode === 'change' ? <TextField label="Current password" value={current} onChangeText={setCurrent} secure autoCapitalize="none" /> : null}
            <TextField label={mode === 'change' ? 'New password' : 'Password'} value={pass} onChangeText={setPass} secure autoCapitalize="none" hint={mode === 'enable' || mode === 'change' ? `${VAULT_MIN_PASSWORD}+ characters. A short sentence works well.` : undefined} />
            {mode === 'enable' || mode === 'change' ? <TextField label="Repeat password" value={pass2} onChangeText={setPass2} secure autoCapitalize="none" /> : null}
            <Button
              title={mode === 'enable' ? 'Encrypt & back up' : mode === 'change' ? 'Change password' : mode === 'unlock' ? 'Unlock' : 'Restore'}
              loading={busy === 'sheet'}
              onPress={submit}
            />
            <Txt variant="small" tone="muted">
              {mode === 'restore'
                ? 'Restoring merges the backup with what is on this phone. Newer edits win.'
                : 'Deriving the key from your password takes a few seconds on purpose; it makes guessing it slow.'}
            </Txt>
          </>
        )}
      </Sheet>

      <Sheet visible={newCode !== null} onClose={() => setNewCode(null)} title="Save your recovery code">
        <Txt variant="h2" selectable style={{ letterSpacing: 1, textAlign: 'center' }}>
          {newCode}
        </Txt>
        <Txt tone="muted">You need this code and your password to restore on a new phone. You can see the code again here later, but not if this phone is lost: save it somewhere else now.</Txt>
        <Button title="Copy code" icon="copy-outline" variant="secondary" onPress={() => newCode && copy(newCode)} />
        <Button title="I saved it" onPress={() => setNewCode(null)} />
      </Sheet>
    </Screen>
  );
}
