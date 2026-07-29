import { Stack } from 'expo-router';
import React from 'react';

// expo-router requires a default export for every file under app/.
export default function RootLayout(): React.ReactElement | null {
  return <Stack screenOptions={{ headerShown: false }} />;
}
