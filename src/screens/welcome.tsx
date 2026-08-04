import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { startGuestSession } from 'src/auth/guest';
import { signIn } from 'src/auth/login';
import { DEFAULT_SERVER_URL } from 'src/constants';
import { JoinSheet } from 'src/screens/joinSheet';
import { BrandTile } from 'src/ui/brandTile';
import { tokens } from 'src/ui/tokens';

export function WelcomeScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const [joinOpen, setJoinOpen] = useState(false);
  // L'hôte visé par une session invité. Initialisé au serveur par défaut, et
  // modifiable depuis l'échappatoire « Changer » de la feuille — Décision 3 du
  // partenaire humain : à la différence de `home.tsx`, cet écran passe
  // `onHostChange`, donc la rangée de serveur s'y rend.
  const [host, setHost] = useState(() => new URL(DEFAULT_SERVER_URL).hostname);

  const handleSignIn = async (): Promise<void> => {
    const result = await signIn(DEFAULT_SERVER_URL);
    if (result.ok) router.replace('/home');
  };

  const handleSignUp = (): void => {
    router.push('/server?register=1');
  };

  const handleOrgServer = (): void => {
    router.push('/server');
  };

  // Les encoches sont appliquées ICI, sur la racine QUI PEINT LE FOND : un
  // rembourrage est peint par la vue qui le porte, donc les deux bandes
  // prennent la couleur de l'écran au lieu du blanc de la vue système. C'était
  // le défaut de la coque, qui les appliquait sans fond. Voir `app/_layout.tsx`.
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.identity}>
        <BrandTile size="lg" testID="welcome-tile" />
        {/* Deux `Text` et non un : le mockup pose « Twake » en texte principal
            et « Visio » en vert de marque. Un seul nœud ne peut pas porter deux
            couleurs, et un `Text` imbriqué compliquerait la garde du spec. */}
        <View style={styles.titleRow}>
          <Text style={styles.title} testID="welcome-title">
            {t('welcome.title')}
          </Text>
          <Text style={[styles.title, styles.titleAccent]} testID="welcome-title-accent">
            {t('welcome.titleAccent')}
          </Text>
        </View>
        <Text style={styles.tagline} testID="welcome-tagline">
          {t('welcome.tagline')}
        </Text>
      </View>

      {/* Hiérarchie INVERSÉE par rapport à l'état d'origine, et délibérément :
          le mockup met « S'inscrire » en bouton plein et « Se connecter » en
          contour, l'application visant d'abord des personnes sans compte.
          Rien ne gardait ce choix — le spec d'origine n'assertait que la
          présence des trois boutons —, d'où les deux tests ajoutés. */}
      <View style={styles.actions}>
        <Button
          buttonColor={tokens.color.brandStrong}
          mode="contained"
          onPress={handleSignUp}
          style={styles.button}
          testID="sign-up-btn"
          textColor={tokens.color.onBrand}
        >
          {t('welcome.signUp')}
        </Button>
        <Button
          mode="outlined"
          onPress={handleSignIn}
          style={styles.button}
          testID="sign-in-btn"
          textColor={tokens.color.brandStrong}
        >
          {t('welcome.signIn')}
        </Button>
        <Button
          mode="text"
          onPress={handleOrgServer}
          testID="org-server-btn"
          textColor={tokens.color.brandStrong}
        >
          {t('welcome.orgServer')}
        </Button>

        {/* Décision 1 du partenaire humain : l'entrée invité est DÉTACHÉE sous
            un séparateur, sous les trois actions de compte — jamais mêlée à
            elles. La hiérarchie Sign up (plein) / Sign in (contour) au-dessus
            reste intacte. */}
        <View style={styles.divider} />
        <Button
          mode="text"
          onPress={() => setJoinOpen(true)}
          testID="join-as-guest-btn"
          textColor={tokens.color.brandStrong}
        >
          {t('welcome.joinAsGuest')}
        </Button>
      </View>

      {/* Décision 2 : cette entrée ne vit QUE sur l'accueil, jamais sur
          `/server` — `JoinSheet` n'est montée nulle part ailleurs.
          Décision 3 : le serveur par défaut est `DEFAULT_SERVER_URL`, avec
          l'échappatoire « Changer » de la feuille restant disponible — donc
          `onHostChange` EST fourni ici, à la différence de `home.tsx` qui ne
          le passe pas (une personne connectée n'a aucun serveur à choisir). */}
      <JoinSheet
        host={host}
        onHostChange={setHost}
        onJoinRoom={({ slug, host: chosen }) => {
          setJoinOpen(false);
          // `host` parle en NOM D'HÔTE (`meet.linagora.com`), `startGuestSession`
          // attend une URL COMPLÈTE : convertir ICI, à la frontière. Le
          // manquer laisserait une session invité dont le `serverUrl` est un
          // hôte nu, et tout appel réseau ultérieur construirait une URL
          // malformée en silence.
          startGuestSession(`https://${chosen}`);
          router.push(`/room/${slug}/prejoin`);
        }}
        onSheetDismiss={() => setJoinOpen(false)}
        testID="welcome-join-sheet"
        visible={joinOpen}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 12, paddingBottom: 34, paddingHorizontal: 22 },
  button: { borderRadius: 14 },
  // Le séparateur qui détache l'entrée invité des trois actions de compte —
  // DÉCORATIF, pas porteur d'information : WCAG 1.4.11 ne s'applique donc pas,
  // comme les autres traits de `tokens.color`.
  divider: { backgroundColor: tokens.color.rowSeparator, height: 1 },
  identity: {
    alignItems: 'center',
    flex: 1,
    gap: 18,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  root: { backgroundColor: tokens.color.appBackground, flex: 1 },
  tagline: {
    color: tokens.color.textSecondary,
    fontFamily: tokens.font.medium,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },
  title: {
    color: tokens.color.textPrimary,
    fontFamily: tokens.font.extraBold,
    fontSize: 30,
    letterSpacing: -0.6,
  },
  titleAccent: { color: tokens.color.brandStrong },
  titleRow: { flexDirection: 'row', gap: 8 },
});
