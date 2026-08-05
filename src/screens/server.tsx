import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, TextInput } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { signIn, type LoginError } from 'src/auth/login';
import { fetchServerUrlForEmail } from 'src/instance/emailResolution';
import { ScreenHeader } from 'src/ui/screenHeader';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: tokens.spacing.lg },
  manualServer: { marginTop: tokens.spacing.sm },
  screen: { backgroundColor: tokens.color.appBackground, flex: 1 },
});

// Un schéma en tête, quel qu'il soit. Capturé pour être COMPARÉ, pas retiré :
// l'ancien `trimmed.startsWith('http')` laissait passer `httpsx://evil.example`,
// dont `new URL(…).origin` rend la CHAÎNE « null » — pas la valeur — qui
// partait ensuite comme adresse de serveur.
const SCHEME_PREFIX = /^([a-z][a-z\d+\-.]*):\/\//i;

// Ce qu'est un hôte, port compris. Même forme que `normalizeHostInput` de
// `joinSheet.tsx`, et pour la même raison.
const HOST_WITH_PORT = /^[a-z0-9.-]+(:\d+)?$/i;

/**
 * Valide l'adresse de serveur saisie à la main, et rend son origine.
 *
 * Un PRÉDICAT explicite, et surtout PAS `new URL()` dans un `try`/`catch`
 * comme avant : **`URL` n'est pas le même objet sous Jest et sur l'appareil.**
 * React Native installe le sien (`polyfillGlobal('URL', …)`,
 * `Libraries/Core/setUpXHR.js:35`), un jeu de regex qui ne jette pas et dont le
 * getter `origin` (`/^(https?:\/\/[^/]+)/`, `Libraries/Blob/URL.js:147-150`)
 * ACCEPTE LES ESPACES. Mesuré le 2026-08-05 :
 *
 *   new URL('https://mon serveur').origin  →  Node : lève
 *                                          →  RN   : 'https://mon serveur'
 *
 * Le `catch` ne refusait donc presque RIEN sur un téléphone : quelqu'un tapait
 * « mon serveur », l'écran l'acceptait, et la connexion partait vers une
 * adresse malformée. C'est le même défaut que celui corrigé dans
 * `joinSheet.tsx` pour la rangée de serveur du mode invité.
 *
 * **`http` en clair est désormais REFUSÉ**, alors qu'il passait. Ce dépôt le
 * refuse déjà pour un lien de réunion (`deepLinks.spec.ts:53`,
 * `pasted.spec.ts:50`), et une connexion OIDC en clair est pire : elle porte
 * des jetons. Aucun appelant n'en dépendait — vérifié le 2026-08-05, aucun
 * `http://` dans `src/` ni `app/` hors de ces deux assertions de refus.
 *
 * Le PORT est conservé : quelqu'un qui héberge son instance sur `:8443` doit
 * pouvoir la saisir.
 */
function normalizeServerUrl(input: string): string | null {
  const trimmed = input.trim();

  const scheme = SCHEME_PREFIX.exec(trimmed);
  if (scheme !== null && scheme[1]?.toLowerCase() !== 'https') return null;
  const host = scheme === null ? trimmed : trimmed.slice(scheme[0].length);

  if (!HOST_WITH_PORT.test(host)) return null;
  // Un point en tête, en queue, ou deux à la suite passent la classe de
  // caractères ci-dessus et ne forment pourtant aucun nom de domaine.
  const name = host.split(':')[0] ?? '';
  if (name.startsWith('.') || name.endsWith('.') || name.includes('..')) return null;

  // Explicite : le polyfill de React Native ne normalise pas la casse.
  return `https://${host.toLowerCase()}`;
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

  // L'encart HAUT n'est pas ici : il appartient à `ScreenHeader`, seule surface
  // qui borde ce bord et qui porte sa propre couleur. Le BAS, lui, est bien
  // ici — rien d'autre ne le borde.
  //
  // Les encoches sont appliquées sur la racine QUI PEINT LE FOND : un
  // rembourrage est peint par la vue qui le porte, donc les deux bandes
  // prennent la couleur de l'écran au lieu du blanc de la vue système. C'était
  // le défaut de la coque, qui les appliquait sans fond. Voir `app/_layout.tsx`.
  //
  // Un littéral de style est INÉVITABLE ici, à l'inverse de la règle du dépôt :
  // `StyleSheet.create` fige ses valeurs au chargement du module, et une
  // encoche n'est connue qu'à l'exécution. Le reste du style vient bien de la
  // feuille.
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
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
