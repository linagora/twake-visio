import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import type { AudioDeviceChoice } from 'src/call/audioDevices';
import { SHEET_SURFACE_COLOR } from 'src/screens/room/bottomSheet';
import { SHEET_CHECK_COLOR } from 'src/screens/room/sheetCheck';
import { ROW_REST_COLOR, ROW_SELECTED_COLOR } from 'src/screens/room/sheetRow';
import { tokens } from 'src/ui/tokens';
import { AudioOutputControl, type AudioOutputControlProps } from './audioOutputControl';

// `t: (key) => key` ignore son second argument : il ne peut donc pas distinguer
// `t('call.outputNumbered', { name, index })` de la même clé appelée avec
// n'importe quoi d'autre. `mockT` interpole réellement, comme
// `cameraMenu.spec.tsx` et `waitingBanner.spec.tsx` pour la même raison.
const mockT = jest.fn((key: string, options?: { name?: string; index?: number }) =>
  options !== undefined ? `${key}:${options.name}:${options.index}` : key,
);

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
}));

// `BottomSheet` monte sa feuille dans un `Portal`, et `Modal` (react-native-paper)
// lit `useSafeAreaInsets()` (`Modal.tsx:118`). Pas strictement requis ici —
// `SafeAreaProviderCompat`, que `PaperProvider` pose toujours, retombe déjà sur
// des insets à zéro quand aucun fournisseur natif n'a répondu, ce qui couvre les
// environnements de test. Gardé pour documenter l'intention plutôt que de
// compter sur ce repli interne d'une bibliothèque tierce.
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

const TESLA: AudioDeviceChoice = {
  id: 7,
  kind: 'bluetooth',
  name: 'Tesla Model 3',
  nameKey: 'call.output.bluetooth',
  ordinal: null,
};

const SPEAKER: AudioDeviceChoice = {
  id: 2,
  kind: 'speaker',
  name: null,
  nameKey: 'call.output.speaker',
  ordinal: null,
};

function props(overrides: Partial<AudioOutputControlProps> = {}): AudioOutputControlProps {
  return {
    mode: 'devices',
    outputs: [],
    chosen: null,
    devices: [TESLA, SPEAKER],
    currentDeviceId: null,
    manual: false,
    onOpen: jest.fn(),
    onSelect: jest.fn(),
    onSelectDevice: jest.fn(),
    onAutomatic: jest.fn(),
    onSystemPicker: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  mockT.mockClear();
});

describe('AudioOutputControl, mode système', () => {
  it('ouvre le sélecteur de la plateforme sans monter de feuille', async () => {
    // Sur iOS, `getAudioOutputs()` est une constante à deux entrées qui ne sont
    // pas des catégories : il n'y a rien à lire et rien à peupler. Le module
    // natif de ce lot est Android seulement, et rien ici ne le change.
    const onSystemPicker = jest.fn();
    const onOpen = jest.fn();

    await render(
      withPaper(<AudioOutputControl {...props({ mode: 'system', onSystemPicker, onOpen })} />),
    );

    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    expect(onSystemPicker).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.queryByTestId('audio-output-device-7')).toBeNull();
    expect(screen.queryByTestId('audio-output-note')).toBeNull();
  });
});

describe('AudioOutputControl, mode catégories', () => {
  it('rend une ligne par catégorie, jamais une ligne par appareil', async () => {
    // L'autre polarité du choix de liste : sous le plancher API 31 le module
    // natif est absent et la feuille retombe EXACTEMENT sur ce qu'elle
    // affichait avant ce lot.
    await render(
      withPaper(
        <AudioOutputControl
          {...props({ mode: 'menu', outputs: ['bluetooth', 'speaker'], devices: [TESLA, SPEAKER] })}
        />,
      ),
    );

    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-option-speaker')).toBeTruthy());

    expect(screen.getByTestId('audio-output-option-bluetooth')).toBeTruthy();
    expect(screen.queryByTestId('audio-output-device-7')).toBeNull();
  });

  it('envoie la catégorie pressée, pas la première de la liste, et referme', async () => {
    const onSelect = jest.fn();

    await render(
      withPaper(
        <AudioOutputControl
          {...props({ mode: 'menu', outputs: ['bluetooth', 'speaker'], onSelect })}
        />,
      ),
    );
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-option-speaker')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('audio-output-option-speaker'));

    expect(onSelect).toHaveBeenCalledWith('speaker');
    expect(onSelect).not.toHaveBeenCalledWith('bluetooth');
    await waitFor(() => expect(screen.queryByTestId('audio-output-option-speaker')).toBeNull());
  });

  it("coche la catégorie demandée, faute d'état constaté sur ce chemin", async () => {
    await render(
      withPaper(
        <AudioOutputControl
          {...props({ mode: 'menu', outputs: ['bluetooth', 'speaker'], chosen: 'speaker' })}
        />,
      ),
    );

    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(screen.getByTestId('audio-output-check-speaker')).toBeTruthy());
    expect(screen.queryByTestId('audio-output-check-bluetooth')).toBeNull();
  });

  it("n'offre PAS le retour à l'automatique, même après un choix manuel", async () => {
    // La seconde polarité de `mode === 'devices' && manual` : AudioSwitch ne
    // sait pas revenir en automatique — `setUserSelectedAudioDevice` y est
    // `protected` —, donc offrir la commande sur ce chemin serait un bouton
    // qui ne fait rien.
    await render(
      withPaper(
        <AudioOutputControl
          {...props({ mode: 'menu', outputs: ['speaker'], chosen: 'speaker', manual: true })}
        />,
      ),
    );

    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-option-speaker')).toBeTruthy());

    expect(screen.queryByTestId('audio-output-automatic')).toBeNull();
  });
});

describe('AudioOutputControl, mode appareils', () => {
  it("demande une relecture à l'ouverture, jamais au montage", async () => {
    const onOpen = jest.fn();

    await render(withPaper(<AudioOutputControl {...props({ onOpen })} />));
    expect(onOpen).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("n'ouvre pas le sélecteur système", async () => {
    // L'autre borne du mode : sans elle, un composant qui appellerait les deux
    // rappels passerait le test du mode système.
    const onSystemPicker = jest.fn();

    await render(withPaper(<AudioOutputControl {...props({ onSystemPicker })} />));

    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    expect(onSystemPicker).not.toHaveBeenCalled();
  });

  it("affiche le nom lu de l'appareil, et la catégorie quand il n'y en a pas", async () => {
    // Les deux polarités de `device.name ?? t(nameKey)`. Sans la seconde, un
    // composant qui afficherait toujours `name` rendrait une ligne vide pour
    // le haut-parleur intégré.
    await render(withPaper(<AudioOutputControl {...props()} />));

    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-device-2')).toBeTruthy());

    expect(screen.getByTestId('audio-output-device-7-title')).toHaveTextContent('Tesla Model 3');
    expect(screen.getByTestId('audio-output-device-2-title')).toHaveTextContent(
      'call.output.speaker',
    );
  });

  it("numérote quand l'appareil porte un ordinal, jamais sinon", async () => {
    // Les deux polarités de `device.ordinal === null`, et `mockT` interpole
    // réellement : un composant qui passerait l'identifiant à la place du nom
    // rendrait « call.outputNumbered:7:1 » et ce test rougirait.
    await render(
      withPaper(
        <AudioOutputControl
          {...props({
            devices: [{ ...TESLA, name: 'Jabra Evolve2', ordinal: 2 }, SPEAKER],
          })}
        />,
      ),
    );

    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-device-2')).toBeTruthy());

    expect(screen.getByTestId('audio-output-device-7-title')).toHaveTextContent(
      'call.outputNumbered:Jabra Evolve2:2',
    );
    expect(screen.getByTestId('audio-output-device-2-title')).toHaveTextContent(
      'call.output.speaker',
    );
  });

  it("coche l'appareil CONSTATÉ, pas celui qu'on a demandé", async () => {
    // C'est le gain que le module natif apporte et que le périmètre A ne
    // pouvait pas avoir : `getCommunicationDevice()` dit où le son part
    // vraiment. Les deux polarités, sur deux appareils distincts.
    const view = await render(withPaper(<AudioOutputControl {...props()} />));
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-device-2')).toBeTruthy());
    expect(screen.queryByTestId('audio-output-check-7')).toBeNull();
    expect(screen.queryByTestId('audio-output-check-2')).toBeNull();

    await view.rerender(withPaper(<AudioOutputControl {...props({ currentDeviceId: 7 })} />));

    await waitFor(() => expect(screen.getByTestId('audio-output-check-7')).toBeTruthy());
    expect(screen.queryByTestId('audio-output-check-2')).toBeNull();
  });

  it("envoie l'appareil pressé, pas le premier de la liste", async () => {
    // Deux appareils, jamais un seul, et le second visé.
    const onSelectDevice = jest.fn();

    await render(withPaper(<AudioOutputControl {...props({ onSelectDevice })} />));
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-device-2')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('audio-output-device-2'));

    expect(onSelectDevice).toHaveBeenCalledWith(SPEAKER);
    expect(onSelectDevice).not.toHaveBeenCalledWith(TESLA);
  });

  it('referme la feuille après un choix', async () => {
    // La SECONDE instruction du même gestionnaire. `Modal` ne démonte qu'après
    // sa propre animation de fermeture asynchrone (`hideModalAnimation`,
    // `Modal.tsx:131-144`), d'où le `waitFor`.
    await render(withPaper(<AudioOutputControl {...props()} />));
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-device-2')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('audio-output-device-2'));

    await waitFor(() => expect(screen.queryByTestId('audio-output-device-2')).toBeNull());
  });

  it("change la ligne d'explication après un choix manuel", async () => {
    // C'est la seule occasion qu'a l'utilisateur d'apprendre qu'il vient de
    // désarmer la bascule automatique.
    const view = await render(withPaper(<AudioOutputControl {...props()} />));
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('audio-output-note')).toHaveTextContent('call.outputFollowsDevice'),
    );

    await view.rerender(withPaper(<AudioOutputControl {...props({ manual: true })} />));

    await waitFor(() =>
      expect(screen.getByTestId('audio-output-note')).toHaveTextContent(
        'call.outputManualUntilEnd',
      ),
    );
  });

  it("n'offre le retour à l'automatique qu'une fois un choix manuel fait", async () => {
    // Masquer une commande indisponible, jamais la griser : `disabled` ferait
    // revenir le quasi-noir sur fond sombre que `IconButton/utils.ts:88-93`
    // impose avant toute couleur explicite.
    const view = await render(withPaper(<AudioOutputControl {...props()} />));
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-device-2')).toBeTruthy());
    expect(screen.queryByTestId('audio-output-automatic')).toBeNull();

    await view.rerender(withPaper(<AudioOutputControl {...props({ manual: true })} />));

    await waitFor(() => expect(screen.getByTestId('audio-output-automatic')).toBeTruthy());
  });

  it("rend la route au système, et referme, quand on revient à l'automatique", async () => {
    // Les DEUX instructions du gestionnaire, une assertion chacune.
    const onAutomatic = jest.fn();

    await render(withPaper(<AudioOutputControl {...props({ manual: true, onAutomatic })} />));
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-automatic')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('audio-output-automatic'));

    expect(onAutomatic).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId('audio-output-automatic')).toBeNull());
  });

  it("s'ouvre sur sa seule explication quand la liste est vide", async () => {
    // Rien n'a échoué : la liste est vide tant que la route n'est pas prise.
    await render(withPaper(<AudioOutputControl {...props({ devices: [] })} />));

    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(screen.getByTestId('audio-output-note')).toBeTruthy());
    // La couleur est explicite depuis `controlBar.ts`, d'autant plus utile que
    // la surface d'un `Modal` est transparente par défaut (`Modal.tsx`,
    // `styles.content`).
    expect(screen.getByTestId('audio-output-note')).toHaveStyle({
      color: tokens.color.textDark,
    });
    // La feuille elle-même : `Modal` expose sa `Surface` sous
    // `` `${testID}-surface` `` (`Modal.tsx:219-220`).
    expect(screen.getByTestId('audio-output-sheet-surface')).toHaveStyle({
      backgroundColor: SHEET_SURFACE_COLOR,
    });
  });

  it('force une couleur explicite sur le titre de chaque ligne', async () => {
    // Sans elle, Paper retombe sur `theme.colors.onSurface`, que `makeTheme`
    // rend TOUJOURS clair depuis le Lot 1 de la refonte — un quasi-noir — sur
    // un fond que `call.tsx` force sombre. Ce n'était « le défaut de la plupart
    // des appareils » que tant que le thème suivait le schéma système.
    await render(withPaper(<AudioOutputControl {...props({ manual: true })} />));

    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-device-2')).toBeTruthy());

    expect(screen.getByTestId('audio-output-device-7-title')).toHaveStyle({
      color: tokens.color.textDark,
    });
    expect(screen.getByTestId('audio-output-automatic-title')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });

  it('dessine un vrai glyphe pour la coche, jamais une boîte vide', async () => {
    // RNTL ne rend pas les couleurs : ce test ne peut garder qu'un vrai glyphe
    // est dessiné et qu'il porte une couleur explicite — jamais qu'il est
    // lisible.
    await render(withPaper(<AudioOutputControl {...props({ currentDeviceId: 7 })} />));
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    const check = await waitFor(() => screen.getByTestId('audio-output-check-7'));

    expect(check.props.children[0]).toBe(CHECK_GLYPH);
    expect(check).toHaveStyle({ color: SHEET_CHECK_COLOR });
  });

  // Le lavis sur le chemin 'devices'. Trois lignes visées d'un coup : celle qui
  // est constatée courante, une autre qui ne l'est pas, et le retour à
  // l'automatique — qui ne passe aucun `selected` et doit donc rester au repos.
  // Sans cette troisième, un `selected` figé à vrai passerait les deux autres.
  it('lave la ligne de l’appareil courant, et elle seule', async () => {
    await render(
      withPaper(<AudioOutputControl {...props({ currentDeviceId: 7, manual: true })} />),
    );
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(screen.getByTestId('audio-output-automatic')).toBeTruthy());
    expect(screen.getByTestId('audio-output-device-7')).toHaveStyle({
      backgroundColor: ROW_SELECTED_COLOR,
    });
    expect(screen.getByTestId('audio-output-device-2')).toHaveStyle({
      backgroundColor: ROW_REST_COLOR,
    });
    expect(screen.getByTestId('audio-output-automatic')).toHaveStyle({
      backgroundColor: ROW_REST_COLOR,
    });
  });

  // Le MÊME motif sur l'autre chemin, et c'est un second site d'appel : les
  // deux branches de `mode === 'devices' ? … : …` sont structurellement
  // identiques et mutent indépendamment. La leçon d'`AGENTS.md` — écrire les
  // tableaux de mutations par motif, puis les multiplier par les fichiers (ici
  // par les branches) qui l'instancient — vaut aussi à l'intérieur d'un fichier.
  it('lave la catégorie choisie sur le chemin des catégories', async () => {
    await render(
      withPaper(
        <AudioOutputControl
          {...props({
            mode: 'menu',
            outputs: ['speaker', 'bluetooth'],
            chosen: 'bluetooth',
            devices: [],
          })}
        />,
      ),
    );
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(screen.getByTestId('audio-output-option-bluetooth')).toBeTruthy());
    expect(screen.getByTestId('audio-output-option-bluetooth')).toHaveStyle({
      backgroundColor: ROW_SELECTED_COLOR,
    });
    expect(screen.getByTestId('audio-output-option-speaker')).toHaveStyle({
      backgroundColor: ROW_REST_COLOR,
    });
  });
});
