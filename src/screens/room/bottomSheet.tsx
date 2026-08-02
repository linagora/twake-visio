import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Modal, Portal } from 'react-native-paper';

import { tokens } from 'src/ui/tokens';

// — La palette sombre des feuilles de l'écran d'appel —
//
// Elle vit ICI et non dans `src/ui/tokens` pour une raison de découpage, pas de
// conception : `src/ui/` appartient au lot d'intégration, que quatre sous-lots
// modifient en parallèle. Ces trois valeurs sont relevées sur le mockup de
// l'écran d'appel et n'ont aucun consommateur hors des feuilles ; elles
// rejoindront `tokens.color` quand l'intégration rassemblera les quatre.
//
// Elles sont EXPORTÉES parce que quatre spécifications gardent le fond de leur
// propre feuille (`moreMenu`, `cameraMenu` par `camera-sheet`,
// `audioOutputControl`, `participantsPanel`) : une constante nommée s'y assertit
// sans recopier un hexadécimal dans quatre fichiers, comme `stage.spec.tsx`
// importe déjà `GRID_GAP`.
//
// `Modal` pose `backgroundColor: 'transparent'` sur sa `Surface`
// (`Modal.tsx:243-246`). Ce fond n'est donc pas une précaution de contraste,
// c'est une obligation : sans lui la feuille n'a aucun fond. 14,79:1 avec
// `textDark` (#ECECEC) — au-dessus du seuil AA de 4,5:1 pour du texte.
//
// #151B18 plutôt que `surfaceDark` (#121212) : le mockup teinte toute sa
// palette sombre de vert — la feuille, la bulle reçue du chat (#232B27), le
// lavis de sélection — là où `surfaceDark` est un gris neutre. La feuille
// appartient ainsi à la même famille que ce qu'elle contient, et se détache un
// peu du `backgroundDark` (#0B0B0C) de la scène derrière elle.
export const SHEET_SURFACE_COLOR = '#151B18';

// La poignée, seule affordance qui dise « ceci se referme d'un geste ». Elle ne
// porte AUCUNE information — le fond et le bouton retour d'Android referment
// déjà — donc WCAG 1.4.11 ne s'y applique pas et la valeur du mockup est
// conservée telle quelle.
export const SHEET_HANDLE_COLOR = 'rgba(255, 255, 255, 0.22)';

// Relevés sur le mockup. Aucun jeton ne les porte : `tokens.radius` s'arrête à
// `card` (18), et 42×4 n'est ni une taille ni un espacement du système. Nommés
// plutôt qu'écrits dans la feuille de style, pour que la spécification puisse
// les citer sans les recopier.
const SHEET_RADIUS = 26;
const HANDLE_WIDTH = 42;
const HANDLE_HEIGHT = 4;
const HANDLE_RADIUS = 3;

const styles = StyleSheet.create({
  // La seule ligne qui fait la feuille. `Modal` pose son enveloppe en
  // `absoluteFill` avec `justifyContent: 'center'` (`Modal.tsx:238-241`) et
  // applique la prop `style` APRÈS elle (`Modal.tsx:210-215`) : `flex-end`
  // gagne donc, et colle la surface au bas de l'écran.
  wrapper: { justifyContent: 'flex-end' },
  surface: {
    backgroundColor: SHEET_SURFACE_COLOR,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    paddingTop: tokens.spacing.sm,
    paddingBottom: tokens.spacing.md,
    // `Menu` bornait sa hauteur (`Menu.tsx:496-539`) ; `Modal` ne borne rien.
    // Sans cette ligne, une feuille assez longue — la file des mains levées est
    // la seule ici qui n'a aucune limite en amont — pousse son propre titre
    // hors de l'écran, et rien ne permet de l'y ramener. 80 % laisse toujours
    // voir la scène derrière, ce qui dit qu'on est dans une feuille et non sur
    // un nouvel écran.
    maxHeight: '80%',
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: SHEET_HANDLE_COLOR,
    borderRadius: HANDLE_RADIUS,
    height: HANDLE_HEIGHT,
    marginBottom: tokens.spacing.sm,
    width: HANDLE_WIDTH,
  },
  // `flexShrink: 1` et non `flex: 1` : la feuille doit rester HAUTE COMME SON
  // CONTENU tant qu'il tient, et ne se contraindre qu'au-delà. Avec `flex: 1`,
  // une feuille de deux lignes occuperait d'emblée 80 % de l'écran.
  scroll: { flexShrink: 1 },
  // Le titre de la feuille. Il porte son propre espacement plutôt que celui
  // d'une ligne : une ligne est pressable et veut une cible haute, un titre ne
  // l'est pas.
  //
  // Un `Text` de react-native, plus celui de Paper : le mockup fixe la taille
  // ET la graisse, donc plus rien ne reste à hériter d'une `variant` — et
  // `variant="titleSmall"` continuerait de poser un `fontWeight: '500'` que
  // `Manrope_800ExtraBold` contredirait. Même choix que `src/ui/sectionLabel.tsx`
  // et `src/ui/settingRow.tsx`, restylés au Lot 1.
  title: {
    color: tokens.color.textDark,
    fontFamily: tokens.font.extraBold,
    fontSize: 20,
    lineHeight: 26,
    paddingBottom: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.md,
  },
});

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
//   D'où le `maxHeight` de `styles.surface` et le `ScrollView` ci-dessous :
//   sans eux, une liste assez longue pousse le haut de la feuille hors de
//   l'écran, SANS moyen de l'y ramener. Calculé depuis les métriques MD3 de
//   Paper (~240 dp fixes, ~32 dp par ligne), le seuil tombait à environ onze
//   mains levées en portrait et **trois en paysage** — et le paysage est de
//   première classe ici (`app.json` : `"orientation": "default"`).
//
//   `handControl.tsx` mappe la file sans aucune borne, et rien n'en pose une en
//   amont. C'est donc la coquille qui doit tenir, pas ses appelants.
//
// La poignée et le titre restent HORS du défilement : ce qui nomme la feuille,
// et ce qui dit comment la refermer, ne doivent pas pouvoir sortir de l'écran
// quand son contenu s'allonge.
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
        style={styles.wrapper}
        contentContainerStyle={styles.surface}
        // Le défaut de Paper est la chaîne anglaise en dur `'Close modal'`
        // (`Modal.tsx:107`), ce qu'interdit la règle « aucune chaîne en dur ».
        overlayAccessibilityLabel={t('call.closeSheet')}
      >
        {/* Décorative, et rien d'autre : le geste de glissement n'existe pas —
            `Modal` n'a aucun `PanResponder`. Elle n'est donc pas rendue
            pressable, ce qui poserait une cible qui ne ferait rien. Le fond et
            le bouton retour d'Android restent les deux façons de refermer, et
            le fond porte déjà l'étiquette traduite ci-dessus. */}
        <View testID={`${testID}-handle`} style={styles.handle} />
        <Text testID={`${testID}-title`} style={styles.title}>
          {title}
        </Text>
        <ScrollView testID={`${testID}-scroll`} style={styles.scroll}>
          {children}
        </ScrollView>
      </Modal>
    </Portal>
  );
}
