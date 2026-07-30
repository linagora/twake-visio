import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, TextInput } from 'react-native-paper';

import { signIn } from 'src/auth/login';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: tokens.spacing.lg },
});

function normalizeServerUrl(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  const withScheme = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

export function ServerScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async (): Promise<void> => {
    const serverUrl = normalizeServerUrl(value);
    if (serverUrl === null) {
      setError(t('server.invalid'));
      return;
    }
    // Un identifiant contenant un « @ » est transmis en login_hint : sans lui,
    // la page SSO redemande l'adresse que la personne vient de saisir ici.
    const hint = value.includes('@') ? value.trim() : undefined;
    const result = await signIn(serverUrl, hint);
    if (result.ok) {
      router.replace('/home');
      return;
    }
    setError(t(result.error === 'unreachable' ? 'server.unreachable' : 'server.invalid'));
  };

  return (
    <View style={styles.root}>
      <TextInput
        testID="server-input"
        label={t('server.prompt')}
        value={value}
        onChangeText={setValue}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <HelperText type="error" visible={error !== null}>
        {error ?? ''}
      </HelperText>
      <Button mode="contained" testID="server-continue-btn" onPress={handleContinue}>
        {t('welcome.signIn')}
      </Button>
    </View>
  );
}
