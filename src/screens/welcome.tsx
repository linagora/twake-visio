import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';

import { signIn } from 'src/auth/login';
import { DEFAULT_SERVER_URL } from 'src/constants';
import { BrandTile } from 'src/ui/brandTile';
import { tokens } from 'src/ui/tokens';

export function WelcomeScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();

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

  return (
    <View style={styles.root}>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 12, paddingBottom: 34, paddingHorizontal: 22 },
  button: { borderRadius: 14 },
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
