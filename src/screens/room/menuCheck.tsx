import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';

import { barStyles } from 'src/screens/room/controlBar';

export type MenuCheckProps = {
  readonly testID: string;
};

// La coche partagée par `cameraMenu.tsx` et `audioOutputControl.tsx`. Voir le
// commentaire de `barStyles.check` (`controlBar.ts`) pour pourquoi c'est un
// glyphe rendu directement plutôt qu'un `leadingIcon` chaîne résolu par
// `Menu.Item` : le premier essai était un `View` vide, livré cassé et corrigé
// une fois avant que ce composant existe (commit 607f6f5), puis re-prescrit à
// l'identique par un brief suivant. Un seul endroit qui le dessine, jamais un
// second à corriger — ou à recasser — de la même façon.
export function MenuCheck({ testID }: MenuCheckProps): React.ReactElement {
  return <MaterialCommunityIcons testID={testID} name="check" size={24} style={barStyles.check} />;
}
