import { VideoTrack } from '@livekit/react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';

import { GRID_GAP, type Box } from 'src/call/grid';
import type { CallLayout, StripAxis, VideoTrackRef, Tile } from 'src/call/layout';
import { tokens } from 'src/ui/tokens';
import { CallStage } from './stage';

// Ce que ces tests peuvent montrer, et ce qu'ils ne peuvent pas : `VideoTrack`
// est un bouchon qui ne rend rien (voir `__mocks__/@livekit/react-native.ts`).
// On vérifie donc **le câblage** — quelle référence de piste, quel miroir, quel
// cadrage chaque surface réclame — et jamais qu'une image est apparue. Aucun
// test de ce fichier ne prouve quoi que ce soit de visible.

// Le double rend la clé nue, et la clé SUIVIE DU COMPTE dès qu'on lui en
// passe un : sans cela, aucun test ne pourrait distinguer « le compteur
// s'affiche » de « le compteur affiche le bon nombre » — la clé seule est la
// même dans les deux cas.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { readonly count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
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

// Le mode `focus` : une scène, une bande. Nommé par le mode qu'il fabrique —
// il n'y a plus de disposition « par défaut ».
function layout(
  focus: Tile,
  filmstrip: readonly Tile[] = [],
  pinned = false,
  // `'row'` par défaut — la bande sous la scène, ce que rend une boîte de
  // téléphone en portrait. Les tests d'axe le font varier explicitement ; tous
  // les autres n'ont aucune raison de s'en occuper.
  stripAxis: StripAxis = 'row',
): CallLayout {
  return { mode: 'focus', focus, pinned, stripAxis, filmstrip };
}

// Le mode `grid`. Les dimensions sont celles que `packGrid` rend pour cette
// forme sur la boîte de couverture en portrait ; aucun test de ce fichier ne
// les recalcule — c'est le travail de `grid.spec.ts` — ils gardent seulement
// que la coquille les POSE telles quelles.
function gridLayout(
  tiles: readonly Tile[],
  columns = 1,
  overflow = 0,
  tileWidth = 435,
  tileHeight = 244.6875,
): CallLayout {
  return { mode: 'grid', columns, tileWidth, tileHeight, tiles, overflow };
}

// Quatre gestes distincts désormais, un par surface : la plupart des tests de
// ce fichier ne portent que sur UN SEUL d'entre eux et n'ont besoin que d'un
// bouchon pour les trois autres, qui satisfasse le type sans jamais être
// examiné. Un objet d'options plutôt que des paramètres positionnels : à
// quatre rappels, un appel positionnel `renderStage(l, undefined, spy,
// undefined, undefined)` ne se relit plus. `fullscreenTile` par défaut à
// `null` : seul le describe « plein écran » plus bas le fait varier, tous les
// tests d'avant continuent de voir la disposition ordinaire sans le passer.
type RenderStageOptions = {
  readonly onPressStageTile?: () => void;
  readonly onPinTile?: (key: string) => void;
  readonly onFullscreenTile?: (key: string) => void;
  readonly onUnpinTile?: () => void;
  readonly onExitFullscreen?: () => void;
  readonly fullscreenTile?: Tile | null;
  readonly onMeasureBox?: (box: Box) => void;
};

function renderStage(
  // `null` = la mesure n'est pas encore arrivée. Le défaut est une disposition
  // réelle : seul le bloc « mesure » plus bas fait varier ce cas.
  layoutValue: CallLayout | null,
  options: RenderStageOptions = {},
): ReturnType<typeof render> {
  return render(
    <CallStage
      layout={layoutValue}
      onMeasureBox={options.onMeasureBox ?? jest.fn()}
      onPressStageTile={options.onPressStageTile ?? jest.fn()}
      onPinTile={options.onPinTile ?? jest.fn()}
      onFullscreenTile={options.onFullscreenTile ?? jest.fn()}
      onUnpinTile={options.onUnpinTile ?? jest.fn()}
      onExitFullscreen={options.onExitFullscreen ?? jest.fn()}
      fullscreenTile={options.fullscreenTile ?? null}
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
// les câble à deux endroits distincts du fichier, à deux gestes distincts —
// un `VideoTile` isolé, câblé à `onPressStageTile`, pour la scène ; une
// boucle `.map`, câblée à `onPressFilmstripTile`, pour la bande. Rien ne
// garantit qu'oublier l'un des deux se voie ailleurs : `call.spec.tsx` ne
// presse que des vignettes atteintes en pratique par son scénario, jamais les
// deux surfaces par construction — d'où un test par site ici, plus un test
// d'isolation entre les deux.
//
// `fireEvent.press` n'atteint que l'`onPress` de l'élément visé (ou de son
// premier ANCÊTRE HÔTE), jamais celui d'un autre `Pressable` du même arbre —
// vérifié par exécution avant d'écrire ces tests.
describe('gestes de tuile', () => {
  it('bascule le plein écran sur un appui sur la tuile de scène', async () => {
    const onPressStageTile = jest.fn();

    await renderStage(layout(tile('bob:camera'), [tile('ada:camera')]), { onPressStageTile });

    await fireEvent.press(screen.getByTestId('tile-bob:camera'));

    // Zéro argument : il n'y a jamais qu'une seule tuile sur la scène, et
    // `call.tsx` connaît déjà sa clé par `layout.stage.key` — voir
    // `CallStageProps.onPressStageTile`.
    expect(onPressStageTile).toHaveBeenCalledTimes(1);
  });

  it('épingle la vignette de la bande qu’on touche, avec sa clé', async () => {
    const onPinTile = jest.fn();

    await renderStage(layout(tile('bob:camera'), [tile('ada:camera')]), {
      onPinTile,
    });

    await fireEvent.press(screen.getByTestId('tile-ada:camera'));

    expect(onPinTile).toHaveBeenCalledWith('ada:camera');
  });

  // Chaque site d'appel a son propre geste : sans CE test, une implémentation
  // qui câblerait `onPressFilmstripTile` à la place de `onPressStageTile` sur
  // la scène — ou l'inverse — passerait quand même les deux tests ci-dessus,
  // chacun n'observant qu'un seul site à la fois.
  it('ne câble jamais le même geste aux deux surfaces', async () => {
    const onPressStageTile = jest.fn();
    const onPinTile = jest.fn();

    await renderStage(layout(tile('bob:camera'), [tile('ada:camera')]), {
      onPressStageTile,
      onPinTile,
    });

    await fireEvent.press(screen.getByTestId('tile-bob:camera'));

    expect(onPressStageTile).toHaveBeenCalledTimes(1);
    expect(onPinTile).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('tile-ada:camera'));

    expect(onPinTile).toHaveBeenCalledWith('ada:camera');
    // Toujours une seule fois : l'appui sur la bande n'a pas, en secret,
    // rappelé aussi le geste de la scène.
    expect(onPressStageTile).toHaveBeenCalledTimes(1);
  });
});

// `fullscreenTile` arrive déjà résolu : cette coquille ne fait que le poser.
// La bande rendue ou absente se joue ENTIÈREMENT ici, à ce niveau, jamais à
// celui de `call.tsx` : c'est `CallStage` qui choisit d'omettre le
// `ScrollView`, pas une prop qui ferait semblant en lui passant une bande
// vide (voir le commentaire sur `filmstrip` plus haut : posée même vide, elle
// garderait sa hauteur et resterait dans l'arbre).
describe('plein écran', () => {
  it('ne rend que la tuile fournie, sans bande', async () => {
    await renderStage(layout(tile('ada:camera'), [tile('bob:camera')]), {
      fullscreenTile: tile('solo:camera'),
    });

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
  it('relaie un appui sur la tuile plein écran comme une sortie', async () => {
    const onExitFullscreen = jest.fn();

    await renderStage(layout(tile('ada:camera')), {
      onExitFullscreen,
      fullscreenTile: tile('solo:camera'),
    });

    await fireEvent.press(screen.getByTestId('tile-solo:camera'));

    // Zéro argument, comme `onPressStageTile` : il n'y a jamais qu'une seule
    // tuile en plein écran.
    expect(onExitFullscreen).toHaveBeenCalledTimes(1);
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

// I5 de la revue de branche, poursuivie par le lot qui simplifie les gestes :
// un appui simple sur la tuile de scène épinglait déjà, mais rien ne le
// montrait — aucun retour visuel. `CallLayout.pinned` porte exactement cette
// information depuis la tâche 1 (`src/call/layout.ts:215`), et ce lot en fait
// enfin un badge LISIBLE : un partenaire testant sur appareil n'avait jamais
// vu la petite punaise qui le précédait. Le badge n'apparaît que sur la
// scène, en disposition ordinaire : une tuile épinglée est filtrée hors de la
// bande par construction (`layout.ts:213`), donc la scène est la SEULE
// surface où le geste peut porter, et le plein écran est un état
// indépendant, où un appui ne signifie jamais « désépingler » (voir
// `onPressStageTile`/`onExitFullscreen` de `CallStageProps`).
describe('badge d’épinglage', () => {
  it('rend le badge sur la scène quand la disposition dit qu’elle est épinglée', async () => {
    await renderStage(layout(tile('ada:camera'), [tile('bob:camera')], true));

    expect(within(screen.getByTestId('active-speaker')).getByTestId('pin-marker')).toBeTruthy();
  });

  it('ne rend aucun badge quand rien n’est épinglé', async () => {
    await renderStage(layout(tile('ada:camera'), [tile('bob:camera')], false));

    expect(screen.queryByTestId('pin-marker')).toBeNull();
  });

  it('ne rend jamais le badge sur une vignette de la bande', async () => {
    // Une tuile épinglée est filtrée hors de la bande par construction
    // (`layout.ts:213`) : ce cas ne peut donc pas se produire en pratique,
    // mais le garder explicite protège le site d'appel de la bande d'un
    // badge qui n'aurait jamais dû lui être câblé.
    await renderStage(layout(tile('ada:camera'), [tile('bob:camera')], true));

    expect(within(screen.getByTestId('filmstrip')).queryByTestId('pin-marker')).toBeNull();
  });

  it('ne rend jamais le badge en plein écran, même sur la tuile épinglée elle-même', async () => {
    // La MÊME tuile, épinglée ET en plein écran à la fois : le cas le plus
    // dur à distinguer, puisque `layout.pinned` vaut `true` ici. Le plein
    // écran doit quand même gagner — un appui n'y signifie jamais
    // « désépingler », seulement « sortir ».
    const solo = tile('ada:camera');

    await renderStage(layout(solo, [], true), { fullscreenTile: solo });

    expect(screen.queryByTestId('pin-marker')).toBeNull();
  });

  it('porte une couleur explicite issue des tokens, sur l’icône et sur le texte', async () => {
    // Cet écran est sombre dans les deux schémas et `react-native-paper`
    // l'ignore (`AGENTS.md`) — mais ni l'icône ni le texte du badge ne
    // passent par un composant Paper : les deux couleurs sont des `style`
    // littéraux, jamais calculées depuis un thème.
    await renderStage(layout(tile('ada:camera'), [], true));

    expect(screen.getByTestId('pin-marker-icon')).toHaveStyle({ color: tokens.color.textDark });
    expect(screen.getByTestId('pin-marker-text')).toHaveStyle({ color: tokens.color.textDark });
  });

  it('affiche un libellé traduit et lisible, pas seulement une icône', async () => {
    // Le défaut mesuré chez le partenaire : une punaise seule, dans un coin,
    // ne se voit pas. Le badge porte désormais un texte.
    await renderStage(layout(tile('ada:camera'), [], true));

    expect(screen.getByTestId('pin-marker-text')).toHaveTextContent('call.pinned');
  });

  it('porte un accessibilityLabel traduit, jamais une clé nue à l’écran', async () => {
    await renderStage(layout(tile('ada:camera'), [], true));

    expect(screen.getByTestId('pin-marker')).toHaveProp('accessibilityLabel', 'call.pinned');
  });

  // 44 dp, la recommandation Apple déjà retenue par `controlBar.ts` pour la
  // barre de contrôle. Un plancher (`minWidth`/`minHeight`), jamais une
  // largeur fixe : le libellé grandit avec sa traduction.
  it('offre une cible tactile d’au moins 44 dp', async () => {
    await renderStage(layout(tile('ada:camera'), [], true));

    expect(screen.getByTestId('pin-marker')).toHaveStyle({ minWidth: 44, minHeight: 44 });
  });

  // Le geste qui remplace l'ancien appui simple sur la scène pour désépingler
  // : c'est désormais le badge, et lui seul, qui le porte.
  it('désépingle sur un appui du badge', async () => {
    const onUnpinTile = jest.fn();

    await renderStage(layout(tile('ada:camera'), [], true), { onUnpinTile });

    await fireEvent.press(screen.getByTestId('pin-marker'));

    expect(onUnpinTile).toHaveBeenCalledTimes(1);
  });

  // Le badge est un `Pressable` imbriqué DANS celui, plus grand, de la tuile
  // de scène — jamais un second `onPress` posé sur le même élément. Sans CE
  // test, un badge qui laisserait l'appui remonter jusqu'au `Pressable`
  // parent basculerait aussi, en secret, le plein écran : un seul appui
  // produirait alors DEUX effets, et désépingler enverrait la personne en
  // plein écran par accident.
  it('ne bascule jamais le plein écran de la tuile qui le porte', async () => {
    const onUnpinTile = jest.fn();
    const onPressStageTile = jest.fn();

    await renderStage(layout(tile('ada:camera'), [], true), { onUnpinTile, onPressStageTile });

    await fireEvent.press(screen.getByTestId('pin-marker'));

    expect(onUnpinTile).toHaveBeenCalledTimes(1);
    expect(onPressStageTile).not.toHaveBeenCalled();
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

// L'axe de la bande n'est plus lu ici : il ARRIVE dans `layout.stripAxis`,
// décidé par `selectLayout` en comparant le rapport de la BOÎTE MESURÉE à
// `TILE_ASPECT` — jamais `width > height`, jamais `useWindowDimensions()`.
// Cette coquille ne décide rien ; ces tests gardent qu'elle obéit, et à cinq
// endroits distincts.
describe('axe de la bande', () => {
  it('empile la bande sous la scène quand l’axe est la rangée', async () => {
    await renderStage(layout(tile('bob:camera'), [tile('ada:camera')], false, 'row'));

    expect(screen.getByTestId('filmstrip')).toHaveProp('horizontal', true);
  });

  it('range la bande en colonne sur le côté quand l’axe est la colonne', async () => {
    await renderStage(layout(tile('bob:camera'), [tile('ada:camera')], false, 'column'));

    expect(screen.getByTestId('filmstrip')).toHaveProp('horizontal', false);
  });
});

// Le sens de DÉFILEMENT du `ScrollView` (`horizontal`) ne dit rien de la
// direction dans laquelle ses propres vignettes s'empilent : une implémentation
// qui basculerait `horizontal` correctement tout en laissant
// `filmstripContentColumn` en `flexDirection: 'row'` passerait les deux tests
// ci-dessus sans broncher. Mesuré : 0 rouge sous cette mutation avant l'ajout
// de ce bloc.
describe('axe du contenu défilable, pas seulement sens de défilement', () => {
  it('garde les vignettes en rangée dans le contenu défilable', async () => {
    await renderStage(layout(tile('bob:camera'), [tile('ada:camera')], false, 'row'));

    expect(screen.getByTestId('filmstrip')).toHaveProp(
      'contentContainerStyle',
      expect.objectContaining({ flexDirection: 'row' }),
    );
  });

  it('bascule les vignettes en colonne dans le contenu défilable', async () => {
    await renderStage(layout(tile('bob:camera'), [tile('ada:camera')], false, 'column'));

    expect(screen.getByTestId('filmstrip')).toHaveProp(
      'contentContainerStyle',
      expect.objectContaining({ flexDirection: 'column' }),
    );
  });
});

// Rien dans les blocs ci-dessus n'inspecte le conteneur COMMUN à la scène et à
// la bande : une implémentation qui ferait basculer la bande en colonne sans
// jamais mettre `flexDirection: 'row'` sur la racine qui les enveloppe toutes
// deux passe les quatre tests précédents — la bande obéit, seule, à un côté
// qui ne s'est pas élargi. Mesuré : 0 rouge sous cette mutation avant l'ajout
// de ce bloc.
describe('la scène reçoit la place libérée', () => {
  it('garde la scène et la bande empilées en colonne quand l’axe est la rangée', async () => {
    await renderStage(layout(tile('bob:camera'), [tile('ada:camera')], false, 'row'));

    expect(screen.getByTestId('stage-root')).not.toHaveStyle({ flexDirection: 'row' });
  });

  it('met la scène et la bande côte à côte quand l’axe est la colonne', async () => {
    await renderStage(layout(tile('bob:camera'), [tile('ada:camera')], false, 'column'));

    expect(screen.getByTestId('stage-root')).toHaveStyle({ flexDirection: 'row' });
  });
});

// Aucun test ci-dessus n'observe la DIMENSION fixe que la bande et sa vignette
// échangent — seulement l'AXE. Or c'est précisément l'échange largeur ↔ hauteur
// de `filmstripColumn` et `thumbnailTileColumn` qui rend sa hauteur à la scène :
// une implémentation qui basculerait l'axe sans jamais libérer 96 dp de hauteur
// passerait tous les blocs précédents.
describe('la bande et sa vignette échangent une dimension fixe, pas seulement un axe', () => {
  it('fixe la hauteur de la bande et la largeur de la vignette, en rangée', async () => {
    await renderStage(layout(tile('bob:camera'), [tile('ada:camera')], false, 'row'));

    expect(screen.getByTestId('filmstrip')).toHaveProp(
      'style',
      expect.objectContaining({ height: 96 }),
    );
    expect(screen.getByTestId('tile-ada:camera')).toHaveStyle({ width: 128 });
  });

  it('fixe la largeur de la bande et la hauteur de la vignette, en colonne', async () => {
    await renderStage(layout(tile('bob:camera'), [tile('ada:camera')], false, 'column'));

    expect(screen.getByTestId('filmstrip')).toHaveProp(
      'style',
      expect.objectContaining({ width: 96 }),
    );
    expect(screen.getByTestId('tile-ada:camera')).toHaveStyle({ height: 96 });
  });
});

// La mesure elle-même. Elle n'existe pas sous Jest — RNTL ne dispose aucune
// vue, donc `onLayout` ne part jamais tout seul : chaque test qui en a besoin
// la déclenche à la main, exactement comme la première trame le ferait sur
// appareil.
describe('mesure de la boîte', () => {
  it('ne rend aucune tuile tant que la mesure n’est pas arrivée', async () => {
    await renderStage(null);

    expect(screen.queryByTestId('active-speaker')).toBeNull();
    expect(screen.queryByTestId('filmstrip')).toBeNull();
    expect(VideoTrack).not.toHaveBeenCalled();
  });

  it('porte quand même la racine mesurable, sans quoi la mesure n’arriverait jamais', async () => {
    // Le piège exact : rendre `null` en entier tant que la boîte est inconnue
    // retire du même coup le `onLayout` qui la ferait connaître. L'écran reste
    // alors vide pour toujours, et aucun test de disposition ne le voit.
    await renderStage(null);

    expect(screen.getByTestId('stage-root')).toBeTruthy();
    expect(screen.getByTestId('stage-root')).toHaveProp('onLayout', expect.any(Function));
  });

  it('remonte la boîte que le système lui donne, sans la retoucher', async () => {
    const onMeasureBox = jest.fn();

    await renderStage(layout(tile('bob:camera')), { onMeasureBox });
    await fireEvent(screen.getByTestId('stage-root'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 443, height: 900 } },
    });

    expect(onMeasureBox).toHaveBeenCalledWith({ width: 443, height: 900 });
  });

  it('remonte aussi la mesure en plein écran, où la boîte ne change pas de sens', async () => {
    // Le `onLayout` est posé sur la racine COMMUNE aux trois dispositions.
    // Le poser dans chaque branche le ferait disparaître de celle qu'on
    // oublierait — et le plein écran est justement celle qu'on oublie.
    const onMeasureBox = jest.fn();

    await renderStage(layout(tile('bob:camera')), {
      onMeasureBox,
      fullscreenTile: tile('solo:camera'),
    });
    await fireEvent(screen.getByTestId('stage-root'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 500 } },
    });

    expect(onMeasureBox).toHaveBeenCalledWith({ width: 300, height: 500 });
  });
});

// Constaté SUR APPAREIL, en séance : la bande était VIDE alors que la sélection
// y plaçait bien deux tuiles — établi par un relevé posé à la frontière, qui
// affichait `bande=[mmaudet:camera, …:camera]` pendant qu'aucun pixel de la
// bande ne dépassait la couleur de fond. Le défaut vivait donc dans le rendu,
// pas dans la règle.
//
// Cause : le `Pressable` qui enveloppe chaque tuile porte `size`, et pour une
// vignette `size` ne contient QU'UNE LARGEUR. Le `Pressable` reçoit bien sa
// hauteur de l'étirement de la bande, mais la `View` intérieure n'a alors ni
// `flex` ni `height` : sa hauteur vient de son contenu, or son contenu est un
// `VideoTrack` en `flex: 1`, de base nulle. Elle s'effondre à zéro.
//
// La scène y échappait parce que son `size` vaut `{ flex: 1 }` — posé sur les
// deux vues. C'est pourquoi le défaut n'a touché QUE les vignettes, et pourquoi
// il a survécu à quatre tâches et deux revues : tous les tests interrogent des
// `testID`, qu'une vue de hauteur nulle porte exactement comme une autre.
//
// Aucun test ne peut prouver qu'une tuile est VISIBLE — Jest ne dispose pas les
// vues. Celui-ci garde la seule chose gardable : la propriété qui la fait
// remplir son parent n'a pas été retirée.
it('donne à chaque tuile de quoi remplir son pressable, sans quoi la bande est vide', async () => {
  await renderStage(layout(tile('bob:camera'), [tile('ada:camera')]));

  expect(screen.getByTestId('tile-ada:camera')).toHaveStyle({ flex: 1 });
  expect(screen.getByTestId('tile-bob:camera')).toHaveStyle({ flex: 1 });
});

// La grille : aucune scène, aucune bande, des cellules toutes de la même
// taille. Ce que ces tests gardent est le CÂBLAGE — combien de cellules, dans
// quelles rangées, avec quelles dimensions, sur quel geste — et jamais qu'une
// image est apparue : `VideoTrack` est un bouchon qui ne rend rien.
describe('mode grille', () => {
  it('pose une cellule par tuile, et ni scène ni bande', async () => {
    await renderStage(gridLayout([tile('me:camera'), tile('ada:camera'), tile('bob:camera')], 1));

    expect(screen.getByTestId('grid')).toBeTruthy();
    expect(
      ['me:camera', 'ada:camera', 'bob:camera'].map((key) => screen.queryByTestId(`tile-${key}`)),
    ).not.toContain(null);
    // La grille REMPLACE la scène et la bande, elle ne s'y ajoute pas.
    expect(screen.queryByTestId('active-speaker')).toBeNull();
    expect(screen.queryByTestId('filmstrip')).toBeNull();
  });

  it('découpe les cellules en rangées d’une colonne quand la grille en compte une', async () => {
    await renderStage(gridLayout([tile('me:camera'), tile('ada:camera')], 1));

    expect(screen.getAllByTestId(/^grid-row-/)).toHaveLength(2);
  });

  it('les découpe en rangées de deux quand la grille en compte deux', async () => {
    // Le MÊME nombre de tuiles, l'autre valeur de `columns` : une
    // implémentation qui ignorerait `columns` et rendrait une rangée par tuile
    // — ou une seule rangée pour tout — passerait l'un des deux tests seul.
    await renderStage(gridLayout([tile('me:camera'), tile('ada:camera'), tile('bob:camera')], 2));

    expect(screen.getAllByTestId(/^grid-row-/)).toHaveLength(2);
    // Et le REMPLISSAGE, pas seulement le compte : les deux premières tuiles
    // partagent la première rangée, la troisième ouvre la seconde.
    const first = screen.getByTestId('grid-row-0');
    const second = screen.getByTestId('grid-row-1');
    expect(within(first).getByTestId('tile-me:camera')).toBeTruthy();
    expect(within(first).getByTestId('tile-ada:camera')).toBeTruthy();
    expect(within(second).getByTestId('tile-bob:camera')).toBeTruthy();
  });

  it('pose sur chaque cellule les dimensions que la sélection a calculées', async () => {
    // La seule forme de style dynamique du fichier, et elle est obligatoire :
    // ces deux nombres descendent de la boîte mesurée et ne peuvent pas être
    // statiques. Des valeurs volontairement distinctes de celles du défaut,
    // pour qu'une implémentation qui poserait une taille figée échoue.
    await renderStage(gridLayout([tile('me:camera')], 1, 0, 300, 168.75));

    expect(screen.getByTestId('tile-me:camera')).toHaveStyle({ width: 300, height: 168.75 });
  });

  it('remplit chaque cellule plutôt que d’y laisser du noir', async () => {
    // `cover` et non `contain` : la cellule EST déjà au rapport du gabarit, donc
    // le rognage est marginal — et le vide, lui, appartient à la marge de la
    // page, jamais à l'intérieur d'une tuile.
    await renderStage(gridLayout([tile('me:camera')], 1));

    expect(propsFor('ts-me:camera')?.objectFit).toBe('cover');
  });

  it('ouvre le plein écran sur la cellule qu’on touche, avec sa clé', async () => {
    // La grille montre DÉJÀ tout le monde : y épingler répondait à une question
    // que personne ne se pose. Un appui y veut dire « celui-ci, en grand », ce
    // qui est le plein écran — transitoire, et dont un second appui sort.
    //
    // L'épinglage ne vit plus que sur la BANDE, où il a un sens : ramener un
    // visage qu'un partage d'écran a chassé. Deux tuiles, jamais une : avec une
    // seule, une clé recopiée en dur passerait inaperçue.
    const onFullscreenTile = jest.fn();
    const onPinTile = jest.fn();

    await renderStage(gridLayout([tile('me:camera'), tile('ada:camera')], 1), {
      onFullscreenTile,
      onPinTile,
    });

    await fireEvent.press(screen.getByTestId('tile-ada:camera'));

    expect(onFullscreenTile).toHaveBeenCalledWith('ada:camera');
    expect(onFullscreenTile).toHaveBeenCalledTimes(1);
    // Le geste ne fait plus QUE ça : sans cette ligne, une cellule qui
    // appellerait les deux passerait le test ci-dessus.
    expect(onPinTile).not.toHaveBeenCalled();
  });

  it('ne bascule jamais le plein écran depuis une cellule', async () => {
    // Les deux gestes restent distincts : une cellule ÉPINGLE, seule la tuile
    // de scène du mode `focus` bascule le plein écran. Sans ce test, un site
    // d'appel câblé sur le mauvais rappel passerait celui d'au-dessus.
    const onPressStageTile = jest.fn();

    await renderStage(gridLayout([tile('me:camera')], 1), { onPressStageTile });

    await fireEvent.press(screen.getByTestId('tile-me:camera'));

    expect(onPressStageTile).not.toHaveBeenCalled();
  });

  it('ne rend jamais le badge d’épinglage dans une cellule', async () => {
    // Une tuile épinglée force le mode `focus` : aucune cellule de grille n'est
    // jamais celle qui est épinglée. Explicite plutôt que supposé.
    await renderStage(gridLayout([tile('me:camera'), tile('ada:camera')], 1));

    expect(screen.queryByTestId('pin-marker')).toBeNull();
  });

  it('garde la racine en colonne : une grille n’a pas de bande à mettre sur le côté', async () => {
    await renderStage(gridLayout([tile('me:camera')], 1));

    expect(screen.getByTestId('stage-root')).not.toHaveStyle({ flexDirection: 'row' });
  });

  it('pose la même valeur en marge de page qu’en écart entre deux cellules', async () => {
    // C'est le nombre que `selectLayout` retire de la boîte mesurée avant
    // d'empaqueter. Les deux ne peuvent pas diverger sans que les cellules
    // débordent de la page ou lui laissent une marge qu'elle n'a pas comptée.
    await renderStage(gridLayout([tile('me:camera')], 1));

    expect(screen.getByTestId('grid')).toHaveStyle({ padding: GRID_GAP, gap: GRID_GAP });
    expect(screen.getByTestId('grid-row-0')).toHaveStyle({ gap: GRID_GAP });
  });
});

// Le débordement : au-delà de la capacité, les tuiles restantes ne sont pas
// rendues et un compteur les représente. `selectLayout` a déjà fait le compte ;
// cette coquille ne fait que le poser.
describe('compteur de débordement', () => {
  it('ne pose aucun compteur quand tout le monde tient', async () => {
    await renderStage(gridLayout([tile('me:camera'), tile('ada:camera')], 1, 0));

    expect(screen.queryByTestId('grid-overflow')).toBeNull();
  });

  it('pose le compteur dès qu’une personne manque à l’appel', async () => {
    await renderStage(gridLayout([tile('me:camera')], 1, 1));

    expect(screen.getByTestId('grid-overflow')).toBeTruthy();
  });

  it('annonce le nombre exact de personnes non montrées, jamais un libellé nu', async () => {
    // Deux comptes distincts, dans deux assertions : un composant qui
    // afficherait un texte fixe — ou qui passerait le nombre de tuiles au lieu
    // du débordement — passerait un seul de ces deux tests.
    await renderStage(gridLayout([tile('me:camera')], 1, 4));

    expect(screen.getByTestId('grid-overflow-text')).toHaveTextContent('call.moreParticipants:4');
  });

  it('suit le compte que la sélection lui donne, sans le recalculer', async () => {
    await renderStage(gridLayout([tile('me:camera'), tile('ada:camera')], 1, 2));

    expect(screen.getByTestId('grid-overflow-text')).toHaveTextContent('call.moreParticipants:2');
  });

  it('porte une couleur explicite issue des tokens', async () => {
    // `Text` vient de `react-native-paper`, et cet écran est sombre dans les
    // deux schémas alors que Paper l'ignore (`AGENTS.md`) : sans cette couleur
    // le compteur retomberait sur `onSurface`, quasi noir en schéma clair —
    // sur un fond quasi noir. Aucun test ne peut prouver qu'il est LISIBLE ;
    // celui-ci prouve que la couleur explicite n'a pas été retirée, et
    // l'égalité stricte fait échouer n'importe quel repli.
    await renderStage(gridLayout([tile('me:camera')], 1, 1));

    expect(screen.getByTestId('grid-overflow-text')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });

  it('pose un fond opaque, jamais une pastille posée à même la vidéo', async () => {
    // La grille est PLEINE dès que ce compteur existe : il se pose forcément
    // sur une image dont personne ici ne connaît la couleur.
    await renderStage(gridLayout([tile('me:camera')], 1, 1));

    expect(screen.getByTestId('grid-overflow')).toHaveStyle({
      backgroundColor: tokens.color.surfaceDark,
    });
  });
});

// Le restylage. Rien de ce qui suit ne change un COMPORTEMENT : ce sont des
// couleurs, un rayon, deux couches posées sur la tuile. Les 55 tests au-dessus
// n'ont pas bougé d'une ligne, et c'est eux qui gardent que rien d'autre n'a
// bougé.
//
// Les trois voiles sont RÉÉCRITS ici plutôt qu'importés de `stage.tsx` : ce
// sont des valeurs relevées sur le mockup, donc la spécification elle-même. Un
// test qui importerait la constante resterait vert si quelqu'un la changeait,
// ce qui est exactement ce qu'on veut voir rougir. `toHaveStyle` compare les
// chaînes telles quelles — il ne normalise aucune couleur
// (`to-have-style.js` : `StyleSheet.flatten` puis `this.equals`) — donc les
// espaces comptent.
const TILE_BORDER = 'rgba(255, 255, 255, 0.07)';
const AVATAR_BACKGROUND = 'rgba(255, 255, 255, 0.16)';
const NAME_SCRIM = 'rgba(0, 0, 0, 0.6)';

describe('bordure de la tuile', () => {
  it('met le vert de marque autour de la sienne, et un simple liseré autour des autres', async () => {
    // Les deux fixtures dans le MÊME rendu : une implémentation qui poserait la
    // même couleur partout passerait n'importe laquelle des deux prise seule.
    await renderStage(
      layout(tile('me:camera', { isLocal: true }), [tile('ada:camera', { isLocal: false })]),
    );

    expect(screen.getByTestId('tile-me:camera')).toHaveStyle({
      borderColor: tokens.color.brand,
    });
    expect(screen.getByTestId('tile-ada:camera')).toHaveStyle({ borderColor: TILE_BORDER });
  });

  it('n’entoure de bleu que celui qui parle', async () => {
    await renderStage(
      layout(tile('bob:camera', { isSpeaking: true }), [tile('ada:camera', { isSpeaking: false })]),
    );

    expect(screen.getByTestId('tile-bob:camera')).toHaveStyle({
      borderColor: tokens.color.primaryDark,
    });
    expect(screen.getByTestId('tile-ada:camera')).toHaveStyle({ borderColor: TILE_BORDER });
  });

  it('laisse la parole passer devant « c’est moi » sur la même tuile', async () => {
    // Le cas où les deux conditions sont vraies À LA FOIS, et le seul qui
    // prouve l'ORDRE des deux styles : chacune prise seule est déjà gardée
    // au-dessus, et une implémentation qui les inverserait passerait les deux.
    await renderStage(layout(tile('me:camera', { isLocal: true, isSpeaking: true })));

    expect(screen.getByTestId('tile-me:camera')).toHaveStyle({
      borderColor: tokens.color.primaryDark,
    });
  });

  it('garde la même épaisseur de bordure, qu’on parle ou non', async () => {
    // Le mockup pose 1 px sur une tuile ordinaire et 2 px sur la tuile locale.
    // Les 2 px sont retenus partout, et c'est ce test qui le tient : le bord
    // est intérieur à une boîte de dimensions fixes, donc une largeur qui
    // suivrait `isSpeaking` rognerait l'image à chaque mot.
    await renderStage(
      layout(tile('me:camera', { isLocal: true, isSpeaking: true }), [
        tile('ada:camera'),
        tile('bob:camera', { isSpeaking: true }),
      ]),
    );

    for (const key of ['me:camera', 'ada:camera', 'bob:camera']) {
      expect(screen.getByTestId(`tile-${key}`)).toHaveStyle({ borderWidth: 2 });
    }
  });

  it('arrondit les trois surfaces au même rayon', async () => {
    // Le rayon vit sur `styles.tile`, pas sur les styles de TAILLE : sans ce
    // test, une implémentation qui le laisserait sur `thumbnailTile` seul
    // arrondirait la bande et laisserait la scène à angles vifs.
    await renderStage(layout(tile('bob:camera'), [tile('ada:camera')]));

    expect(screen.getByTestId('tile-bob:camera')).toHaveStyle({
      borderRadius: tokens.radius.card,
    });
    expect(screen.getByTestId('tile-ada:camera')).toHaveStyle({
      borderRadius: tokens.radius.card,
    });

    await renderStage(gridLayout([tile('me:camera')], 1));

    expect(screen.getByTestId('tile-me:camera')).toHaveStyle({
      borderRadius: tokens.radius.card,
    });
  });
});

describe('cercle d’initiales', () => {
  it('remplace l’image absente par un cercle d’initiales', async () => {
    await renderStage(layout(tile('ada:camera', { track: null, name: 'Ada Lovelace' })));

    // La première et la DERNIÈRE initiale, la règle d'`initialsOf` — reprise
    // de `src/ui/initialsAvatar` plutôt que réécrite ici.
    expect(screen.getByTestId('tile-avatar-ada:camera-text')).toHaveTextContent('AL');
  });

  it('n’en pose aucun quand la tuile a une image', async () => {
    // La condition rendue FAUSSE : sans ce test, un cercle rendu en toutes
    // circonstances — donc par-dessus la vidéo — passerait celui d'au-dessus.
    await renderStage(layout(tile('ada:camera')));

    expect(screen.queryByTestId('tile-avatar-ada:camera')).toBeNull();
  });

  it('n’invente aucune initiale pour une personne sans nom', async () => {
    // Les initiales viennent du nom BRUT, jamais du libellé traduit : une
    // implémentation qui lirait `label` afficherait ici un « C », la première
    // lettre de `call.unnamedParticipant`.
    await renderStage(layout(tile('ada:camera', { track: null, name: '' })));

    expect(screen.getByTestId('tile-avatar-ada:camera-text')).toHaveTextContent('');
  });

  it('porte des couleurs explicites issues des tokens', async () => {
    // Ce `Text` vient de Paper et cet écran est sombre alors que le thème est
    // clair (`AGENTS.md`) : sans couleur explicite il retomberait sur
    // `onSurface`. Aucun test ne peut prouver qu'il est LISIBLE ; celui-ci
    // prouve que la couleur n'a pas été retirée, et l'égalité stricte fait
    // échouer n'importe quel repli.
    await renderStage(layout(tile('ada:camera', { track: null, name: 'Ada' })));

    expect(screen.getByTestId('tile-avatar-ada:camera')).toHaveStyle({
      backgroundColor: AVATAR_BACKGROUND,
    });
    expect(screen.getByTestId('tile-avatar-ada:camera-text')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });
});

describe('badge de nom', () => {
  it('nomme aussi les tuiles qui ont une image', async () => {
    // Le carton nommé ne paraissait que sans image ; le badge, lui, est sur
    // toutes les tuiles — c'est là tout le changement, et rien au-dessus ne
    // l'observe.
    await renderStage(layout(tile('ada:camera', { name: 'Ada' })));

    expect(screen.getByTestId('tile-name-ada:camera-text')).toHaveTextContent('Ada');
  });

  it('ne pose plus de carton nommé dès qu’il y a une image', async () => {
    // Le pendant du test « pose un carton nommé […] quand il n'y a pas de
    // piste » plus haut, qui n'observe que le cas SANS image : le `testID`
    // historique reste réservé à ce cas, et `call.spec.tsx:544` s'en sert pour
    // prouver qu'aucune vidéo n'est posée.
    await renderStage(layout(tile('ada:camera')));

    expect(screen.queryByTestId('tile-placeholder-ada:camera')).toBeNull();
    expect(screen.getByTestId('tile-name-ada:camera')).toBeTruthy();
  });

  it('nomme une personne sans nom par une chaîne traduite, image ou pas', async () => {
    await renderStage(layout(tile('ada:camera', { name: '' })));

    expect(screen.getByTestId('tile-name-ada:camera-text')).toHaveTextContent(
      'call.unnamedParticipant',
    );
  });

  it('pose le badge en bas à gauche de la tuile', async () => {
    // La couche n'est interrogeable que sans image — elle ne porte son `testID`
    // que là — mais c'est le même objet de style dans les deux cas.
    await renderStage(layout(tile('ada:camera', { track: null })));

    expect(screen.getByTestId('tile-placeholder-ada:camera')).toHaveStyle({
      justifyContent: 'flex-end',
      alignItems: 'flex-start',
    });
  });

  it('borne le badge à la largeur de la tuile plutôt que de le laisser déborder', async () => {
    // `overflow: 'hidden'` couperait net un badge plus large que sa tuile, et
    // `numberOfLines` ne borne QUE le nombre de lignes.
    await renderStage(layout(tile('ada:camera', { name: 'Ada' })));

    expect(screen.getByTestId('tile-name-ada:camera')).toHaveStyle({ maxWidth: '100%' });
    expect(screen.getByTestId('tile-name-ada:camera-text')).toHaveProp('numberOfLines', 1);
  });

  it('porte une couleur explicite et un voile qui tient sur n’importe quelle vidéo', async () => {
    // Le mockup pose 45 % de noir : sur une image blanche, `textDark` n'y
    // mesure que 2,85:1. À 60 % il mesure 4,86:1 dans ce même pire cas — voir
    // `NAME_SCRIM_COLOR` dans `stage.tsx`.
    await renderStage(layout(tile('ada:camera', { name: 'Ada' })));

    expect(screen.getByTestId('tile-name-ada:camera')).toHaveStyle({
      backgroundColor: NAME_SCRIM,
    });
    expect(screen.getByTestId('tile-name-ada:camera-text')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });
});
