import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { StyleSheet } from 'react-native';

export type SheetCheckProps = {
  readonly testID: string;
};

// Le vert du mockup, celui qui dit « c'est celle-ci ». Exporté parce que deux
// spécifications le gardent (`cameraMenu.spec.tsx`, `audioOutputControl.spec.tsx`).
//
// Ce n'est PAS `tokens.color.brand` (#1FA45C) : sur le lavis de sélection
// (#173927 composé) le vert de marque ne donne que 3,95:1, tout juste au-dessus
// des 3:1 de WCAG 1.4.11 pour un objet graphique — et la coche est ici le seul
// porteur de l'information de sélection, le lavis ne la distinguant du fond de
// repos que par 1,14:1. #4BD98A donne 7,02:1 sur ce même lavis, et 10,86:1 sur
// le `backgroundDark` de la scène. Il vit ici plutôt que dans `src/ui/tokens`
// pour la raison écrite en tête de `bottomSheet.tsx`.
export const SHEET_CHECK_COLOR = '#4BD98A';

const styles = StyleSheet.create({
  // La couleur est portée ICI, explicitement, et jamais celle que Paper
  // calculerait depuis le thème. Pour un `leadingIcon` fonction, `Icon.tsx`
  // (react-native-paper) appelle `s({ color, size, direction, testID })`, mais
  // rien n'oblige la fonction à lire cet argument — la nôtre ne le faisait pas,
  // et un `View` vide n'a de toute façon ni contenu ni fond à colorer.
  check: { color: SHEET_CHECK_COLOR },
});

// La coche partagée par `cameraMenu.tsx` et `audioOutputControl.tsx`. Un glyphe
// rendu directement plutôt qu'un `leadingIcon` chaîne résolu par `Menu.Item` :
// le premier essai était un `View` vide, livré cassé et corrigé une fois avant
// que ce composant existe (commit 607f6f5), puis re-prescrit à l'identique par
// un brief suivant. Un seul endroit qui le dessine, jamais un second à corriger
// — ou à recasser — de la même façon.
//
// Rendu directement, il porte son propre `testID` et reste donc joignable par
// `toHaveStyle` — à l'inverse de l'`iconColor` d'un `IconButton` à icône-chaîne,
// que `IconButton.tsx:211` ne transmet à personne.
export function SheetCheck({ testID }: SheetCheckProps): React.ReactElement {
  return <MaterialCommunityIcons testID={testID} name="check" size={24} style={styles.check} />;
}
