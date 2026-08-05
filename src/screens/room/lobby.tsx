import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Snackbar, Text } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { requestEntry } from 'src/api/rooms';
import { stashRoomAccess } from 'src/call/pendingAccess';
import type { ApiError } from 'src/api/types';
import { endGuestSession } from 'src/auth/guest';
import { getVisitor, visitorName, visitorServerUrl } from 'src/auth/visitor';
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
    // Un fond EXPLICITE, et non l'absence de fond qui laissait voir la vue
    // système. Sans lui, le rembourrage d'encoche posé sur cette racine ne
    // peindrait rien : une bande blanche, exactement le défaut corrigé.
    backgroundColor: tokens.color.appBackground,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  message: { textAlign: 'center' },
  // L'en-tête du salon attendu, avec ses deux actions de lien. Repris de
  // `callHeader.tsx` : même geste, même place, même taille de glyphe — mais
  // sur fond CLAIR ici, donc `textSecondary` et non le gris de la séance.
  header: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingBottom: tokens.spacing.sm },
  linkAction: { padding: 4 },
  room: { color: tokens.color.textPrimary, fontFamily: tokens.font.extraBold, fontSize: 16 },
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
  // Sans visiteur — ni compte ni session invité —, personne n'est à annoncer
  // au salon. L'état de départ le dit dès le premier rendu : le poser depuis
  // l'effet appellerait setState de façon synchrone, ce que
  // `react-hooks/set-state-in-effect` refuse.
  const [copied, setCopied] = useState(false);
  const [state, setState] = useState<LobbyState>(() =>
    getVisitor() === null
      ? { kind: 'failed', message: 'error.unauthorized' }
      : { kind: 'requesting' },
  );

  useEffect(() => {
    const currentVisitor = getVisitor();
    if (currentVisitor === null) return;

    requestEntry(currentVisitor, slug, visitorName(currentVisitor))
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
    const currentVisitor = getVisitor();
    if (currentVisitor === null) return;

    let stopped = false;
    const timer = setInterval(() => {
      void requestEntry(currentVisitor, slug, visitorName(currentVisitor))
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

            // Le jeton que `request-entry` vient de rendre, MIS DE CÔTÉ pour la
            // séance au lieu d'être jeté.
            //
            // Sans cela, `call.tsx` redemandait l'accès par `fetchRoomAccess`,
            // et meet n'inclut le bloc `livekit` pour un anonyme que sur un
            // salon `public` : son `should_access_room` exige `is_public`, un
            // rôle, ou un compte authentifié sur un `trusted`. Le second appel
            // ne rendait donc jamais de jeton, et la personne admise était
            // renvoyée ICI. Une boucle dont rien ne sortait — et c'est le cas
            // NORMAL d'un invité sur un salon non public. Un compte admis sur
            // un `restricted` sans rôle tombait dans la même.
            const { livekitUrl, token } = result.value;
            if (livekitUrl !== null && token !== null) {
              stashRoomAccess(slug, {
                // Ce que la salle d'attente SAIT, et rien de plus.
                //
                // `id: null` — `request-entry` porte bien l'UUID du salon, mais
                // `EntryOutcome` ne le remonte pas, et `call.tsx` fait déjà
                // `room.id ?? room.slug` : `RoomViewSet.get_object()` tente
                // l'UUID puis retombe sur le slug, les deux résolvent le même
                // objet.
                //
                // `name: slug` — c'est le repli de `toRoom` quand le serveur
                // n'envoie pas de nom, et cet écran n'a jamais eu le nom.
                //
                // `accessLevel: 'trusted'` — atteindre la salle d'attente
                // signifie que le salon n'est PAS public ; entre `trusted` et
                // `restricted` on ne peut pas trancher d'ici. Le seul
                // consommateur est `hasLobby` (`call.tsx`), lui-même gardé par
                // `canModerate`, faux ci-dessous.
                //
                // `isAdministrable: false` — qui peut administrer n'est jamais
                // envoyé en salle d'attente : le serveur lui aurait donné son
                // jeton dès `fetchRoomAccess`.
                room: { id: null, slug, name: slug, accessLevel: 'trusted' },
                livekitUrl,
                token,
                isAdministrable: false,
              });
            }

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

  // Même choix de destination que `handleLeave` dans `call.tsx`, et la même
  // fermeture de session AVANT de naviguer : sans elle, MMKV garde le serveur
  // de la réunion qu'on abandonne ici, `getVisitor()` la rendrait comme une
  // session toujours valide, et un lien profond ouvert ensuite interrogerait
  // le NOUVEAU salon sur l'ANCIEN serveur — `app/_layout.tsx` ne rappelle pas
  // `startGuestSession()` pour un lien déjà ouvert en invité, c'est le seul
  // chemin qui contourne `welcome.tsx`. Une mauvaise instance, un mauvais
  // salon, et un échec indiscernable d'un lien cassé.
  //
  // Contrairement à `call.tsx`, il n'y a ici aucune séance LiveKit à fermer
  // avant de naviguer — la salle d'attente n'en a jamais ouvert.
  const handleLeave = (): void => {
    const current = getVisitor();
    if (current?.kind === 'guest') endGuestSession();
    router.replace(current?.kind === 'guest' ? '/welcome' : '/home');
  };

  /**
   * Le lien de la réunion, depuis la salle d'attente.
   *
   * Demandé après avoir vu l'écran sur appareil : les deux icônes existaient
   * en séance et manquaient ici, alors que c'est le moment où l'on a le plus
   * de raisons de transmettre le lien — on n'est pas encore entré.
   *
   * L'URL vient du VISITEUR, jamais d'une constante : quelqu'un qui attend sur
   * une autre instance partagerait sinon un lien vers la nôtre, qui ne mène
   * pas à sa réunion. Même règle que `handleShare` de `call.tsx`.
   */
  const roomUrl = (): string | null => {
    const current = getVisitor();
    return current === null ? null : `${visitorServerUrl(current)}/${slug}`;
  };

  const handleCopyLink = async (): Promise<void> => {
    const url = roomUrl();
    if (url === null) return;
    await Clipboard.setStringAsync(url);
    // La Snackbar EST la commande, pas une politesse : une copie silencieuse
    // est indiscernable d'un appui manqué, rien ne bouge à l'écran et le
    // presse-papiers n'est visible nulle part. `call.tsx` porte le même
    // raisonnement à l'endroit du sien.
    setCopied(true);
  };

  const handleShareLink = async (): Promise<void> => {
    const url = roomUrl();
    if (url === null) return;
    try {
      await Share.share({ message: url, url });
    } catch {
      // Le partage annulé n'est pas une erreur, et rien à dire de plus.
    }
  };

  // Les cinq états rendent leur CONTENU seul, jamais le cadre. Le bouton de
  // sortie est posé une fois, après — sinon chaque état est une occasion de
  // l'oublier, et les cinq l'avaient oublié : `refusé`, `aucun modérateur` et
  // `échec` sont terminaux, donc on y restait jusqu'à tuer l'application.
  const renderBody = (): React.ReactElement => {
    if (state.kind === 'requesting') return <ActivityIndicator testID="lobby-loading" />;

    if (state.kind === 'no-moderator') {
      return (
        <Text testID="lobby-no-moderator" variant="titleMedium" style={styles.message}>
          {t('lobby.noModerator')}
        </Text>
      );
    }

    if (state.kind === 'denied') {
      return (
        <Text testID="lobby-denied" variant="titleMedium" style={styles.message}>
          {t('lobby.denied')}
        </Text>
      );
    }

    if (state.kind === 'failed') {
      return (
        <Text testID="lobby-error" variant="titleMedium" style={styles.message}>
          {t(state.message)}
        </Text>
      );
    }

    return (
      <>
        <ActivityIndicator />
        <Text testID="lobby-waiting" variant="titleMedium" style={styles.message}>
          {t('lobby.waiting')}
        </Text>
      </>
    );
  };

  // Les encoches sont appliquées ICI, sur la racine QUI PEINT LE FOND : un
  // rembourrage est peint par la vue qui le porte, donc les deux bandes
  // prennent la couleur de l'écran au lieu du blanc de la vue système. C'était
  // le défaut de la coque, qui les appliquait sans fond. Voir `app/_layout.tsx`.
  //
  // Un littéral de style est INÉVITABLE ici, à l'inverse de la règle du dépôt :
  // `StyleSheet.create` fige ses valeurs au chargement du module, et une
  // encoche n'est connue qu'à l'exécution. Le reste du style vient bien de la
  // feuille.
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Text numberOfLines={1} style={styles.room} testID="lobby-room">
          {slug}
        </Text>
        <Pressable
          accessibilityLabel={t('call.copyLink')}
          accessibilityRole="button"
          hitSlop={8}
          onPress={handleCopyLink}
          style={styles.linkAction}
          testID="lobby-copy"
        >
          <MaterialCommunityIcons
            color={tokens.color.textSecondary}
            name="content-copy"
            size={16}
          />
        </Pressable>
        <Pressable
          accessibilityLabel={t('call.share')}
          accessibilityRole="button"
          hitSlop={8}
          onPress={handleShareLink}
          style={styles.linkAction}
          testID="lobby-share"
        >
          <MaterialCommunityIcons
            color={tokens.color.textSecondary}
            name="share-variant"
            size={16}
          />
        </Pressable>
      </View>

      {renderBody()}
      {/* `replace` et non `back` : on arrive ici par un `replace` depuis le
          pré-join, donc la pile est vide et `back` ne mènerait nulle part. */}
      <Button
        buttonColor={tokens.color.brandStrong}
        mode="contained"
        onPress={handleLeave}
        testID="lobby-leave-btn"
        textColor={tokens.color.onBrand}
      >
        {t('call.leave')}
      </Button>

      <Snackbar duration={2500} onDismiss={() => setCopied(false)} visible={copied}>
        {t('call.linkCopied')}
      </Snackbar>
    </View>
  );
}
