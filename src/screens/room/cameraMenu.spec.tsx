import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import type { CameraChoice } from 'src/call/devices';
import { tokens } from 'src/ui/tokens';
import { SHEET_CHECK_COLOR } from 'src/screens/room/sheetCheck';
import { ROW_REST_COLOR, ROW_SELECTED_COLOR } from 'src/screens/room/sheetRow';
import { CameraMenu } from './cameraMenu';

// I2 : `t: (key) => key` ignore son second argument. Il ne peut donc pas
// distinguer `t('call.cameraNumbered', { name: t(camera.nameKey), index })`
// de la même clé appelée avec `name: camera.deviceId` — l'utilisateur lirait
// alors un identifiant Camera2 brut à la place du nom de sa caméra, sans
// qu'aucun test ne rougisse. `mockT` interpole réellement, comme
// `waitingBanner.spec.tsx` pour cette même raison.
const mockT = jest.fn((key: string, options?: { name?: string; index?: number }) =>
  options !== undefined ? `${key}:${options.name}:${options.index}` : key,
);

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
}));

// Le compte de fonds vient du module natif, absent sous Jest — il rendrait 0,
// donc AUCUNE vignette, et « les huit fonds sont rendus » passerait à vide.
jest.mock('src/call/backgroundEffect', () => ({
  backgroundCount: () => 8,
}));

// `BottomSheet` monte sa feuille dans un `Portal`, et `Modal` (react-native-paper)
// lit `useSafeAreaInsets()` (`Modal.tsx:118`). Pas strictement requis ici —
// `SafeAreaProviderCompat`, que `PaperProvider` pose toujours, retombe déjà sur
// des insets à zéro quand aucun fournisseur natif n'a répondu, ce qui couvre les
// environnements de test (vérifié : les neuf tests de ce fichier restent verts
// sans ce double). Il reste posé pour documenter l'intention plutôt que de
// compter sur ce repli interne, comme dans `bottomSheet.spec.tsx` (tâche 1).
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
// lu depuis la même table que le composant plutôt que recopié à la main : un
// caractère de zone privée Unicode codé en dur serait illisible et fragile
// face à un changement de police. `Icon.tsx` (react-native-paper) ne le
// reçoit jamais — la coche court-circuite sa résolution habituelle — donc
// c'est bien ce glyphe-ci, et nul autre, que la coche doit produire.
function codepointFor(glyph: number | string): string {
  return typeof glyph === 'number' ? String.fromCodePoint(glyph) : glyph;
}
const CHECK_GLYPH = codepointFor(MaterialCommunityIcons.glyphMap.check);

const FRONT: CameraChoice = {
  deviceId: 'cam-front',
  facing: 'user',
  nameKey: 'call.cameraFront',
  ordinal: null,
};

const BACK: CameraChoice = {
  deviceId: 'cam-back',
  facing: 'environment',
  nameKey: 'call.cameraBack',
  ordinal: null,
};

describe('CameraMenu', () => {
  it("n'appelle pas onOpen au montage, et n'affiche rien", async () => {
    // La liste est relue à l'ouverture, et à ce moment seulement : c'est le
    // seul instant où l'utilisateur regarde. Une relecture au montage
    // énumérerait les caméras de toute séance, ouverte ou non.
    const onOpen = jest.fn();

    await render(
      withPaper(
        <CameraMenu
          cameras={[FRONT, BACK]}
          activeDeviceId={null}
          onOpen={onOpen}
          onSelect={jest.fn()}
          effect={null}
          onEffectSelect={jest.fn()}
        />,
      ),
    );

    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.queryByTestId('camera-option-cam-back')).toBeNull();
  });

  it("demande une relecture à l'ouverture", async () => {
    const onOpen = jest.fn();

    await render(
      withPaper(
        <CameraMenu
          cameras={[FRONT, BACK]}
          activeDeviceId={null}
          onOpen={onOpen}
          onSelect={jest.fn()}
          effect={null}
          onEffectSelect={jest.fn()}
        />,
      ),
    );
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('rend la caméra pressée, pas la première de la liste', async () => {
    // Deux caméras, jamais une seule, et la seconde visée : avec une seule,
    // « transmet la ligne pressée » et « renvoie toujours la première » seraient
    // indiscernables.
    const onSelect = jest.fn();

    await render(
      withPaper(
        <CameraMenu
          cameras={[FRONT, BACK]}
          activeDeviceId={null}
          onOpen={jest.fn()}
          onSelect={onSelect}
          effect={null}
          onEffectSelect={jest.fn()}
        />,
      ),
    );
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));
    await waitFor(() => expect(screen.getByTestId('camera-option-cam-back')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('camera-option-cam-back'));

    // Le `CameraChoice` entier, pas seulement son `deviceId` : l'écran a besoin
    // de `facing` pour le miroir de sa propre vignette.
    expect(onSelect).toHaveBeenCalledWith(BACK);
    expect(onSelect).not.toHaveBeenCalledWith(FRONT);
  });

  // Trouvé manquant par mutation (tâche 3) : retirer `setVisible(false)` du
  // gestionnaire d'appui ne faisait rougir aucun test existant, alors qu'un
  // `onPress` sans lui laisserait la feuille ouverte après un choix. `Modal`
  // ne démonte qu'après sa propre animation de fermeture asynchrone
  // (`hideModalAnimation`, `Modal.tsx:131-144` : le callback de fin de
  // `Animated.timing` retarde `setVisibleInternal(false)`), d'où le `waitFor`
  // plutôt qu'une assertion synchrone.
  it('referme la feuille après un choix', async () => {
    await render(
      withPaper(
        <CameraMenu
          cameras={[FRONT, BACK]}
          activeDeviceId={null}
          onOpen={jest.fn()}
          onSelect={jest.fn()}
          effect={null}
          onEffectSelect={jest.fn()}
        />,
      ),
    );
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));
    await waitFor(() => expect(screen.getByTestId('camera-option-cam-back')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('camera-option-cam-back'));

    await waitFor(() => expect(screen.queryByTestId('camera-option-cam-back')).toBeNull());
  });

  it('coche la caméra active, et elle seule', async () => {
    await render(
      withPaper(
        <CameraMenu
          cameras={[FRONT, BACK]}
          activeDeviceId="cam-back"
          onOpen={jest.fn()}
          onSelect={jest.fn()}
          effect={null}
          onEffectSelect={jest.fn()}
        />,
      ),
    );
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));

    await waitFor(() => expect(screen.getByTestId('camera-check-cam-back')).toBeTruthy());
    expect(screen.queryByTestId('camera-check-cam-front')).toBeNull();
  });

  // I1 : la coche était un `View` 24×24 sans fond ni contenu — un `leadingIcon`
  // fonction n'est jamais appelé avec la couleur que `Menu.Item` calculerait
  // pour un `leadingIcon` chaîne, et un `View` vide reste invisible quelle que
  // soit la couleur qu'on lui passerait de toute façon. RNTL ne rend pas les
  // couleurs, donc ce test ne peut pas garder un contraste — seulement qu'un
  // vrai glyphe est dessiné (pas une boîte vide) et qu'il porte une couleur
  // explicite issue des tokens.
  it('dessine un vrai glyphe pour la coche, jamais une boîte vide', async () => {
    await render(
      withPaper(
        <CameraMenu
          cameras={[FRONT, BACK]}
          activeDeviceId="cam-back"
          onOpen={jest.fn()}
          onSelect={jest.fn()}
          effect={null}
          onEffectSelect={jest.fn()}
        />,
      ),
    );
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));

    const check = await waitFor(() => screen.getByTestId('camera-check-cam-back'));

    expect(check.props.children[0]).toBe(CHECK_GLYPH);
    expect(check).toHaveStyle({ color: SHEET_CHECK_COLOR });
  });

  // Le lavis, l'autre moitié de ce qui dit « celle-ci ». Deux caméras et UNE
  // seule active : la ligne active porte le lavis, l'autre le fond de repos.
  // Avec une seule caméra, un `selected` figé à vrai passerait.
  //
  // Ce test-ci garde le CÂBLAGE — que le lavis suive bien `activeDeviceId` —,
  // là où `sheetRow.spec.tsx` garde la bascule elle-même. Une mutation de
  // `selected={…}` vers `selected={false}` ne rougirait que là.
  it('lave la ligne de la caméra active, et elle seule', async () => {
    await render(
      withPaper(
        <CameraMenu
          cameras={[FRONT, BACK]}
          activeDeviceId="cam-back"
          onOpen={jest.fn()}
          onSelect={jest.fn()}
          effect={null}
          onEffectSelect={jest.fn()}
        />,
      ),
    );
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));

    await waitFor(() => expect(screen.getByTestId('camera-option-cam-back')).toBeTruthy());
    expect(screen.getByTestId('camera-option-cam-back')).toHaveStyle({
      backgroundColor: ROW_SELECTED_COLOR,
    });
    expect(screen.getByTestId('camera-option-cam-front')).toHaveStyle({
      backgroundColor: ROW_REST_COLOR,
    });
  });

  it("ne coche rien quand aucune caméra n'est connue", async () => {
    await render(
      withPaper(
        <CameraMenu
          cameras={[FRONT, BACK]}
          activeDeviceId={null}
          onOpen={jest.fn()}
          onSelect={jest.fn()}
          effect={null}
          onEffectSelect={jest.fn()}
        />,
      ),
    );
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));
    await waitFor(() => expect(screen.getByTestId('camera-option-cam-back')).toBeTruthy());

    expect(screen.queryByTestId('camera-check-cam-front')).toBeNull();
    expect(screen.queryByTestId('camera-check-cam-back')).toBeNull();
  });

  it("s'ouvre sans jeter sur une liste vide", async () => {
    // `listCameras` peut rendre `[]` : le chevron ne peut pas être désactivé
    // (une couleur explicite est ignorée sur un bouton `disabled`), et un
    // message d'erreur pour une liste qu'on vient de demander à voir n'aide
    // personne à agir.
    await render(
      withPaper(
        <CameraMenu
          cameras={[]}
          activeDeviceId={null}
          onOpen={jest.fn()}
          onSelect={jest.fn()}
          effect={null}
          onEffectSelect={jest.fn()}
        />,
      ),
    );

    await fireEvent.press(screen.getByTestId('camera-menu-btn'));

    expect(screen.getByTestId('camera-menu-btn')).toBeTruthy();
  });

  it('compose un nom numéroté quand la face compte plusieurs caméras', async () => {
    // Un iPhone Pro rend plusieurs caméras arrière : nommées depuis `facing`
    // seul, elles porteraient toutes le même nom.
    const second: CameraChoice = { ...BACK, deviceId: 'cam-back-2', ordinal: 2 };
    const first: CameraChoice = { ...BACK, ordinal: 1 };

    await render(
      withPaper(
        <CameraMenu
          cameras={[first, second]}
          activeDeviceId={null}
          onOpen={jest.fn()}
          onSelect={jest.fn()}
          effect={null}
          onEffectSelect={jest.fn()}
        />,
      ),
    );
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));

    await waitFor(() => expect(screen.getByTestId('camera-option-cam-back-2')).toBeTruthy());
    // `mockT` interpole réellement : la composition passe par
    // `call.cameraNumbered`, jamais par une concaténation en JavaScript, et
    // le nom vient de `nameKey` (résolu par `t`), l'index de `ordinal` — pas
    // l'inverse, et pas du `deviceId` brut.
    expect(screen.getByText('call.cameraNumbered:call.cameraBack:1')).toBeTruthy();
    expect(screen.getByText('call.cameraNumbered:call.cameraBack:2')).toBeTruthy();
  });

  it("affiche le nom nu quand la face n'a qu'une caméra", async () => {
    // L'autre borne : sans elle, une composition inconditionnelle passerait le
    // test précédent tout en affichant « Caméra avant 1 » sur un téléphone qui
    // n'a qu'une caméra avant.
    await render(
      withPaper(
        <CameraMenu
          cameras={[FRONT, BACK]}
          activeDeviceId={null}
          onOpen={jest.fn()}
          onSelect={jest.fn()}
          effect={null}
          onEffectSelect={jest.fn()}
        />,
      ),
    );
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));

    await waitFor(() => expect(screen.getByText('call.cameraBack')).toBeTruthy());
    expect(screen.queryByText('call.cameraNumbered')).toBeNull();
  });
  // Le sélecteur d'arrière-plan a rejoint CE menu à la demande du propriétaire :
  // l'objectif et l'arrière-plan règlent la même chose, ce que la caméra envoie.
  // Il vivait avant dans le menu « Plus », où AUCUN test ne le rendait jamais —
  // `moreMenu.spec.tsx` passait `onOpenEffects={null}` partout, donc la ligne
  // était couverte par zéro assertion. C'est ce trou qu'on ne rouvre pas.
  describe("l'arrière-plan", () => {
    it("ne rend rien quand la plateforme n'a pas le module natif", async () => {
      // `effect === null` : iOS tant que son pendant Vision n'a pas tourné. On
      // MASQUE plutôt que de griser — un bouton `disabled` sur cet écran
      // redevient noir sur noir (`IconButton/utils.ts:88-93`).
      await render(
        withPaper(
          <CameraMenu
            cameras={[FRONT, BACK]}
            activeDeviceId={null}
            onOpen={jest.fn()}
            onSelect={jest.fn()}
            effect={null}
            onEffectSelect={jest.fn()}
          />,
        ),
      );
      await fireEvent.press(screen.getByTestId('camera-menu-btn'));
      await waitFor(() => expect(screen.getByTestId('camera-option-cam-back')).toBeTruthy());

      expect(screen.queryByTestId('camera-sheet-effects-blur')).toBeNull();
      expect(screen.queryByTestId('camera-sheet-effects-title')).toBeNull();
    });

    it('rend le sélecteur quand la plateforme le porte', async () => {
      await render(
        withPaper(
          <CameraMenu
            cameras={[FRONT, BACK]}
            activeDeviceId={null}
            onOpen={jest.fn()}
            onSelect={jest.fn()}
            effect={{ kind: 'none' }}
            onEffectSelect={jest.fn()}
          />,
        ),
      );
      await fireEvent.press(screen.getByTestId('camera-menu-btn'));

      await waitFor(() => expect(screen.getByTestId('camera-sheet-effects-blur')).toBeTruthy());
      expect(screen.getByTestId('camera-sheet-effects-image-8')).toBeTruthy();
    });

    // Les DEUX instructions du gestionnaire, une ligne chacune. Un
    // `onPress={() => { setVisible(false); onEffectSelect(x); }}` n'a aucune
    // conditionnelle : un recensement des branches ne le voit pas.
    it('annonce le choix', async () => {
      const onEffectSelect = jest.fn();

      await render(
        withPaper(
          <CameraMenu
            cameras={[FRONT, BACK]}
            activeDeviceId={null}
            onOpen={jest.fn()}
            onSelect={jest.fn()}
            effect={{ kind: 'none' }}
            onEffectSelect={onEffectSelect}
          />,
        ),
      );
      await fireEvent.press(screen.getByTestId('camera-menu-btn'));
      await waitFor(() => expect(screen.getByTestId('camera-sheet-effects-blur')).toBeTruthy());

      await fireEvent.press(screen.getByTestId('camera-sheet-effects-blur'));

      expect(onEffectSelect).toHaveBeenCalledWith({ kind: 'blur' });
    });

    it('referme la feuille après un choix', async () => {
      await render(
        withPaper(
          <CameraMenu
            cameras={[FRONT, BACK]}
            activeDeviceId={null}
            onOpen={jest.fn()}
            onSelect={jest.fn()}
            effect={{ kind: 'none' }}
            onEffectSelect={jest.fn()}
          />,
        ),
      );
      await fireEvent.press(screen.getByTestId('camera-menu-btn'));
      await waitFor(() => expect(screen.getByTestId('camera-sheet-effects-blur')).toBeTruthy());

      await fireEvent.press(screen.getByTestId('camera-sheet-effects-blur'));

      await waitFor(() => expect(screen.queryByTestId('camera-sheet-effects-blur')).toBeNull());
    });

    // Le fond CINQ, jamais le premier : avec l'index 1, « transmet la vignette
    // pressée » et « renvoie toujours la première » seraient indiscernables.
    it('annonce l’index du fond pressé', async () => {
      const onEffectSelect = jest.fn();

      await render(
        withPaper(
          <CameraMenu
            cameras={[FRONT, BACK]}
            activeDeviceId={null}
            onOpen={jest.fn()}
            onSelect={jest.fn()}
            effect={{ kind: 'none' }}
            onEffectSelect={onEffectSelect}
          />,
        ),
      );
      await fireEvent.press(screen.getByTestId('camera-menu-btn'));
      await waitFor(() => expect(screen.getByTestId('camera-sheet-effects-image-5')).toBeTruthy());

      await fireEvent.press(screen.getByTestId('camera-sheet-effects-image-5'));

      expect(onEffectSelect).toHaveBeenCalledWith({ index: 5, kind: 'image' });
      expect(onEffectSelect).not.toHaveBeenCalledWith({ index: 1, kind: 'image' });
    });

    it("force la couleur de l'intertitre", async () => {
      await render(
        withPaper(
          <CameraMenu
            cameras={[FRONT, BACK]}
            activeDeviceId={null}
            onOpen={jest.fn()}
            onSelect={jest.fn()}
            effect={{ kind: 'none' }}
            onEffectSelect={jest.fn()}
          />,
        ),
      );
      await fireEvent.press(screen.getByTestId('camera-menu-btn'));

      const title = await waitFor(() => screen.getByTestId('camera-sheet-effects-title'));
      expect(title).toHaveStyle({ color: tokens.color.textDark });
    });
  });
  // Le caret est ce qui a libéré la place des deux nouvelles commandes. Sa
  // forme est donc une DÉCISION, pas un détail de style.
  //
  // **Mais sa LARGEUR n'est pas assertible, et il ne faut pas fabriquer un
  // test qui prétendrait le contraire.** Mesuré par une sonde le 2026-08-03 :
  // `IconButton` pose bien le style de l'appelant sur `${testID}-container`
  // (`IconButton.js:93-98`), mais ce conteneur est une `Surface`, qui SÉPARE
  // ses styles — les propriétés de disposition (`width`, `height`) partent sur
  // un parent que rien ne nomme, et seul le reste survit sur le nœud portant le
  // testID. Interrogé pour sa largeur, il rend un « Received » vide, ce qui se
  // lit d'abord comme une erreur de valeur alors que c'est une propriété
  // partie ailleurs.
  //
  // Ce qui RESTE atteignable, ce sont les deux rayons : ils suffisent à prouver
  // que `barStyles.caret` est bien appliqué, donc qu'un retour au bouton plein
  // rougirait. C'est la cause qu'on garde, pas la mesure qu'on ne peut pas
  // prendre.
  it('applique le gabarit du caret au chevron, pas celui d’un bouton plein', async () => {
    await render(
      withPaper(
        <CameraMenu
          cameras={[FRONT, BACK]}
          activeDeviceId={null}
          onOpen={jest.fn()}
          onSelect={jest.fn()}
          effect={null}
          onEffectSelect={jest.fn()}
        />,
      ),
    );

    expect(screen.getByTestId('camera-menu-btn-container')).toHaveStyle({
      borderBottomLeftRadius: 0,
      borderTopLeftRadius: 0,
    });
  });
});
