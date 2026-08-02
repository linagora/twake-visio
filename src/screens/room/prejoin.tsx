import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Switch, Text } from 'react-native-paper';

import { fetchRoomAccess } from 'src/api/rooms';
import { getActiveAccount } from 'src/auth/accounts';
import type { RoomAccess } from 'src/call/types';
import { rememberVisit } from 'src/rooms/journal';
import { readPreferences } from 'src/settings/preferences';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  root: { flex: 1, padding: tokens.spacing.md, gap: tokens.spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
});

export function PrejoinScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [access, setAccess] = useState<RoomAccess | null>(null);
  // Les deux interrupteurs portent l'état *coupé* et non l'état actif : leurs
  // libellés sont « Caméra désactivée » et « Micro coupé ». Un interrupteur
  // dont la position haute contredit son libellé se lit à l'envers.
  //
  // La valeur de départ vient des Réglages, lue une seule fois au montage : la
  // relire à chaque rendu écraserait ce que la personne vient de basculer ici.
  const [cameraOff, setCameraOff] = useState(() => readPreferences().cameraOffOnJoin);
  const [micOff, setMicOff] = useState(() => readPreferences().micOffOnJoin);

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
        if (result.error.kind === 'lobby') router.replace(`/room/${slug}/lobby`);
      })
      .catch(() => setAccess(null));
  }, [slug, router]);

  const handleJoin = (): void => {
    const camera = cameraOff ? 0 : 1;
    const mic = micOff ? 0 : 1;
    // Le journal de l'onglet Historique s'écrit ICI et non à l'entrée en
    // séance : `call.tsx` est disputé par quatorze branches, et rejoindre est
    // le dernier geste dont ce lot est certain. On enregistre l'entrée seule —
    // la durée exigerait un point d'accroche à la FIN de l'appel.
    // Le nom que CET écran affiche, pas un autre : c'est celui que la personne
    // vient de lire, donc celui qu'elle reconnaîtra dans l'historique.
    if (slug !== undefined && access !== null) {
      rememberVisit(slug, access.room.name, Date.now());
    }
    router.replace(`/room/${slug}/call?camera=${camera}&mic=${mic}`);
  };

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
