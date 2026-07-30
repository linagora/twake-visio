import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Button } from 'react-native-paper';

import { signIn } from 'src/auth/login';
import { DEFAULT_SERVER_URL } from 'src/constants';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
});

export function WelcomeScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();

  const handleSignIn = async (): Promise<void> => {
    const result = await signIn(DEFAULT_SERVER_URL);
    if (result.ok) router.replace('/home');
  };

  const handleSignUp = (): void => {
    router.push('/server?register=1');
  };

  const handleOrgServer = (): void => {
    router.push('/server');
  };

  return (
    <View style={styles.root}>
      <Button mode="contained" testID="sign-in-btn" onPress={handleSignIn}>
        {t('welcome.signIn')}
      </Button>
      <Button mode="outlined" testID="sign-up-btn" onPress={handleSignUp}>
        {t('welcome.signUp')}
      </Button>
      <Button mode="text" testID="org-server-btn" onPress={handleOrgServer}>
        {t('welcome.orgServer')}
      </Button>
    </View>
  );
}
