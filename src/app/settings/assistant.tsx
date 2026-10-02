import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { cancelInstall, friendly, installPack, packState, removePack, type PackState } from '@/services/assistant';
import { Button, Card, ProgressBar, Txt } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { Screen } from '@/ui/components/Screen';
import { space } from '@/ui/theme';

const gb = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`;

/** Install / remove the optional on-device model pack. */
export default function AssistantSettings() {
  const [state, setState] = useState<PackState | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const refresh = useCallback(() => {
    packState().then(setState);
  }, []);
  useEffect(refresh, [refresh]);

  const install = async () => {
    setProgress(0);
    try {
      await installPack(setProgress);
      toast('Assistant installed', { tone: 'success' });
    } catch (e) {
      toast(friendly(e), { tone: 'error' });
    } finally {
      setProgress(null);
      refresh();
    }
  };

  const remove = () =>
    Alert.alert('Remove the assistant?', 'Frees about 2.6 GB. You can install it again later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removePack().catch((e) => toast(friendly(e), { tone: 'error' }));
          refresh();
        },
      },
    ]);

  return (
    <Screen title="On-device assistant" subtitle="Optional · runs on this phone" back>
      <Card tone="alt" style={{ gap: 6 }}>
        <Txt variant="bodyStrong">What it does</Txt>
        <Txt variant="small" tone="muted">
          Ask questions like “How much did we spend on food this month?” or “Which loan should I prepay?”. Answers come from Google’s Gemma model running on this phone. Every amount it says is checked against the
          app’s own numbers, and it can only read your data, never change it.
        </Txt>
        <Txt variant="small" tone="muted">
          Privacy: your questions and data never leave the phone. The only network use is the one-time model download from Hugging Face.
        </Txt>
      </Card>

      {!state ? null : state.kind === 'unsupported' ? (
        <Card style={{ gap: 6 }}>
          <Txt variant="bodyStrong">Not available</Txt>
          <Txt tone="muted">{state.reason}</Txt>
        </Card>
      ) : progress !== null || state.kind === 'downloading' ? (
        <Card style={{ gap: space(1.25) }}>
          <Txt variant="bodyStrong">Downloading{progress !== null ? ` · ${Math.round(progress * 100)}%` : '…'}</Txt>
          <ProgressBar value={progress ?? 0} />
          <Txt variant="small" tone="muted">
            Keep the app open. Wi-Fi recommended.
          </Txt>
          <Button title="Cancel" variant="secondary" size="sm" onPress={() => cancelInstall().finally(refresh)} />
        </Card>
      ) : state.kind === 'not-installed' ? (
        <Card style={{ gap: space(1.25) }}>
          <Txt variant="bodyStrong">Gemma 4 E2B · {gb(state.sizeBytes)} download</Txt>
          <Txt variant="small" tone="muted">
            Needs about {gb(state.sizeBytes)} of free space and about 1.5 GB of memory while answering. Licence: {state.license}.
          </Txt>
          {state.slowDevice ? (
            <Txt variant="small" tone="warn">
              This phone has less than 6 GB of memory: answers will be slow and other apps may close while it thinks.
            </Txt>
          ) : null}
          <Button title={`Download ${gb(state.sizeBytes)}`} icon="download-outline" onPress={install} />
        </Card>
      ) : (
        <Card style={{ gap: space(1.25) }}>
          <Txt variant="bodyStrong">Installed · {gb(state.sizeBytes)}</Txt>
          <Button title="Open assistant" icon="sparkles" onPress={() => router.push('/assistant')} />
          <Button title="Remove from phone" variant="secondary" size="sm" onPress={remove} />
        </Card>
      )}
    </Screen>
  );
}
