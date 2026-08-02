import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, TextInput } from 'react-native-paper';

import { signIn, type LoginError } from 'src/auth/login';
import { fetchServerUrlForEmail } from 'src/instance/emailResolution';
import { ScreenHeader } from 'src/ui/screenHeader';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: tokens.spacing.lg },
  manualServer: { marginTop: tokens.spacing.sm },
  screen: { backgroundColor: tokens.color.appBackground, flex: 1 },
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

// Une erreur d'instance dit que le serveur visé est le mauvais, pas que la
// connexion a échoué : c'est là, et seulement là, que proposer un autre serveur
// aide. Un navigateur refermé ou un échange de jeton raté ne disent rien de
// l'adresse, et faire douter d'une adresse correcte égare.
function isInstanceError(error: LoginError): boolean {
  return (
    error === 'unreachable' || error === 'not-a-meet-instance' || error === 'oidc-undiscoverable'
  );
}

function computeMessageKey(error: LoginError): string {
  if (error === 'unreachable') return 'server.unreachable';
  return isInstanceError(error) ? 'server.invalid' : 'server.signInFailed';
}

export function ServerScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [manualServer, setManualServer] = useState('');
  const [manualVisible, setManualVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async (serverUrl: string): Promise<void> => {
    // L'adresse saisie part en login_hint : sans lui, la page SSO redemande
    // celle que la personne vient de taper.
    const hint = email.trim();
    const result = await signIn(serverUrl, hint.length > 0 ? hint : undefined);
    if (result.ok) {
      router.replace('/home');
      return;
    }
    if (isInstanceError(result.error)) setManualVisible(true);
    setError(t(computeMessageKey(result.error)));
  };

  const handleContinue = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      // Le champ manuel, une fois révélé, ne prend la main que s'il est rempli.
      // Laissé vide, il rend la place à la résolution : une faute de frappe
      // dans l'adresse reste ainsi corrigeable sans quitter l'écran.
      if (manualVisible && manualServer.trim().length > 0) {
        const serverUrl = normalizeServerUrl(manualServer);
        if (serverUrl === null) {
          setError(t('server.invalid'));
          return;
        }
        await connect(serverUrl);
        return;
      }

      const resolution = await fetchServerUrlForEmail(email);
      if (!resolution.ok) {
        if (resolution.error === 'invalid-email') {
          setError(t('server.emailInvalid'));
          return;
        }
        // « Instance introuvable » n'est pas une impasse : l'écran ouvre la
        // saisie manuelle du serveur plutôt que de renvoyer la personne à rien.
        setManualVisible(true);
        setError(t('server.notFound'));
        return;
      }

      await connect(resolution.value);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      {/* Le retour va à `welcome`, pas à `home` : on n'est pas encore connecté
          ici, et `home` renverrait aussitôt vers l'accueil non authentifié. */}
      <ScreenHeader
        backLabel={t('common.back')}
        onBackPress={() => router.replace('/welcome')}
        testID="server-header"
        title={t('welcome.signIn')}
      />
      <View style={styles.root}>
        <TextInput
          testID="email-input"
          label={t('server.emailPrompt')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        {manualVisible ? (
          <TextInput
            testID="server-input"
            style={styles.manualServer}
            label={t('server.prompt')}
            value={manualServer}
            onChangeText={setManualServer}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        ) : null}
        <HelperText type="error" visible={error !== null}>
          {error ?? ''}
        </HelperText>
        <Button
          mode="contained"
          testID="server-continue-btn"
          onPress={handleContinue}
          loading={busy}
          disabled={busy}
        >
          {t('welcome.signIn')}
        </Button>
      </View>
    </View>
  );
}
