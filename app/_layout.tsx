import { Stack, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import React, { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';

import { initI18n } from 'src/i18n';
import { listKnownHosts } from 'src/instance/knownInstances';
import { parseMeetingLink } from 'src/navigation/deepLinks';
import { makeTheme } from 'src/ui/theme';

// expo-router requires a default export for every file under app/.
export default function RootLayout(): React.ReactElement | null {
  const router = useRouter();
  const scheme = useColorScheme();
  const [i18nReady, setI18nReady] = useState(false);

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

  if (!i18nReady) return null;

  return (
    <PaperProvider theme={makeTheme(scheme === 'dark' ? 'dark' : 'light')}>
      <Stack screenOptions={{ headerShown: false }} />
    </PaperProvider>
  );
}
