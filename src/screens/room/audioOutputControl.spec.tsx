import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import { tokens } from 'src/ui/tokens';
import { AudioOutputControl } from './audioOutputControl';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// `BottomSheet` monte sa feuille dans un `Portal`, et `Modal` (react-native-paper)
// lit `useSafeAreaInsets()` (`Modal.tsx:118`). Pas strictement requis ici —
// `SafeAreaProviderCompat`, que `PaperProvider` pose toujours, retombe déjà sur
// des insets à zéro quand aucun fournisseur natif n'a répondu, ce qui couvre les
// environnements de test. Gardé pour documenter l'intention plutôt que de
// compter sur ce repli interne d'une bibliothèque tierce, comme dans
// `cameraMenu.spec.tsx`.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

// `animation.scale` à zéro ramène à zéro la durée des deux animations
// d'opacité que `Modal` lance avec `Animated.timing` — à l'ouverture et à la
// fermeture (`Modal.tsx:117-144`, `duration: scale * DEFAULT_DURATION`, sans
// quoi chacune prendrait 220 ms).
function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

// Le caractère que `MaterialCommunityIcons` dessine réellement pour "check",
// lu depuis la même table que le composant plutôt que recopié à la main —
// même précaution que `cameraMenu.spec.tsx`, pour la même raison.
function codepointFor(glyph: number | string): string {
  return typeof glyph === 'number' ? String.fromCodePoint(glyph) : glyph;
}
const CHECK_GLYPH = codepointFor(MaterialCommunityIcons.glyphMap.check);

describe('AudioOutputControl, mode système', () => {
  it('ouvre le sélecteur de la plateforme sans monter de menu', async () => {
    // Sur iOS, `getAudioOutputs()` est une constante à deux entrées qui ne sont
    // pas des catégories : il n'y a rien à lire et rien à peupler.
    const onSystemPicker = jest.fn();
    const onOpen = jest.fn();

    await render(
      withPaper(
        <AudioOutputControl
          mode="system"
          outputs={['bluetooth', 'speaker']}
          chosen={null}
          onOpen={onOpen}
          onSelect={jest.fn()}
          onSystemPicker={onSystemPicker}
        />,
      ),
    );

    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    expect(onSystemPicker).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.queryByTestId('audio-output-option-speaker')).toBeNull();
    expect(screen.queryByTestId('audio-output-note')).toBeNull();
  });
});

describe('AudioOutputControl, mode menu', () => {
  it("demande une relecture à l'ouverture, jamais au montage", async () => {
    const onOpen = jest.fn();

    await render(
      withPaper(
        <AudioOutputControl
          mode="menu"
          outputs={['bluetooth', 'speaker']}
          chosen={null}
          onOpen={onOpen}
          onSelect={jest.fn()}
          onSystemPicker={jest.fn()}
        />,
      ),
    );
    expect(onOpen).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("n'ouvre pas le sélecteur système en mode menu", async () => {
    // L'autre borne du mode : sans elle, un composant qui appellerait les deux
    // rappels passerait le test du mode système.
    const onSystemPicker = jest.fn();

    await render(
      withPaper(
        <AudioOutputControl
          mode="menu"
          outputs={['bluetooth', 'speaker']}
          chosen={null}
          onOpen={jest.fn()}
          onSelect={jest.fn()}
          onSystemPicker={onSystemPicker}
        />,
      ),
    );

    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    expect(onSystemPicker).not.toHaveBeenCalled();
  });

  it('envoie la catégorie pressée, pas la première de la liste', async () => {
    // Deux catégories, jamais une seule, et la seconde visée.
    const onSelect = jest.fn();

    await render(
      withPaper(
        <AudioOutputControl
          mode="menu"
          outputs={['bluetooth', 'speaker']}
          chosen={null}
          onOpen={jest.fn()}
          onSelect={onSelect}
          onSystemPicker={jest.fn()}
        />,
      ),
    );
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-option-speaker')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('audio-output-option-speaker'));

    expect(onSelect).toHaveBeenCalledWith('speaker');
    expect(onSelect).not.toHaveBeenCalledWith('bluetooth');
  });

  it('coche ce que nous avons demandé, et rien avant un choix', async () => {
    // La coche marque notre propre choix, jamais l'état du système : aucune
    // API ne dit d'où sort le son.
    const view = await render(
      withPaper(
        <AudioOutputControl
          mode="menu"
          outputs={['bluetooth', 'speaker']}
          chosen={null}
          onOpen={jest.fn()}
          onSelect={jest.fn()}
          onSystemPicker={jest.fn()}
        />,
      ),
    );
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-option-speaker')).toBeTruthy());
    expect(screen.queryByTestId('audio-output-check-bluetooth')).toBeNull();
    expect(screen.queryByTestId('audio-output-check-speaker')).toBeNull();

    await view.rerender(
      withPaper(
        <AudioOutputControl
          mode="menu"
          outputs={['bluetooth', 'speaker']}
          chosen="speaker"
          onOpen={jest.fn()}
          onSelect={jest.fn()}
          onSystemPicker={jest.fn()}
        />,
      ),
    );

    await waitFor(() => expect(screen.getByTestId('audio-output-check-speaker')).toBeTruthy());
    expect(screen.queryByTestId('audio-output-check-bluetooth')).toBeNull();
  });

  it("change la ligne d'explication après un choix", async () => {
    // C'est la seule occasion qu'a l'utilisateur d'apprendre qu'il vient de
    // désarmer la bascule automatique pour le reste de la séance.
    const view = await render(
      withPaper(
        <AudioOutputControl
          mode="menu"
          outputs={['bluetooth', 'speaker']}
          chosen={null}
          onOpen={jest.fn()}
          onSelect={jest.fn()}
          onSystemPicker={jest.fn()}
        />,
      ),
    );
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('audio-output-note')).toHaveTextContent('call.outputFollowsDevice'),
    );

    await view.rerender(
      withPaper(
        <AudioOutputControl
          mode="menu"
          outputs={['bluetooth', 'speaker']}
          chosen="speaker"
          onOpen={jest.fn()}
          onSelect={jest.fn()}
          onSystemPicker={jest.fn()}
        />,
      ),
    );

    await waitFor(() =>
      expect(screen.getByTestId('audio-output-note')).toHaveTextContent(
        'call.outputManualUntilEnd',
      ),
    );
  });

  it("s'ouvre sur sa seule explication quand la liste est vide", async () => {
    // Rien n'a échoué : `getAudioOutputs()` rend `[]` tant que la session audio
    // n'est pas ouverte. Pas d'erreur à afficher.
    await render(
      withPaper(
        <AudioOutputControl
          mode="menu"
          outputs={[]}
          chosen={null}
          onOpen={jest.fn()}
          onSelect={jest.fn()}
          onSystemPicker={jest.fn()}
        />,
      ),
    );

    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(screen.getByTestId('audio-output-note')).toBeTruthy());
    // La couleur est explicite depuis `controlBar.ts`, d'autant plus utile que
    // la surface d'un `Modal` est transparente par défaut (voir `Modal.tsx`,
    // `styles.content`).
    expect(screen.getByTestId('audio-output-note')).toHaveStyle({
      color: tokens.color.textDark,
    });
    // La feuille elle-même : `Modal` expose sa `Surface` sous
    // `` `${testID}-surface` `` (`Modal.tsx:219-220`), et `BottomSheet` lui
    // passe `sheetStyles.surface` par `contentContainerStyle`.
    expect(screen.getByTestId('audio-output-sheet-surface')).toHaveStyle({
      backgroundColor: tokens.color.surfaceDark,
    });
  });

  // Même défaut que celui trouvé et corrigé en revue de la tâche 4
  // (`cameraMenu.tsx`, commit 607f6f5, « Important 1 ») : un `leadingIcon`
  // fonction qui rend un `View` vide n'affiche jamais rien, quelle que soit la
  // couleur passée dans son style — `Icon.tsx` (react-native-paper) appelle
  // `s({ color, size, direction, testID })`, mais rien n'oblige la fonction à
  // lire cet argument, et un `View` sans fond ni contenu reste de toute façon
  // invisible. RNTL ne rend pas les couleurs, donc ce test ne peut garder
  // qu'un vrai glyphe est dessiné et qu'il porte une couleur explicite —
  // jamais qu'il est lisible.
  it('dessine un vrai glyphe pour la coche, jamais une boîte vide', async () => {
    await render(
      withPaper(
        <AudioOutputControl
          mode="menu"
          outputs={['bluetooth', 'speaker']}
          chosen="speaker"
          onOpen={jest.fn()}
          onSelect={jest.fn()}
          onSystemPicker={jest.fn()}
        />,
      ),
    );
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    const check = await waitFor(() => screen.getByTestId('audio-output-check-speaker'));

    expect(check.props.children[0]).toBe(CHECK_GLYPH);
    expect(check).toHaveStyle({ color: tokens.color.textDark });
  });

  // Aucun des tests ci-dessus ne lit le texte affiché par une ligne, seulement
  // son testID et l'effet de sa pression (« envoie la catégorie pressée »).
  // Un menu qui afficherait toujours le nom de la première sortie, ou celui de
  // `chosen`, passerait donc les huit tests précédents sans broncher — le même
  // angle mort qui a laissé passer un identifiant de caméra brut affiché à la
  // place d'un nom en tâche 4 (Important 2), transposé au choix de la ligne
  // plutôt qu'à l'interpolation d'un champ. Deux sorties distinctes, visées
  // toutes les deux.
  it('affiche le nom propre à chaque sortie, jamais un nom figé', async () => {
    await render(
      withPaper(
        <AudioOutputControl
          mode="menu"
          outputs={['bluetooth', 'speaker']}
          chosen={null}
          onOpen={jest.fn()}
          onSelect={jest.fn()}
          onSystemPicker={jest.fn()}
        />,
      ),
    );
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-option-speaker')).toBeTruthy());

    expect(screen.getByText('call.output.bluetooth')).toBeTruthy();
    expect(screen.getByText('call.output.speaker')).toBeTruthy();
  });
});
