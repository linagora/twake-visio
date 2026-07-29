import { Stack } from 'expo-router';

// expo-router requires a default export for every file under app/.
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
