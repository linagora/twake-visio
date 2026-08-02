import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { recordingLabelKey, type RecordingState } from 'src/call/recording';
import { CALL_SURFACE_HAIRLINE, CALL_SURFACE_TINT } from 'src/screens/room/callHeader';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  // Une PUCE, comme les deux bandeaux de main levée — même rayon, même
  // grammaire —, mais sur le lavis NEUTRE de `callHeader.tsx` et non sur
  // l'ambre du signal. Le mockup ne donne rien pour cet indicateur ; la couleur
  // n'est donc pas transcrite mais DÉDUITE de ce qu'il annonce : un
  // enregistrement en cours, une transcription, une sauvegarde ou une
  // interruption. Une couleur d'alerte mentirait sur trois de ces quatre.
  //
  // Composé sur `backgroundDark`, le lavis donne #212122 ; `textDark` dessus
  // mesure 13,62:1.
  chip: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: CALL_SURFACE_TINT,
    borderColor: CALL_SURFACE_HAIRLINE,
    borderRadius: 13,
    borderWidth: 1,
    marginHorizontal: tokens.spacing.md,
    marginVertical: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 5,
  },
  // Cet écran est sombre dans les deux schémas alors que `makeTheme` rend le
  // thème TOUJOURS clair : sans cette couleur explicite, le libellé retombe sur
  // `theme.colors.onSurface` — 1,11:1 sur ce lavis, invisible. 13,62:1 avec.
  text: { color: tokens.color.textDark, fontFamily: tokens.font.semiBold, fontSize: 12.5 },
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
    <View style={styles.chip} testID="recording-indicator-chip">
      <Text testID="recording-indicator" style={styles.text}>
        {t(key)}
      </Text>
    </View>
  );
}
