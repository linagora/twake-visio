import React from 'react';
import { StyleSheet, View } from 'react-native';

import { tokens } from 'src/ui/tokens';

// Coquille : l'écran est rempli par la tâche suivante du lot. Elle existe dès
// maintenant pour que la coque à trois onglets soit navigable et vérifiable sur
// appareil sans attendre son contenu.
export function HistoriqueScreen(): React.ReactElement {
  return <View style={styles.root} testID="historique-screen" />;
}

const styles = StyleSheet.create({
  root: { backgroundColor: tokens.color.appBackground, flex: 1 },
});
