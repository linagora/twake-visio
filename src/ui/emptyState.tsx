import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { tokens } from 'src/ui/tokens';

type Props = {
  readonly message: string;
  readonly testID?: string;
};

// L'état vide centré.
//
// Il ne code AUCUN message : deux états vides bien distincts le partagent — un
// journal jamais rempli (« Aucune réunion pour l'instant ») et une recherche
// infructueuse (« Aucune réunion ne correspond »). Les confondre en une seule
// phrase dirait à quelqu'un qui vient de taper trois lettres qu'il n'a jamais
// tenu de réunion.
export function EmptyState({ message, testID }: Props): React.ReactElement {
  return (
    <Text style={styles.message} testID={testID}>
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  message: {
    color: tokens.color.textSectionLabel,
    fontFamily: tokens.font.semiBold,
    fontSize: 14,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.lg,
    textAlign: 'center',
  },
});
