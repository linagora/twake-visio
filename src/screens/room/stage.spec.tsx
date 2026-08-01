import { VideoTrack } from '@livekit/react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';

import type { CallLayout, VideoTrackRef, Tile } from 'src/call/layout';
import { tokens } from 'src/ui/tokens';
import { CallStage } from './stage';

// `require`, jamais `import * as RN` : ce dernier passe par
// `_interopRequireWildcard`, qui COPIE l'objet du module pour en faire un
// espace de noms — `stage.tsx` lit lui `useWindowDimensions` sur l'objet BRUT
// que `require` renvoie directement. Espionner la copie ne touche donc jamais
// ce que `stage.tsx` appelle : mesuré, la copie répond au mock, `stage.tsx`
// continue de lire la vraie implémentation. `require` renvoie le même objet
// aux deux endroits, puisque le registre de modules de Jest le met en cache
// par chemin résolu.
/* eslint-disable-next-line @typescript-eslint/no-require-imports */
const RN: typeof import('react-native') = require('react-native');

// Ce que ces tests peuvent montrer, et ce qu'ils ne peuvent pas : `VideoTrack`
// est un bouchon qui ne rend rien (voir `__mocks__/@livekit/react-native.ts`).
// On vérifie donc **le câblage** — quelle référence de piste, quel miroir, quel
// cadrage chaque surface réclame — et jamais qu'une image est apparue. Aucun
// test de ce fichier ne prouve quoi que ce soit de visible.

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function fakeCamera(sid: string): VideoTrackRef {
  return { publication: { trackSid: sid } } as unknown as VideoTrackRef;
}

function tile(key: string, overrides: Partial<Tile> = {}): Tile {
  return {
    key,
    source: 'camera',
    name: key,
    track: fakeCamera(`ts-${key}`),
    isLocal: false,
    isSpeaking: false,
    mirror: false,
    ...overrides,
  };
}

function layout(stage: Tile, filmstrip: readonly Tile[] = [], pinned = false): CallLayout {
  return { stage, pinned, filmstrip };
}

// `onPressTile`/`onLongPressTile` sont désormais obligatoires : la plupart des
// tests de ce fichier ne portent pas sur le geste et n'ont besoin que d'un
// bouchon qui satisfasse le type. Ceux qui portent sur le geste passent leur
// propre espion. `fullscreenTile` par défaut à `null` pour la même raison :
// seul le describe « plein écran » plus bas le fait varier, tous les tests
// d'avant continuent de voir la disposition ordinaire sans le passer.
function renderStage(
  layoutValue: CallLayout,
  onPressTile: (key: string) => void = jest.fn(),
  onLongPressTile: (key: string) => void = jest.fn(),
  fullscreenTile: Tile | null = null,
): ReturnType<typeof render> {
  return render(
    <CallStage
      layout={layoutValue}
      onPressTile={onPressTile}
      onLongPressTile={onLongPressTile}
      fullscreenTile={fullscreenTile}
    />,
  );
}

function propsFor(sid: string): Record<string, unknown> | undefined {
  return jest
    .mocked(VideoTrack)
    .mock.calls.map(([props]) => props as unknown as Record<string, unknown>)
    .find((props) => {
      const trackRef = props.trackRef as { publication: { trackSid: string } } | undefined;
      return trackRef?.publication.trackSid === sid;
    });
}

beforeEach(() => {
  // Ce fichier est le seul du dépôt à espionner un objet de module PARTAGÉ
  // (`RN.useWindowDimensions`, voir plus haut) plutôt qu'un double créé
  // localement pour ce fichier seul : sans restauration, le mock posé par un
  // test d'orientation survit aux tests suivants, qui ne posent jamais leur
  // propre dimension. Preuve : un test sans bouchon placé après un bloc
  // paysage héritait du dernier `800×400` et lisait `horizontal: false` — pas
  // un faux-vert uniforme, un faux-vert qui ne tombe QUE sur la valeur par
  // défaut du côté qui suit. `jest.restoreAllMocks()` ne touche que les
  // espions posés par `jest.spyOn` ; `VideoTrack` est un `jest.fn()` construit
  // directement dans `__mocks__/@livekit/react-native.ts`, jamais via
  // `spyOn`, donc son implémentation survit et seul son historique d'appels a
  // encore besoin d'un nettoyage explicite.
  jest.restoreAllMocks();
  jest.mocked(VideoTrack).mockClear();
});

describe('CallStage', () => {
  it('pose la vignette de scène et toutes celles de la bande', async () => {
    await renderStage(
      layout(tile('ada:camera'), [tile('me:camera'), tile('bob:camera'), tile('cid:camera')]),
    );

    expect(screen.getByTestId('active-speaker')).toBeTruthy();
    expect(screen.getByTestId('filmstrip')).toBeTruthy();
    expect(screen.getByTestId('tile-ada:camera')).toBeTruthy();
    // La bande entière, pas seulement la première : une boucle qui s'arrête au
    // premier élément est invisible tant qu'on ne compte pas.
    expect(
      ['me:camera', 'bob:camera', 'cid:camera'].map((key) => screen.queryByTestId(`tile-${key}`)),
    ).not.toContain(null);
  });

  it('transmet à VideoTrack la piste que la sélection a choisie', async () => {
    const camera = fakeCamera('ts-choisie');

    await renderStage(layout(tile('ada:camera', { track: camera })));

    expect(jest.mocked(VideoTrack).mock.calls[0]?.[0].trackRef).toBe(camera);
  });

  it('transmet le miroir décidé par la sélection, vignette par vignette', async () => {
    // Le miroir n'est pas une propriété de la surface : la vignette locale est
    // retournée, celle des autres non, et les deux cohabitent dans la bande.
    await renderStage(
      layout(tile('ada:camera'), [
        tile('me:camera', { isLocal: true, mirror: true }),
        tile('bob:camera'),
      ]),
    );

    expect(propsFor('ts-me:camera')?.mirror).toBe(true);
    expect(propsFor('ts-bob:camera')?.mirror).toBe(false);
  });

  it('cadre la scène en entier et remplit les vignettes', async () => {
    // `cover` sur la scène couperait les deux tiers d'un visage filmé en
    // paysage sur un écran tenu en portrait ; `contain` sur une vignette de
    // cent pixels n'y laisserait qu'une bande.
    await renderStage(layout(tile('ada:camera'), [tile('me:camera')]));

    expect(propsFor('ts-ada:camera')?.objectFit).toBe('contain');
    expect(propsFor('ts-me:camera')?.objectFit).toBe('cover');
  });

  it('pose un carton nommé, et aucune vidéo, quand il n’y a pas de piste', async () => {
    await renderStage(layout(tile('ada:camera', { track: null })));

    expect(screen.getByTestId('tile-placeholder-ada:camera')).toHaveTextContent('ada:camera');
    expect(VideoTrack).not.toHaveBeenCalled();
  });

  it('nomme une personne sans nom par une chaîne traduite', async () => {
    // Jamais d'identité brute ni de vide à l'écran : les deux se lisent comme
    // un défaut d'affichage.
    await renderStage(layout(tile('ada:camera', { track: null, name: '' })));

    expect(screen.getByTestId('tile-placeholder-ada:camera')).toHaveTextContent(
      'call.unnamedParticipant',
    );
  });

  it('donne son nom à chaque vignette pour qui ne voit pas l’image', async () => {
    // Une piste vidéo ne dit rien à un lecteur d'écran : le nom est tout ce
    // qu'il reste, et il doit être là avec ou sans image.
    await renderStage(
      layout(tile('ada:camera'), [tile('bob:camera', { track: null, name: 'Bob' })]),
    );

    expect(screen.getByTestId('tile-ada:camera')).toHaveProp('accessibilityLabel', 'ada:camera');
    expect(screen.getByTestId('tile-bob:camera')).toHaveProp('accessibilityLabel', 'Bob');
  });
});

// La scène et la bande passent toutes deux par `VideoTile`, mais `CallStage`
// les câble à deux endroits distincts du fichier — un `VideoTile` isolé pour
// la scène, une boucle `.map` pour la bande. Rien ne garantit qu'oublier l'un
// des deux se voie ailleurs : `call.spec.tsx` ne presse que des vignettes
// atteintes en pratique par son scénario, jamais les deux surfaces par
// construction. Pire pour l'appui long : la seule tâche qui consomme
// `onLongPressTile` pour de vrai (le plein écran) arrive après celle-ci, donc
// aucun test d'intégration ne peut aujourd'hui distinguer un `onLongPress`
// bien câblé d'un `onLongPress` oublié — seul ce bloc le peut.
//
// `fireEvent.press` n'atteint que `onPress`, jamais `onLongPress` ;
// `fireEvent(el, 'longPress')` atteint `onLongPress` et jamais `onPress` —
// vérifié par exécution avant d'écrire ces tests.
describe('gestes de tuile', () => {
  it('relaie un appui simple avec la clé de la tuile touchée, scène et bande', async () => {
    const onPressTile = jest.fn();

    await renderStage(layout(tile('bob:camera'), [tile('ada:camera')]), onPressTile);

    await fireEvent.press(screen.getByTestId('tile-ada:camera'));
    await fireEvent.press(screen.getByTestId('tile-bob:camera'));

    expect(onPressTile).toHaveBeenCalledWith('ada:camera');
    expect(onPressTile).toHaveBeenCalledWith('bob:camera');
  });

  it('relaie un appui long avec la clé de la tuile touchée, scène et bande', async () => {
    const onLongPressTile = jest.fn();

    await renderStage(layout(tile('bob:camera'), [tile('ada:camera')]), undefined, onLongPressTile);

    await fireEvent(screen.getByTestId('tile-ada:camera'), 'longPress');
    await fireEvent(screen.getByTestId('tile-bob:camera'), 'longPress');

    expect(onLongPressTile).toHaveBeenCalledWith('ada:camera');
    expect(onLongPressTile).toHaveBeenCalledWith('bob:camera');
  });

  it('ne confond pas les deux gestes sur la même tuile', async () => {
    const onPressTile = jest.fn();
    const onLongPressTile = jest.fn();

    await renderStage(
      layout(tile('bob:camera'), [tile('ada:camera')]),
      onPressTile,
      onLongPressTile,
    );

    await fireEvent.press(screen.getByTestId('tile-ada:camera'));

    expect(onPressTile).toHaveBeenCalledWith('ada:camera');
    expect(onLongPressTile).not.toHaveBeenCalled();
  });
});

// `fullscreenTile` arrive déjà résolu : cette coquille ne fait que le poser.
// K7 du recensement — la bande rendue ou absente — se joue ENTIÈREMENT ici, à
// ce niveau, jamais à celui de `call.tsx` : c'est `CallStage` qui choisit
// d'omettre le `ScrollView`, pas une prop qui ferait semblant en lui passant
// une bande vide (voir le commentaire sur `filmstrip` plus haut : posée même
// vide, elle garderait sa hauteur et resterait dans l'arbre).
describe('plein écran', () => {
  it('ne rend que la tuile fournie, sans bande', async () => {
    await renderStage(
      layout(tile('ada:camera'), [tile('bob:camera')]),
      undefined,
      undefined,
      tile('solo:camera'),
    );

    expect(
      within(screen.getByTestId('active-speaker')).getByTestId('tile-solo:camera'),
    ).toBeTruthy();
    expect(screen.queryByTestId('filmstrip')).toBeNull();
    // Ni la scène ni la bande de la disposition ORDINAIRE ne doivent survivre :
    // la tuile plein écran remplace les deux, elle ne s'ajoute pas à elles.
    expect(screen.queryByTestId('tile-ada:camera')).toBeNull();
    expect(screen.queryByTestId('tile-bob:camera')).toBeNull();
  });

  // Le même trou qu'a comblé le describe « gestes de tuile » plus haut, pour
  // le même motif : ce site d'appel de `VideoTile` est distinct des deux
  // autres (scène, bande), et rien n'oblige les trois à rester synchronisés.
  it('relaie les deux gestes sur la tuile plein écran, avec sa propre clé', async () => {
    const onPressTile = jest.fn();
    const onLongPressTile = jest.fn();

    await renderStage(
      layout(tile('ada:camera')),
      onPressTile,
      onLongPressTile,
      tile('solo:camera'),
    );

    await fireEvent.press(screen.getByTestId('tile-solo:camera'));
    await fireEvent(screen.getByTestId('tile-solo:camera'), 'longPress');

    expect(onPressTile).toHaveBeenCalledWith('solo:camera');
    expect(onLongPressTile).toHaveBeenCalledWith('solo:camera');
  });

  it('rend la bande normalement quand rien n’est en plein écran', async () => {
    // Le complément de la première assertion ci-dessus : `fullscreenTile` à
    // `null` (le défaut de `renderStage`) doit laisser la disposition
    // ordinaire intacte, scène ET bande.
    await renderStage(layout(tile('ada:camera'), [tile('bob:camera')]));

    expect(screen.getByTestId('filmstrip')).toBeTruthy();
    expect(
      within(screen.getByTestId('active-speaker')).getByTestId('tile-ada:camera'),
    ).toBeTruthy();
  });
});

// I5 de la revue de branche : un appui simple sur la tuile de scène l'épingle
// déjà (`handlePressTile` dans `call.tsx`), mais rien ne le montrait — aucun
// retour visuel. `CallLayout.pinned` porte exactement cette information
// depuis la tâche 1 (`src/call/layout.ts:215`) mais n'était lue par aucun
// code de rendu : trois assertions de `layout.spec.ts`, zéro composant. Le
// marqueur ci-dessous en tire enfin quelque chose à l'écran — et seulement à
// la scène, en disposition ordinaire : une tuile épinglée est filtrée hors de
// la bande par construction (`layout.ts:213`), donc la scène est la SEULE
// surface où le geste peut porter, et le plein écran est un état
// indépendant, où un appui ne signifie jamais « annuler l'épinglage » (voir
// le court-circuit de `handlePressTile`).
describe('marqueur d’épinglage', () => {
  it('rend le marqueur sur la scène quand la disposition dit qu’elle est épinglée', async () => {
    await renderStage(layout(tile('ada:camera'), [tile('bob:camera')], true));

    expect(within(screen.getByTestId('active-speaker')).getByTestId('pin-marker')).toBeTruthy();
  });

  it('ne rend aucun marqueur quand rien n’est épinglé', async () => {
    await renderStage(layout(tile('ada:camera'), [tile('bob:camera')], false));

    expect(screen.queryByTestId('pin-marker')).toBeNull();
  });

  it('ne rend jamais le marqueur sur une vignette de la bande', async () => {
    // Une tuile épinglée est filtrée hors de la bande par construction
    // (`layout.ts:213`) : ce cas ne peut donc pas se produire en pratique,
    // mais le garder explicite protège le site d'appel de la bande d'un
    // marqueur qui n'aurait jamais dû lui être câblé.
    await renderStage(layout(tile('ada:camera'), [tile('bob:camera')], true));

    expect(within(screen.getByTestId('filmstrip')).queryByTestId('pin-marker')).toBeNull();
  });

  it('ne rend jamais le marqueur en plein écran, même sur la tuile épinglée elle-même', async () => {
    // La MÊME tuile, épinglée ET en plein écran à la fois : le cas le plus
    // dur à distinguer, puisque `layout.pinned` vaut `true` ici. Le plein
    // écran doit quand même gagner — un appui n'y signifie jamais « annuler
    // l'épinglage », seulement « rappelle les commandes ».
    const solo = tile('ada:camera');

    await renderStage(layout(solo, [], true), undefined, undefined, solo);

    expect(screen.queryByTestId('pin-marker')).toBeNull();
  });

  it('porte une couleur explicite issue des tokens', async () => {
    // Cet écran est sombre dans les deux schémas et `react-native-paper`
    // l'ignore (`AGENTS.md`) — mais ce glyphe n'est pas un composant Paper :
    // sa couleur est un `style` littéral, jamais calculée depuis un thème.
    await renderStage(layout(tile('ada:camera'), [], true));

    expect(screen.getByTestId('pin-marker')).toHaveStyle({ color: tokens.color.textDark });
  });

  it('porte un accessibilityLabel traduit, jamais une clé nue à l’écran', async () => {
    await renderStage(layout(tile('ada:camera'), [], true));

    expect(screen.getByTestId('pin-marker')).toHaveProp('accessibilityLabel', 'call.pinned');
  });
});

describe('cadrage par source', () => {
  // On garde la VALEUR de la prop, jamais l'aspect : `AGENTS.md` est explicite,
  // aucun test ne peut prouver qu'une image est bien cadrée — seulement que la
  // valeur n'a pas été retirée.
  it('n’écrase jamais une diapositive, à la scène comme dans la bande', async () => {
    const scene = tile('alice:screen', { source: 'screen', track: fakeCamera('scr-1') });
    const vignette = tile('bob:screen', { source: 'screen', track: fakeCamera('scr-2') });

    await renderStage(layout(scene, [vignette]));

    expect(propsFor('scr-1')?.objectFit).toBe('contain');
    expect(propsFor('scr-2')?.objectFit).toBe('contain');
  });

  // La caméra garde `contain` à la scène : `cover` y agrandirait une source 16:9
  // jusqu'à n'en montrer que 26 % — mesuré sur 1080×2364. Les deux sid sont
  // distincts, sans quoi une implémentation qui rendrait la même valeur partout
  // passerait.
  it('garde la caméra en contain à la scène, en cover dans la bande', async () => {
    const scene = tile('bob:camera', { source: 'camera', track: fakeCamera('cam-1') });
    const vignette = tile('ada:camera', { source: 'camera', track: fakeCamera('cam-2') });

    await renderStage(layout(scene, [vignette]));

    expect(propsFor('cam-1')?.objectFit).toBe('contain');
    expect(propsFor('cam-2')?.objectFit).toBe('cover');
  });

  // Le cas réel qui suit `selectLayout` : quand quelqu'un partage, sa PROPRE
  // caméra reste dans la bande à côté de son écran sur la scène (le même
  // `identity`, deux `source`). Le cadrage se décide TUILE PAR TUILE, jamais
  // depuis ce qui occupe la scène : une implémentation qui lirait
  // `layout.stage.source` pour toute la bande grossirait à tort cette caméra
  // dès que la scène montre un écran.
  it('garde la caméra en cover dans la bande même quand la scène montre un écran', async () => {
    const scene = tile('alice:screen', { source: 'screen', track: fakeCamera('scr-3') });
    const vignette = tile('alice:camera', { source: 'camera', track: fakeCamera('cam-3') });

    await renderStage(layout(scene, [vignette]));

    expect(propsFor('cam-3')?.objectFit).toBe('cover');
  });
});

// L'orientation se lit sur les DIMENSIONS de la fenêtre, jamais sur une API
// d'orientation : sur un pliable elles changent sans rotation. Mesuré sur Pixel
// 10 Pro Fold — couverture 1080×2364, écran interne 2076×2152.
describe('orientation', () => {
  it('empile la bande sous la scène en portrait', async () => {
    jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({
      width: 400,
      height: 800,
      scale: 1,
      fontScale: 1,
    });

    await renderStage(layout(tile('bob:camera'), [tile('ada:camera')]));

    expect(screen.getByTestId('filmstrip')).toHaveProp('horizontal', true);
  });

  it('range la bande en colonne sur le côté en paysage', async () => {
    jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({
      width: 800,
      height: 400,
      scale: 1,
      fontScale: 1,
    });

    await renderStage(layout(tile('bob:camera'), [tile('ada:camera')]));

    expect(screen.getByTestId('filmstrip')).toHaveProp('horizontal', false);
  });
});

// Le brief ne prouve que le sens de DÉFILEMENT du ScrollView (`horizontal`),
// jamais la direction dans laquelle ses propres vignettes s'empilent : une
// implémentation qui basculerait `horizontal` correctement tout en laissant
// `filmstripContentColumn` en `flexDirection: 'row'` — le même défaut qui a
// échappé à la tâche 5 avec des tests homogènes — passe les deux tests
// ci-dessus sans broncher. Vérifié empiriquement : 0 rouge sous cette
// mutation avant l'ajout de ce bloc.
describe('axe de la bande, pas seulement sens de défilement', () => {
  it('garde les vignettes en rangée dans le contenu défilable, en portrait', async () => {
    jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({
      width: 400,
      height: 800,
      scale: 1,
      fontScale: 1,
    });

    await renderStage(layout(tile('bob:camera'), [tile('ada:camera')]));

    expect(screen.getByTestId('filmstrip')).toHaveProp(
      'contentContainerStyle',
      expect.objectContaining({ flexDirection: 'row' }),
    );
  });

  it('bascule les vignettes en colonne dans le contenu défilable, en paysage', async () => {
    jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({
      width: 800,
      height: 400,
      scale: 1,
      fontScale: 1,
    });

    await renderStage(layout(tile('bob:camera'), [tile('ada:camera')]));

    expect(screen.getByTestId('filmstrip')).toHaveProp(
      'contentContainerStyle',
      expect.objectContaining({ flexDirection: 'column' }),
    );
  });
});

// Rien dans les tests du brief n'inspecte le conteneur COMMUN à la scène et à
// la bande : une implémentation qui ferait basculer `filmstrip` en colonne
// sans jamais mettre `flexDirection: 'row'` sur le conteneur qui les
// enveloppe tous les deux passe les deux tests d'« orientation » ci-dessus —
// la bande obéit, seule, à un côté qui ne s'est pas élargi. Vérifié
// empiriquement : 0 rouge sous cette mutation avant l'ajout de ce bloc.
describe('la scène reçoit la place libérée en paysage', () => {
  it('garde la scène et la bande empilées en colonne, en portrait', async () => {
    jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({
      width: 400,
      height: 800,
      scale: 1,
      fontScale: 1,
    });

    await renderStage(layout(tile('bob:camera'), [tile('ada:camera')]));

    expect(screen.getByTestId('active-speaker').parent).not.toHaveStyle({ flexDirection: 'row' });
  });

  it('met la scène et la bande côte à côte, pour que la scène garde toute la hauteur, en paysage', async () => {
    jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({
      width: 800,
      height: 400,
      scale: 1,
      fontScale: 1,
    });

    await renderStage(layout(tile('bob:camera'), [tile('ada:camera')]));

    expect(screen.getByTestId('active-speaker').parent).toHaveStyle({ flexDirection: 'row' });
  });
});

// Aucun test ci-dessus n'observe la DIMENSION fixe que la bande et sa vignette
// échangent en paysage — seulement l'AXE (`horizontal`, `flexDirection`). Or
// c'est précisément l'échange largeur ↔ hauteur de `filmstripColumn` et
// `thumbnailTileColumn` qui rend sa hauteur à la scène, le travail annoncé par
// le titre du commit `8842d97` : une implémentation qui basculerait l'axe sans
// jamais libérer 96 dp de hauteur passerait tous les blocs précédents.
describe('la bande et sa vignette échangent une dimension fixe, pas seulement un axe', () => {
  it('fixe la hauteur de la bande et la largeur de la vignette, en portrait', async () => {
    jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({
      width: 400,
      height: 800,
      scale: 1,
      fontScale: 1,
    });

    await renderStage(layout(tile('bob:camera'), [tile('ada:camera')]));

    expect(screen.getByTestId('filmstrip')).toHaveProp(
      'style',
      expect.objectContaining({ height: 96 }),
    );
    expect(screen.getByTestId('tile-ada:camera')).toHaveStyle({ width: 128 });
  });

  it('fixe la largeur de la bande et la hauteur de la vignette, en paysage', async () => {
    jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({
      width: 800,
      height: 400,
      scale: 1,
      fontScale: 1,
    });

    await renderStage(layout(tile('bob:camera'), [tile('ada:camera')]));

    expect(screen.getByTestId('filmstrip')).toHaveProp(
      'style',
      expect.objectContaining({ width: 96 }),
    );
    expect(screen.getByTestId('tile-ada:camera')).toHaveStyle({ height: 96 });
  });
});

// Garde contre la fuite que `jest.restoreAllMocks()`, dans le `beforeEach`
// ci-dessus, referme : sans lui, ce test — qui ne pose lui-même AUCUNE
// dimension — hérite du dernier `800×400` posé par le test paysage
// précédent et lit `horizontal: false`. Placé volontairement en dernier, tout
// de suite après un bloc paysage, pour que l'ordre de déclaration par défaut
// de Jest le fasse mordre de façon fiable si la fuite revient.
it('ne pose aucune dimension et voit donc le préréglage portrait du banc de test', async () => {
  await renderStage(layout(tile('bob:camera'), [tile('ada:camera')]));

  expect(screen.getByTestId('filmstrip')).toHaveProp('horizontal', true);
});
