import {
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Stack, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import React, { useEffect, useState } from 'react';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initI18n } from 'src/i18n';
import { listKnownHosts } from 'src/instance/knownInstances';
import { parseMeetingLink } from 'src/navigation/deepLinks';
import { makeTheme } from 'src/ui/theme';

// expo-router requires a default export for every file under app/.
export default function RootLayout(): React.ReactElement | null {
  const router = useRouter();
  const [i18nReady, setI18nReady] = useState(false);
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
        <Stack screenOptions={{ headerShown: false }} />
      </PaperProvider>
    </SafeAreaProvider>
  );
}
