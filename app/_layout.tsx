import { Stack, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import React, { useEffect } from 'react';

import { parseMeetingLink } from 'src/navigation/deepLinks';

// expo-router requires a default export for every file under app/.
export default function RootLayout(): React.ReactElement | null {
  const router = useRouter();

  useEffect(() => {
    const openSlug = (url: string): void => {
      const slug = parseMeetingLink(url);
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

  return <Stack screenOptions={{ headerShown: false }} />;
}
