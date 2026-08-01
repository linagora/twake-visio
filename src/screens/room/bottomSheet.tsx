import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { Modal, Portal, Text } from 'react-native-paper';

import { sheetStyles } from 'src/screens/room/controlBar';

export type BottomSheetProps = {
  readonly testID: string;
  readonly visible: boolean;
  // Déjà traduit : il varie d'un appelant à l'autre, et chaque appelant a son `t`.
  readonly title: string;
  readonly onDismiss: () => void;
  readonly children: React.ReactNode;
};

// La coquille, et rien de plus : une `Surface` sombre posée en bas de l'écran.
//
// Ce que `Modal` apporte sans qu'on écrive une ligne : l'appui sur le fond
// referme (`dismissable`, `Modal.tsx:104`), le bouton retour d'Android referme
// aussi (`Modal.tsx:161-180`) — `Menu` s'y abonnait déjà (`Menu.tsx:265-270`),
// la vraie différence est qu'il ne CONSOMMAIT pas l'événement là où
// `Modal.tsx:171` le consomme —, les encarts de zone sûre sont reportés en
// marges (`Modal.tsx:118, 213`), et rien n'est monté à l'état fermé
// (`Modal.tsx:182`).
//
// Ce qu'il n'apporte pas, et qu'il faut savoir avant d'y poser quoi que ce soit :
//
// — AUCUN évitement de clavier (`grep -i keyboard Modal.tsx` ne rend rien, là où
//   `Menu` en gérait un). PRÉCONDITION : ne jamais placer un `TextInput` dans une
//   feuille avant qu'un évitement de clavier y soit ajouté. Le chat n'en a pas
//   besoin — son panneau remplace la scène, décision du périmètre C.
//
// — AUCUNE borne de hauteur, là où `Menu` en avait une (`Menu.tsx:496-539`) et
//   enveloppait ses enfants d'un `ScrollView` au-delà d'un seuil (`:687-693`).
//   D'où le `maxHeight` de `sheetStyles.surface` et le `ScrollView` ci-dessous :
//   sans eux, une liste assez longue pousse le haut de la feuille hors de
//   l'écran, SANS moyen de l'y ramener. Calculé depuis les métriques MD3 de
//   Paper (~240 dp fixes, ~32 dp par ligne), le seuil tombait à environ onze
//   mains levées en portrait et **trois en paysage** — et le paysage est de
//   première classe ici (`app.json` : `"orientation": "default"`).
//
//   `handControl.tsx` mappe la file sans aucune borne, et rien n'en pose une en
//   amont. C'est donc la coquille qui doit tenir, pas ses appelants.
//
// Le titre reste HORS du défilement : ce qui nomme la feuille ne doit pas
// pouvoir sortir de l'écran quand son contenu s'allonge.
export function BottomSheet({
  testID,
  visible,
  title,
  onDismiss,
  children,
}: BottomSheetProps): React.ReactElement {
  const { t } = useTranslation();

  return (
    <Portal>
      <Modal
        testID={testID}
        visible={visible}
        onDismiss={onDismiss}
        style={sheetStyles.wrapper}
        contentContainerStyle={sheetStyles.surface}
        // Le défaut de Paper est la chaîne anglaise en dur `'Close modal'`
        // (`Modal.tsx:107`), ce qu'interdit la règle « aucune chaîne en dur ».
        overlayAccessibilityLabel={t('call.closeSheet')}
      >
        <Text testID={`${testID}-title`} variant="titleSmall" style={sheetStyles.title}>
          {title}
        </Text>
        <ScrollView testID={`${testID}-scroll`} style={sheetStyles.scroll}>
          {children}
        </ScrollView>
      </Modal>
    </Portal>
  );
}
