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
import { StyleSheet } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

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
        {/* Les en-têtes sont masqués, donc rien ne pousse le contenu sous la
            barre d'état : sans ces marges, le premier élément de chaque écran
            passe sous l'heure et les icônes système. Appliquées ici une fois
            plutôt que dans chacun des sept écrans. */}
        <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
          <Stack screenOptions={{ headerShown: false }} />
        </SafeAreaView>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});
