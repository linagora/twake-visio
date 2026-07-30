import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, IconButton, Text } from 'react-native-paper';

import { fetchRoomAccess } from 'src/api/rooms';
import type { ApiError } from 'src/api/types';
import { getActiveAccount } from 'src/auth/accounts';
import { createCallSession } from 'src/call/connection';
import {
  setCameraEnabled,
  setMicrophoneEnabled,
  switchCamera,
  type FacingMode,
} from 'src/call/media';
import type { CallState } from 'src/call/types';
import { useCallLayout } from 'src/call/useCallLayout';
import { CallStage } from 'src/screens/room/stage';
import { tokens } from 'src/ui/tokens';

// Les seules raisons que l'écran sait dire quand il n'y a pas de séance. Ce
// sont des clés de traduction : rien de ce qui vient du réseau ou du SDK ne
// s'affiche tel quel.
type MessageKey = 'error.network' | 'error.unauthorized' | 'call.ended';

// L'API répond avant toute connexion LiveKit : c'est là — et là seulement —
// qu'un jeton refusé se distingue d'une panne. `lobby` voudrait dire que
// l'accès a été retiré entre le pré-écran et ici ; le plan ne décrit aucun
// retour vers la salle d'attente depuis la séance, ce cas est donc traité
// comme les autres refus plutôt qu'inventé.
function toAccessMessage(error: ApiError): MessageKey {
  return error.kind === 'unauthorized' ? 'error.unauthorized' : 'error.network';
}

// `reason` est le texte brut du SDK : ni traduit, ni stable d'une version de
// livekit-client à l'autre, ni lisible par la personne à qui on le montrerait.
// Il ne s'affiche jamais. `closed` est le seul motif que `src/call/connection`
// produit lui-même — le serveur a mis fin à la séance, ce qui n'est pas une
// panne ; tout le reste vient d'un `room.connect()` en échec.
//
// On ne cherche pas `error.unauthorized` ici : `connection.ts` ne conserve que
// `err.message` et laisse tomber le `ConnectionErrorReason` structuré du SDK.
// Deviner l'autorisation depuis ce texte serait faux dès la version suivante.
function toDisconnectMessage(reason: string): MessageKey {
  return reason === 'closed' ? 'call.ended' : 'error.network';
}

const styles = StyleSheet.create({
  // La scène reste sombre dans les deux schémas : c'est la convention de toute
  // la visioconférence, et un fond clair autour d'une vignette vidéo éblouit
  // dans une pièce éteinte.
  root: { flex: 1, backgroundColor: tokens.color.backgroundDark },
  banner: { alignItems: 'center', paddingVertical: tokens.spacing.sm },
  bannerText: { color: tokens.color.textDark },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: tokens.spacing.md,
    padding: tokens.spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  message: { textAlign: 'center' },
});

export function CallScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { slug, camera, mic } = useLocalSearchParams<{
    slug: string;
    camera?: string;
    mic?: string;
  }>();

  // `useState` et non `useMemo` : React se réserve le droit de jeter un
  // `useMemo`, et une session jetée laisse derrière elle une Room vivante —
  // donc un micro, une caméra et un transport que plus personne ne fermera.
  const [session] = useState(createCallSession);

  // `subscribe()` ne pousse pas l'état courant : il n'enregistre l'abonné que
  // pour les transitions suivantes. Lire `getState()` ici est ce qui rend
  // l'écran juste quel que soit l'ordre des effets, et ce qui le laissera juste
  // le jour où une session déjà ouverte lui sera passée. Un écran qui attend
  // une poussée à l'abonnement reste sur le voyant de connexion pour toujours.
  const [callState, setCallState] = useState<CallState>(() => session.getState());

  // Sans compte actif, il n'y a pas de jeton à demander. L'état de départ le
  // dit dès le premier rendu : le poser depuis l'effet appellerait setState de
  // façon synchrone, ce que `react-hooks/set-state-in-effect` refuse.
  const [failure, setFailure] = useState<MessageKey | null>(() =>
    getActiveAccount() === null ? 'error.unauthorized' : null,
  );

  const [micOn, setMicOn] = useState(mic !== '0');
  const [cameraOn, setCameraOn] = useState(camera !== '0');
  // Le SDK n'expose pas la face courante de la caméra : c'est l'écran qui la
  // conserve, et il repart de celle que `switchCamera` lui rend.
  const [facing, setFacing] = useState<FacingMode>('user');

  // La Room est prête et son identité stable dès le premier rendu — la session
  // la construit dans son constructeur. Le crochet doit être appelé ici, avant
  // les sorties anticipées ci-dessous : il n'y a pas de rendu où l'écran aurait
  // le droit de ne pas l'appeler.
  //
  // Tout ce qui se décide de l'affichage est derrière ce seul appel :
  // `src/call/participants` lit la Room, `src/call/layout` choisit, et l'écran
  // n'a plus qu'une liste de vignettes à passer à sa coquille de rendu.
  const layout = useCallLayout(session.getRoom(), facing);

  // Déclaré avant l'effet de connexion : les nettoyages s'exécutent dans
  // l'ordre de déclaration des effets, le désabonnement précède donc la
  // libération de la session.
  useEffect(() => {
    const unsubscribe = session.subscribe(setCallState);
    return () => {
      unsubscribe();
      // Terminal. Sans lui, chaque passage sur cet écran laisse derrière lui
      // une Room vivante, et avec elle le micro, la caméra et le transport.
      session.dispose();
    };
  }, [session]);

  // Ne dépend d'aucune des bascules : le nettoyage d'un effet s'exécute à
  // chacune de ses relances, et un effet de connexion qui dépendrait de `micOn`
  // couperait la séance à chaque appui sur le micro.
  useEffect(() => {
    const account = getActiveAccount();
    if (account === null) return;

    let cancelled = false;

    fetchRoomAccess(account, slug)
      .then(async (result) => {
        if (cancelled) return;
        if (!result.ok) {
          setFailure(toAccessMessage(result.error));
          return;
        }

        // `connect()` ne rejette jamais : l'issue est publiée sur l'abonnement
        // ci-dessus, elle n'est pas portée par la promesse. Il n'y a donc pas
        // de jet à rattraper ici, seulement un état à lire — pour ne pas
        // allumer les périphériques d'une séance qui ne s'est pas ouverte.
        await session.connect(result.value);
        if (cancelled || session.getState().status !== 'connected') return;

        // Les choix faits au pré-écran arrivent par l'URL : entrer micro ouvert
        // quand la personne l'avait coupé la ferait parler sans le savoir.
        await setMicrophoneEnabled(session.getRoom(), mic !== '0');
        await setCameraEnabled(session.getRoom(), camera !== '0');
      })
      .catch(() => {
        if (!cancelled) setFailure('error.network');
      });

    return () => {
      cancelled = true;
    };
  }, [session, slug, camera, mic]);

  const handleToggleMic = (): void => {
    const next = !micOn;
    setMicOn(next);
    // L'icône revient où elle était si la commande échoue : elle ne doit jamais
    // annoncer un micro coupé qui ne l'est pas.
    setMicrophoneEnabled(session.getRoom(), next).catch(() => setMicOn(!next));
  };

  const handleToggleCamera = (): void => {
    const next = !cameraOn;
    setCameraOn(next);
    setCameraEnabled(session.getRoom(), next).catch(() => setCameraOn(!next));
  };

  const handleSwitchCamera = (): void => {
    // `switchCamera` rend la face obtenue — la même qu'avant s'il n'y a pas de
    // piste caméra. Repartir d'elle est la seule façon de ne pas redemander la
    // même face au coup suivant.
    switchCamera(session.getRoom(), facing)
      .then(setFacing)
      .catch(() => undefined);
  };

  const handleLeave = (): void => {
    // La fermeture d'abord, la navigation ensuite. Naviguer démonte l'écran, et
    // le nettoyage peut alors ne jamais atteindre le serveur : les autres
    // verraient un participant fantôme rester dans la réunion.
    session
      .disconnect()
      .catch(() => undefined)
      .finally(() => router.replace('/home'));
  };

  const message: MessageKey | null =
    failure ?? (callState.status === 'disconnected' ? toDisconnectMessage(callState.reason) : null);

  if (message !== null) {
    return (
      <View style={styles.centered}>
        <Text testID="call-error" variant="titleMedium" style={styles.message}>
          {t(message)}
        </Text>
        {/* L'en-tête est masqué par le Stack : sans cette sortie, un écran
            d'erreur est un cul-de-sac dont on ne sort qu'en tuant l'application. */}
        <Button mode="contained" testID="error-leave-btn" onPress={handleLeave}>
          {t('call.leave')}
        </Button>
      </View>
    );
  }

  if (callState.status === 'idle' || callState.status === 'connecting') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator testID="call-connecting" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Parti pris mobile : locuteur actif en grand, vignettes en bande. La
          grille du web rend chaque visage illisible sur un écran de téléphone. */}
      <CallStage layout={layout} />

      {/* La reconnexion se dit : sans cela la personne regarde une image figée
          en croyant que c'est cassé, et raccroche alors que ça se rétablit. */}
      {callState.status === 'reconnecting' ? (
        <View style={styles.banner}>
          <Text testID="call-reconnecting" style={styles.bannerText}>
            {t('call.reconnecting')}
          </Text>
        </View>
      ) : null}

      <View style={styles.controls}>
        <IconButton
          testID="mic-toggle"
          icon={micOn ? 'microphone' : 'microphone-off'}
          iconColor={tokens.color.textDark}
          onPress={handleToggleMic}
          accessibilityLabel={t('call.muted')}
        />
        <IconButton
          testID="camera-toggle"
          icon={cameraOn ? 'video' : 'video-off'}
          iconColor={tokens.color.textDark}
          onPress={handleToggleCamera}
          accessibilityLabel={t('prejoin.cameraOff')}
        />
        <IconButton
          testID="switch-camera"
          icon="camera-flip"
          iconColor={tokens.color.textDark}
          onPress={handleSwitchCamera}
          accessibilityLabel={t('call.switchCamera')}
        />
        <IconButton
          testID="leave-btn"
          icon="phone-hangup"
          // La variante sombre : #C62828 sur #0B0B0C tombe à 3,4:1, sous le
          // seuil WCAG AA, et la scène est sombre dans les deux schémas.
          iconColor={tokens.color.dangerDark}
          onPress={handleLeave}
          accessibilityLabel={t('call.leave')}
        />
      </View>
    </View>
  );
}
