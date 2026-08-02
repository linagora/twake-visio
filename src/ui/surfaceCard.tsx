import React from 'react';
import { StyleSheet, View } from 'react-native';

import { tokens } from 'src/ui/tokens';

type Props = {
  readonly children: React.ReactNode;
  readonly testID?: string;
};

// La carte blanche du mockup : fond, filet, rayon 18.
//
// `overflow: 'hidden'` n'est pas une précaution de style. Les listes de ce lot
// posent des rangées à séparateur pleine largeur : sans le rognage, la première
// et la dernière débordent du rayon et les quatre angles paraissent carrés.
//
// Le filet est DÉCORATIF — une carte se voit à son fond, pas à son trait — donc
// WCAG 1.4.11 ne s'y applique pas et `cardBorder` garde la valeur du mockup. Ne
// pas le confondre avec `controlOutline`, qui délimite une commande.
export function SurfaceCard({ children, testID }: Props): React.ReactElement {
  return (
    <View style={styles.card} testID={testID}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.cardSurface,
    borderColor: tokens.color.cardBorder,
    borderRadius: tokens.radius.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
