import { Platform } from 'react-native';

// 'padding' : iOS superpose le clavier à la fenêtre, il faut donc rendre au
// contenu la hauteur qu'il occupe. 'resize' : Android redimensionne déjà la
// fenêtre — `app.json` ne pose pas `android.softwareKeyboardLayoutMode`, et le
// défaut d'Expo est `resize` — donc un rembourrage par-dessus décalerait deux
// fois.
//
// Rendu comme une valeur plutôt que lu depuis `Platform` par le composant :
// c'est ce qui permet à une spec de rendre les deux branches sans bouchonner
// la plateforme. Le préréglage Jest fixe `Platform.OS` à 'ios', donc sans cela
// la branche Android ne serait rendue par aucun test. Même patron
// qu'`audioRouteControl()` (`src/call/audioRoute.ts`).
export type KeyboardMode = 'padding' | 'resize';

export function keyboardMode(): KeyboardMode {
  return Platform.OS === 'ios' ? 'padding' : 'resize';
}
