import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { recordingLabelKey, type RecordingState } from 'src/call/recording';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  // La même bande que le message de reconnexion (`call.tsx`, `styles.banner`) :
  // au-dessus de la scène, hors de la barre. Pas de fond propre : elle hérite
  // du fond sombre que `call.tsx` force sur `styles.root` dans les deux
  // schémas, exactement comme ce bandeau-là.
  root: { alignItems: 'center', paddingVertical: tokens.spacing.sm },
  // `call.tsx` force un fond sombre dans les deux schémas alors que le thème
  // Paper suit le schéma système : sans cette couleur explicite, le libellé
  // retombe sur `theme.colors.onSurface` — 1,08:1, invisible. 16,66:1 avec.
  text: { color: tokens.color.textDark },
});

export type RecordingIndicatorProps = {
  readonly state: RecordingState;
};

// Vu de **tout le monde**, y compris de qui n'a pas le droit d'enregistrer : ce
// qu'on peut faire et ce qu'on doit savoir sont deux questions différentes.
// Rend `null` au repos, donc toujours monté, jamais enveloppé d'une condition.
export function RecordingIndicator({ state }: RecordingIndicatorProps): React.ReactElement | null {
  const { t } = useTranslation();
  const key = recordingLabelKey(state);
  if (key === null) return null;

  return (
    <View style={styles.root}>
      <Text testID="recording-indicator" style={styles.text}>
        {t(key)}
      </Text>
    </View>
  );
}
