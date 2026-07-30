import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';

import { requestEntry } from 'src/api/rooms';
import type { ApiError } from 'src/api/types';
import { getActiveAccount } from 'src/auth/accounts';
import { tokens } from 'src/ui/tokens';

// « Personne ne peut ouvrir » est un état du salon, pas une panne : c'est la
// conséquence directe du niveau d'accès choisi à sa création, et l'écran doit
// le dire. Une panne réseau ou une session expirée, elles, ne disent rien du
// salon — les afficher comme une absence de modérateur ferait mentir l'écran.
type LobbyState =
  | { kind: 'requesting' }
  | { kind: 'waiting' }
  | { kind: 'no-moderator' }
  | { kind: 'denied' }
  | { kind: 'failed'; message: 'error.network' | 'error.unauthorized' };

// `request-entry` est fait pour être rappelé — « if waiting, refresh timeout
// to maintain position » — et porte à lui seul l'admission, le refus et le
// jeton. Aucun flux d'événements n'est exposé côté meet, la scrutation est
// donc la seule voie. Cinq secondes est la cadence validée : elle tient
// l'attente courte sans marteler le serveur pendant qu'une réunion se remplit.
const ADMISSION_POLL_MS = 5000;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  message: { textAlign: 'center' },
});

function toFailedOrNoModerator(error: ApiError): LobbyState {
  if (error.kind === 'forbidden') return { kind: 'no-moderator' };
  return {
    kind: 'failed',
    message: error.kind === 'unauthorized' ? 'error.unauthorized' : 'error.network',
  };
}

export function LobbyScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  // Sans compte actif, personne n'est à annoncer au salon. L'état de départ le
  // dit dès le premier rendu : le poser depuis l'effet appellerait setState de
  // façon synchrone, ce que `react-hooks/set-state-in-effect` refuse.
  const [state, setState] = useState<LobbyState>(() =>
    getActiveAccount() === null
      ? { kind: 'failed', message: 'error.unauthorized' }
      : { kind: 'requesting' },
  );

  useEffect(() => {
    const account = getActiveAccount();
    if (account === null) return;

    requestEntry(account, slug, account.displayName)
      .then((result) =>
        setState(result.ok ? { kind: 'waiting' } : toFailedOrNoModerator(result.error)),
      )
      .catch(() => setState({ kind: 'failed', message: 'error.network' }));
  }, [slug]);

  // On scrute aussi sans modérateur : c'est un état d'attente, pas une fin de
  // course. Quelqu'un qui peut ouvrir peut arriver une minute plus tard, et
  // l'écran doit alors basculer tout seul.
  const awaitingAdmission = state.kind === 'waiting' || state.kind === 'no-moderator';

  useEffect(() => {
    if (!awaitingAdmission) return;
    const account = getActiveAccount();
    if (account === null) return;

    let stopped = false;
    const timer = setInterval(() => {
      void requestEntry(account, slug, account.displayName)
        .then((result) => {
          if (stopped) return;
          if (!result.ok) {
            // Une coupure passagère ne doit pas éjecter quelqu'un de la file.
            if (result.error.kind === 'unauthorized') {
              stopped = true;
              clearInterval(timer);
              setState({ kind: 'failed', message: 'error.unauthorized' });
            }
            return;
          }
          if (result.value.status === 'accepted') {
            stopped = true;
            clearInterval(timer);
            router.replace(`/room/${slug}/call`);
            return;
          }
          if (result.value.status === 'denied') {
            stopped = true;
            clearInterval(timer);
            setState({ kind: 'denied' });
          }
        })
        .catch(() => undefined);
    }, ADMISSION_POLL_MS);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [awaitingAdmission, slug, router]);

  if (state.kind === 'requesting') {
    return (
      <View style={styles.root}>
        <ActivityIndicator testID="lobby-loading" />
      </View>
    );
  }

  if (state.kind === 'no-moderator') {
    return (
      <View style={styles.root}>
        <Text testID="lobby-no-moderator" variant="titleMedium" style={styles.message}>
          {t('lobby.noModerator')}
        </Text>
      </View>
    );
  }

  if (state.kind === 'denied') {
    return (
      <View style={styles.root}>
        <Text testID="lobby-denied" variant="titleMedium" style={styles.message}>
          {t('lobby.denied')}
        </Text>
      </View>
    );
  }

  if (state.kind === 'failed') {
    return (
      <View style={styles.root}>
        <Text testID="lobby-error" variant="titleMedium" style={styles.message}>
          {t(state.message)}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ActivityIndicator />
      <Text testID="lobby-waiting" variant="titleMedium" style={styles.message}>
        {t('lobby.waiting')}
      </Text>
    </View>
  );
}
