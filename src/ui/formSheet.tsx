import React from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, StyleSheet, Text, View } from 'react-native';
import { Modal, Portal } from 'react-native-paper';

import { keyboardMode } from 'src/ui/keyboard';
import { tokens } from 'src/ui/tokens';

type Props = {
  readonly visible: boolean;
  readonly title: string;
  // `onSheetDismiss`, jamais `onDismiss` : un nom repris d'un événement du
  // composant hôte serait trouvé par `fireEvent` sur notre propre fibre.
  readonly onSheetDismiss: () => void;
  readonly children: React.ReactNode;
  readonly testID: string;
};

// Une feuille CLAIRE qui accepte une saisie.
//
// Elle ne remplace pas `src/screens/room/bottomSheet.tsx` et ne le touche pas.
// Les deux diffèrent sur les deux points qui comptent :
//
// — `BottomSheet` est une surface SOMBRE, conçue pour être posée sur l'écran
//   d'appel. Celle-ci est claire, posée sur la coque.
// — `BottomSheet` porte dans son en-tête une précondition explicite : « ne
//   jamais placer un `TextInput` dans une feuille avant qu'un évitement de
//   clavier y soit ajouté ». Il n'en a pas. Celle-ci en a un, et c'est sa
//   raison d'exister — la feuille « Rejoindre » est ENTIÈREMENT une saisie.
//
// Y ajouter l'évitement plutôt que d'écrire ce fichier aurait touché un fichier
// que cinq branches en vol modifient, et `src/ui/keyboard.ts` que neuf
// modifient. On ne fait que LIRE ce dernier.
//
// Ce que `Modal` apporte sans qu'on l'écrive : l'appui sur le fond referme, le
// bouton retour d'Android aussi, les encarts de zone sûre sont reportés en
// marges, et rien n'est monté à l'état fermé (`Modal.tsx:182`) — d'où les
// assertions `queryByTestId(…) → null` du spec.
export function FormSheet({
  visible,
  title,
  onSheetDismiss,
  children,
  testID,
}: Props): React.ReactElement {
  const { t } = useTranslation();

  return (
    <Portal>
      <Modal
        contentContainerStyle={styles.surface}
        onDismiss={onSheetDismiss}
        // Le défaut de Paper est la chaîne anglaise en dur `'Close modal'`
        // (`Modal.tsx:107`), ce qu'interdit la règle « aucune chaîne en dur ».
        overlayAccessibilityLabel={t('join.close')}
        style={styles.wrapper}
        testID={testID}
        visible={visible}
      >
        {/* `keyboardMode()` rend `'resize'` sur Android, qui n'est PAS une
            valeur de `behavior` : elle veut dire « ne rien faire », la fenêtre
            y étant déjà redimensionnée (`src/ui/keyboard.ts:3-7`). D'où le
            ternaire, repris tel quel de `call.tsx:919` plutôt que réinventé —
            passer la valeur directement ne compile pas.

            `behavior` est par ailleurs une prop que `KeyboardAvoidingView`
            CONSOMME : elle n'atteint jamais l'élément hôte, donc aucune
            assertion dessus — elle serait verte dans les deux états. C'est
            l'une des trois instances de cette borne mesurées dans `AGENTS.md`. */}
        <KeyboardAvoidingView
          behavior={keyboardMode() === 'padding' ? 'padding' : undefined}
          style={styles.avoider}
        >
          <View style={styles.handle} testID={`${testID}-handle`} />
          <Text style={styles.title} testID={`${testID}-title`}>
            {title}
          </Text>
          {children}
        </KeyboardAvoidingView>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  avoider: { gap: 16 },
  // La poignée du mockup : 42 × 4, centrée.
  handle: {
    alignSelf: 'center',
    backgroundColor: tokens.color.fieldBorder,
    borderRadius: 3,
    height: 4,
    marginBottom: 2,
    marginTop: 6,
    width: 42,
  },
  // Le fond de la feuille. Sans lui, le `contentContainerStyle` d'un `Modal`
  // est TRANSPARENT (`Modal.tsx:243-246`) : ce n'est pas une précaution, c'est
  // une obligation.
  surface: {
    backgroundColor: tokens.color.cardSurface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingBottom: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  title: {
    color: tokens.color.textPrimary,
    fontFamily: tokens.font.extraBold,
    fontSize: 20,
  },
  // Collée en bas, pleine largeur.
  wrapper: { justifyContent: 'flex-end', margin: 0 },
});
