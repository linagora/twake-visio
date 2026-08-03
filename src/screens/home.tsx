import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { getActiveAccount } from 'src/auth/accounts';
import { useUpcomingMeetings } from 'src/calendar/useUpcoming';
import { parseMeetingLink } from 'src/navigation/deepLinks';
import { JoinSheet } from 'src/screens/joinSheet';
import { ActionCard } from 'src/ui/actionCard';
import { AppHeader } from 'src/ui/appHeader';
import { tokens } from 'src/ui/tokens';
import { UpcomingMeetings } from 'src/ui/upcomingMeetings';

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
          />
        ) : null}
      </ScrollView>

      <JoinSheet
        onJoinRoom={(slug) => {
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
