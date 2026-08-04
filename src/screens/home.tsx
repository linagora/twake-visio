import { useRouter } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { getActiveAccount } from 'src/auth/accounts';
import { useUpcomingMeetings } from 'src/calendar/useUpcoming';
import { calendarEventUrl } from 'src/calendar/webCalendar';
import { DEFAULT_SERVER_URL } from 'src/constants';
import { parseMeetingLink } from 'src/navigation/deepLinks';
import { JoinSheet } from 'src/screens/joinSheet';
import { ActionCard } from 'src/ui/actionCard';
import { AppHeader } from 'src/ui/appHeader';
import { tokens } from 'src/ui/tokens';
import { UpcomingMeetings } from 'src/ui/upcomingMeetings';
import { UpcomingUnavailable } from 'src/ui/upcomingUnavailable';

const styles = StyleSheet.create({
  content: { gap: 12, padding: 18 },
  root: { backgroundColor: tokens.color.appBackground, flex: 1 },
});

/**
 * L'accueil : deux actions, et les prochaines visioconférences.
 *
 * **La liste « Mes réunions » a été retirée**, décision de Michel-Marie le
 * 2026-08-03. Elle servait `fetchMyRooms()`, les salons que le SERVEUR attribue
 * au compte — ce que l'onglet Historique ne remplace pas, lui qui liste les
 * salons ouverts depuis CET appareil. Les salons dont on est propriétaire sans
 * les avoir ouverts ici ne sont donc plus accessibles qu'à partir de leur lien.
 * `fetchMyRooms` reste dans `src/api/rooms.ts`, sans appelant, pour le jour où
 * on voudra les retrouver.
 */
export function HomeScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const [joinOpen, setJoinOpen] = useState(false);
  const [account] = useState(() => getActiveAccount());
  const upcoming = useUpcomingMeetings();

  // L'hôte de l'instance connectée, seul autorisé à fournir un salon depuis
  // l'agenda. Vide sans compte, ce qui referme la porte plutôt que de l'ouvrir.
  const allowedHosts = useMemo(() => {
    if (account === null) return [];
    try {
      return [new URL(account.instance.serverUrl).hostname];
    } catch {
      return [];
    }
  }, [account]);

  // L'encart HAUT n'est PAS ici : il appartient à l'en-tête, seule surface qui
  // borde ce bord et qui porte sa propre couleur. Posé sur cette racine, la
  // bande d'état prenait le gris de la page sous un en-tête blanc.
  return (
    <View style={styles.root} testID="home-screen">
      <AppHeader
        onAvatarPress={() => router.push('/reglages')}
        testID="home-header"
        title={t('home.title')}
        userName={account?.displayName ?? ''}
      />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Les deux cartes du mockup. « Créer » pousse un écran, « Rejoindre »
            ouvre une feuille : le premier porte quatre champs dont les
            co-organisateurs, le second tient en une demi-hauteur. */}
        <ActionCard
          filled
          glyph="video-outline"
          onCardPress={() => router.push('/room/create')}
          subtitle={t('home.createSubtitle')}
          testID="home-create"
          title={t('home.createTitle')}
        />
        <ActionCard
          filled={false}
          glyph="login-variant"
          onCardPress={() => setJoinOpen(true)}
          subtitle={t('home.joinSubtitle')}
          testID="home-join"
          title={t('home.joinTitle')}
        />

        {/* Le panneau ne se rend pas tant que le calendrier n'a pas répondu, et
            pas du tout s'il ne répond jamais — voir `UpcomingState`. Une liste
            VIDE, elle, se rend : c'est la différence entre « rien de prévu » et
            « pas de calendrier », et les confondre ferait croire l'application
            cassée à qui n'a pas de réunion aujourd'hui. */}
        {/* L'écran ne se TAIT plus quand l'agenda manque. Il se taisait en
            production — un agenda absent était alors indiscernable d'un agenda
            vide — et parlait en développement une langue de développeur :
            « agenda indisponible — jeton: no-session ».
            Le détail technique n'est pas perdu pour autant : il descend sous la
            phrase, en développement seulement. */}
        {upcoming.status === 'unavailable' ? (
          <UpcomingUnavailable
            cause={upcoming.cause}
            onSignIn={() => router.push('/welcome')}
            testID="upcoming-unavailable"
          />
        ) : null}

        {upcoming.status === 'ready' ? (
          <UpcomingMeetings
            events={upcoming.events}
            now={upcoming.now}
            onJoin={(event) => {
              // Le même analyseur que les liens profonds, mais PAS la même
              // liste d'hôtes. `listKnownHosts()` est l'allowlist de ce qui
              // arrive du dehors, et elle ne contient que deux instances de
              // production : sur toute autre, « Rejoindre » n'aurait rien fait,
              // en silence. Trouvé par un test avant livraison.
              //
              // Ici l'évènement vient de l'agenda de la personne, sur SON
              // instance : c'est cet hôte-là qui fait autorité, et lui seul.
              const slug = parseMeetingLink(event.meetUrl, allowedHosts);
              if (slug !== null) router.push(`/room/${slug}/prejoin`);
            }}
            onOpenEvent={(event) => {
              // L'agenda WEB, dans un onglet du système : la fiche complète
              // d'un évènement — invités, description, pièces jointes — n'a
              // aucun équivalent dans cette application, et n'a pas à en
              // avoir. `openBrowserAsync` garde la personne dans l'app et
              // partage les cookies du navigateur, donc la session SSO déjà
              // ouverte y vaut.
              if (account === null) return;
              const url = calendarEventUrl(account.instance.serverUrl, event.uid);
              // `null` quand l'hôte ne se déduit pas : mieux vaut ne rien
              // ouvrir qu'ouvrir une page d'erreur.
              if (url !== null) void openBrowserAsync(url);
            }}
          />
        ) : null}
      </ScrollView>

      {/* Pas d'`onHostChange` : une personne connectée n'a aucun serveur à
          choisir, celui de son compte est le seul qui vaille. La rangée de
          serveur de la feuille ne se rend donc pas ici — c'est le cas invité,
          hors de cet écran, qui la fait apparaître. */}
      <JoinSheet
        host={new URL(account?.instance.serverUrl ?? DEFAULT_SERVER_URL).hostname}
        onJoinRoom={({ slug }) => {
          setJoinOpen(false);
          router.push(`/room/${slug}/prejoin`);
        }}
        onSheetDismiss={() => setJoinOpen(false)}
        testID="home-join-sheet"
        visible={joinOpen}
      />
    </View>
  );
}
