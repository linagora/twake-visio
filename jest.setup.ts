import '@testing-library/jest-native/extend-expect';

// `useSafeAreaInsets` JETTE hors d'un `SafeAreaProvider` — « No safe area value
// available » (`SafeAreaContext.js:91`). Depuis que chaque écran applique ses
// propres encoches, au lieu d'une unique `SafeAreaView` dans la coque, ce
// crochet est atteint par presque tous les écrans : sans ce double, dix-neuf
// spécs tomberaient sur une erreur qui ne parle ni d'encoche ni d'écran.
//
// Posé ICI et non fichier par fichier : dix spécs le déclaraient déjà en local
// pour les feuilles, dont le `Portal` lit les mêmes encoches. Une seule
// déclaration vaut mieux que vingt-neuf.
//
// Le double rend des encoches NULLES par défaut, et respecte un
// `SafeAreaProvider` ancêtre s'il y en a un (`jest/mock.tsx:34-38`) : un test
// qui veut observer un rembourrage réel peut donc en injecter un.
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<{ default: unknown }>('react-native-safe-area-context/jest/mock').default,
);
