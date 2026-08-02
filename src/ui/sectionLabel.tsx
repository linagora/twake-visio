import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { tokens } from 'src/ui/tokens';

type Props = {
  readonly label: string;
  readonly testID?: string;
};

// Le libellé capitalisé qui coiffe une section — « 7 DERNIERS JOURS »,
// « AUDIO ET VIDÉO PAR DÉFAUT ».
//
// La capitale vient du STYLE, jamais de la valeur traduite : une chaîne écrite
// en majuscules dans les sept fichiers de locale serait pénible à relire, et
// certaines langues capitalisent autrement.
//
// La couleur est explicite bien que le thème soit désormais toujours clair.
// C'est volontaire : la garde de `AGENTS.md` tient sur cette égalité stricte, et
// elle doit rougir si quelqu'un la retire — y compris le jour où ce composant
// serait posé sur un fond sombre.
export function SectionLabel({ label, testID }: Props): React.ReactElement {
  return (
    <Text style={styles.label} testID={testID}>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    color: tokens.color.textSectionLabel,
    fontFamily: tokens.font.extraBold,
    fontSize: tokens.typography.sectionLabel.fontSize,
    letterSpacing: tokens.typography.sectionLabel.letterSpacing,
    lineHeight: tokens.typography.sectionLabel.lineHeight,
    textTransform: 'uppercase',
  },
});
