import {
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import React, { useEffect, useState } from 'react';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSessionGuard } from 'src/auth/sessionGuard';
import { initI18n } from 'src/i18n';
import { listKnownHosts } from 'src/instance/knownInstances';
import { parseMeetingLink } from 'src/navigation/deepLinks';
import { makeTheme } from 'src/ui/theme';

// expo-router requires a default export for every file under app/.
export default function RootLayout(): React.ReactElement | null {
  const router = useRouter();
  const [i18nReady, setI18nReady] = useState(false);
  // Monté ICI parce que c'est la seule surface qui survit à toute navigation :
  // une session perdue doit ramener à la connexion depuis n'importe quel écran,
  // et la logique vit dans `src/`, pas sous `app/`.
  useSessionGuard();
  // Les quatre graisses que le mockup emploie, et aucune Regular. Sans ce
  // chargement, `theme.fonts` nomme une famille qui n'existe pas : RN retombe
  // en silence sur la police système, et la refonte n'est visible nulle part.
  const [fontsLoaded] = useFonts({
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  useEffect(() => {
    initI18n()
      .then(() => setI18nReady(true))
      .catch(() => setI18nReady(true));
  }, []);

  useEffect(() => {
    const allowedHosts = listKnownHosts();

    const openSlug = (url: string): void => {
      const slug = parseMeetingLink(url, allowedHosts);
      if (slug !== null) router.push(`/room/${slug}/prejoin`);
    };

    Linking.getInitialURL()
      .then((url) => {
        if (url !== null) openSlug(url);
      })
      .catch(() => undefined);

    const subscription = Linking.addEventListener('url', ({ url }) => openSlug(url));
    return () => subscription.remove();
  }, [router]);

  // Même garde que `i18nReady`, et pour la même raison : rendre un écran avant
  // que sa ressource soit prête le fait scintiller au premier affichage.
  if (!i18nReady || !fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      {/* react-native-paper nomme ses icones mais n'en embarque aucune : sans
          ce fournisseur, chaque IconButton rend un carre vide. Constate sur
          appareil, la barre de controle de la seance etait quatre carres. */}
      <PaperProvider
        theme={makeTheme()}
        settings={{
          icon: (props) => <MaterialCommunityIcons {...props} />,
        }}
      >
        {/* AUCUNE `SafeAreaView` ici, et c'est le point.
            Elle y était, avec ses quatre bords, et elle transformait les
            encoches en REMBOURRAGE de la coque. La bande ainsi dégagée laissait
            voir ce qu'il y a derrière — la vue racine, blanche sur iOS — parce
            que ce style n'avait pas de `backgroundColor`. Or `call.tsx` peint
            bien son noir, mais sur SA racine, qui vit à l'intérieur de ce
            rembourrage : elle ne pouvait pas l'atteindre. D'où un bandeau blanc
            en haut ET en bas de la séance, signalé sur appareil.
            Le fond d'une encoche appartient donc à l'écran qui la borde, jamais
            à la coque : c'est lui qui sait s'il est clair ou sombre. Chaque
            racine d'écran applique ses propres encoches et les peint, puisqu'un
            rembourrage est peint par le fond de la vue qui le porte. */}
        {/* La BASE de la pile de `StatusBar`, et non un réglage de la coque.
            Presque tous les écrans sont clairs (`appBackground`), donc icônes
            sombres. Les deux qui ne le sont pas — `call` et `prejoin` — posent
            `style="light"`, ce qui EMPILE par-dessus.

            Sans cette base, Android n'a aucun `windowLightStatusBar` : le thème
            généré est `Theme.AppCompat.DayNight.NoActionBar` avec une barre
            transparente et rien d'autre. Mesuré sur appareil,
            `dumpsys window` lisait `mLastAppearance=LIGHT_NAVIGATION_BARS`,
            SANS `LIGHT_STATUS_BARS` : icônes blanches sur en-tête blanc, donc
            invisibles. Seule la pastille de batterie survivait, ayant son
            propre fond.

            Une base ici NE contredit PAS la règle du fond d'encoche écrite plus
            bas — celle-là est un aplat qu'aucune pile ne restaure, tandis que
            `StatusBar` de React Native tient un `_propsStack` et DÉPILE au
            démontage (`StatusBar.js`, `componentWillUnmount`). Quitter la
            séance rend donc les icônes sombres sans que personne ne le
            redemande. */}
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </PaperProvider>
    </SafeAreaProvider>
  );
}
