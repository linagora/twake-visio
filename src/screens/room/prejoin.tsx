import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Switch, Text } from 'react-native-paper';

import { fetchRoomAccess } from 'src/api/rooms';
import type { ApiError } from 'src/api/types';
import { getActiveAccount } from 'src/auth/accounts';
import type { RoomAccess } from 'src/call/types';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  root: { flex: 1, padding: tokens.spacing.md, gap: tokens.spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
});

// Les seules raisons que cet écran sait dire. `lobby` n'y figure pas : il n'est
// pas un échec, il redirige.
type MessageKey =
  | 'error.network'
  | 'error.unauthorized'
  | 'error.forbidden'
  | 'error.notFound'
  | 'error.serverError';

function toPrejoinMessage(error: ApiError): MessageKey {
  switch (error.kind) {
    case 'unauthorized':
      return 'error.unauthorized';
    case 'forbidden':
      return 'error.forbidden';
    case 'not-found':
      return 'error.notFound';
    case 'server':
      return 'error.serverError';
    default:
      return 'error.network';
  }
}

export function PrejoinScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [access, setAccess] = useState<RoomAccess | null>(null);
  // La raison du refus, quand il y en a une. `null` tant qu'on attend : les
  // deux ensemble donnent les trois états de cet écran — on attend, on est
  // entré, on est refusé — là où `access` seul n'en distinguait que deux et
  // laissait le troisième se confondre avec l'attente.
  const [failure, setFailure] = useState<MessageKey | null>(null);
  // Les deux interrupteurs portent l'état *coupé* et non l'état actif : leurs
  // libellés sont « Caméra désactivée » et « Micro coupé ». Un interrupteur
  // dont la position haute contredit son libellé se lit à l'envers.
  const [cameraOff, setCameraOff] = useState(false);
  const [micOff, setMicOff] = useState(false);

  useEffect(() => {
    const account = getActiveAccount();
    if (account === null || slug === undefined) return;

    fetchRoomAccess(account, slug)
      .then((result) => {
        if (result.ok) {
          setAccess(result.value);
          return;
        }
        // L'absence du bloc livekit est traduite en `lobby` par fetchRoomAccess :
        // le salon existe, l'entrée doit passer par la salle d'attente.
        if (result.error.kind === 'lobby') {
          router.replace(`/room/${slug}/lobby`);
          return;
        }
        // TOUT le reste se disait par un sablier éternel. Mesuré sur appareil :
        // une session expirée rend `unauthorized`, `access` restait `null`, et
        // l'écran tournait sans message, sans sortie et sans retour — sur le
        // premier écran qu'on traverse en ouvrant une réunion. Le
        // `.catch(() => setAccess(null))` d'alors posait `null` sur `null` : il
        // avait l'apparence d'un traitement d'erreur sans en être un.
        setFailure(toPrejoinMessage(result.error));
      })
      .catch(() => setFailure('error.network'));
  }, [slug, router]);

  const handleJoin = (): void => {
    const camera = cameraOff ? 0 : 1;
    const mic = micOff ? 0 : 1;
    router.replace(`/room/${slug}/call?camera=${camera}&mic=${mic}`);
  };

  // L'échec passe AVANT l'attente : les deux ont `access === null`, et tester
  // l'attente d'abord rendrait le sablier pour toujours, ce qui est exactement
  // le défaut corrigé ici.
  if (failure !== null) {
    return (
      <View style={styles.root}>
        <Text testID="prejoin-error" variant="titleMedium">
          {t(failure)}
        </Text>
        {/* Même raison que `error-leave-btn` et `connecting-leave-btn` de
            `call.tsx` : l'en-tête est masqué par le Stack, donc sans ce bouton
            l'écran est un cul-de-sac dont on ne sort qu'en tuant
            l'application. */}
        <Button mode="contained" testID="prejoin-leave-btn" onPress={() => router.replace('/home')}>
          {t('call.leave')}
        </Button>
      </View>
    );
  }

  if (access === null) return <ActivityIndicator testID="prejoin-loading" />;

  return (
    <View style={styles.root}>
      <Text variant="titleLarge">{access.room.name}</Text>
      <View style={styles.row}>
        <Text>{t('prejoin.cameraOff')}</Text>
        <Switch testID="camera-switch" value={cameraOff} onValueChange={setCameraOff} />
      </View>
      <View style={styles.row}>
        <Text>{t('call.muted')}</Text>
        <Switch testID="mic-switch" value={micOff} onValueChange={setMicOff} />
      </View>
      <Button mode="contained" testID="join-call-btn" onPress={handleJoin}>
        {t('prejoin.join')}
      </Button>
    </View>
  );
}
