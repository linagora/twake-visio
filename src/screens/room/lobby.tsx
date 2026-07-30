import { useLocalSearchParams } from 'expo-router';
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
  | { kind: 'failed'; message: 'error.network' | 'error.unauthorized' };

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
