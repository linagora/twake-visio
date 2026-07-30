import { Stack, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import React, { useEffect } from 'react';

import { parseMeetingLink } from 'src/navigation/deepLinks';

// expo-router requires a default export for every file under app/.
export default function RootLayout(): React.ReactElement | null {
  const router = useRouter();

  useEffect(() => {
    // Should be `listKnownHosts()` from `src/instance/knownInstances` (that module's
    // own spec, on feat/socle's plan, declares it — docs/superpowers/plans/2026-07-29-
    // twake-visio-socle.md:759). It is not exported yet: the instance task's landed
    // commit only ships `findKnownClientId`. These are the same two hosts that
    // module's KNOWN_CLIENT_IDS already keys, so this is not a guess — replace this
    // literal with the real import the moment it lands.
    const allowedHosts: readonly string[] = ['meet.linagora.com', 'visio.twake.app'];

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

  return <Stack screenOptions={{ headerShown: false }} />;
}
