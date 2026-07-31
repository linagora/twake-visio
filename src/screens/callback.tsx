import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';

import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.md,
  },
});

// Cet écran n'est jamais atteint par une navigation de l'application : il l'est
// par `expo-router`, qui capte TOUT lien profond porté par le schéma de
// l'application et le transforme en route. `twakevisio://callback?code=…` — la
// redirection OIDC, consommée par `openAuthSessionAsync` et par personne
// d'autre — devient donc une navigation vers `/callback`.
//
// Sans ce fichier, aucune route ne correspond et l'utilisateur voit s'afficher
// « Unmatched Route » sur fond noir entre le navigateur et son accueil. Mesuré
// sur appareil : moins d'une seconde, mais un écran d'erreur au beau milieu
// d'une connexion réussie.
//
// Il ne fait donc rien et n'a rien à faire : c'est `signIn` qui poursuit, et son
// `router.replace('/home')` qui recouvre cet écran. Lui donner un rôle — lire le
// code, échanger le jeton — dupliquerait le flux au lieu de le compléter.
export function CallbackScreen(): React.ReactElement {
  const { t } = useTranslation();

  return (
    <View testID="callback-screen" style={styles.root}>
      <ActivityIndicator testID="callback-spinner" />
      <Text testID="callback-label">{t('callback.signingIn')}</Text>
    </View>
  );
}
