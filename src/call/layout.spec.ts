import type { Box } from 'src/call/grid';
import {
  selectLayout,
  type CallLayout,
  type VideoTrackRef,
  type ParticipantView,
  type RoomView,
} from 'src/call/layout';

// `CallLayout` est une union discriminée : `tsc` refuse de lire `tiles` sans
// savoir qu'on est en `grid`. Ces deux aides RÉTRÉCISSENT, et jettent avec le
// mode réellement obtenu — un `expect(l.mode).toBe('grid')` ne rétrécit rien
// pour TypeScript, et un `as` mentirait au premier test qui se tromperait de
// mode.
function asGrid(layout: CallLayout): Extract<CallLayout, { mode: 'grid' }> {
  if (layout.mode !== 'grid') throw new Error(`mode attendu 'grid', obtenu '${layout.mode}'`);
  return layout;
}

function asFocus(layout: CallLayout): Extract<CallLayout, { mode: 'focus' }> {
  if (layout.mode !== 'focus') throw new Error(`mode attendu 'focus', obtenu '${layout.mode}'`);
  return layout;
}

// La boîte de contenu de l'écran de couverture du Pixel 10 Pro Fold, tenu en
// portrait : 1080 × 2364 px à densité 390. La plupart des tests de ce fichier
// ne portent pas sur la géométrie et se contentent d'une boîte quelconque —
// mais il n'y a pas de boîte « neutre », et en choisir une réelle évite d'en
// inventer une qui ne ressemblerait à aucun appareil.
const PORTRAIT: Box = { width: 443, height: 900 };

// La même, tournée. Son rapport (2,48) dépasse `TILE_ASPECT`, celui de
// `PORTRAIT` (0,49) est très en dessous. Capacité : 6.
const LANDSCAPE: Box = { width: 969.85, height: 391.08 };

// Une boîte qui ne tient qu'UNE tuile au-dessus du plancher de 160 dp :
// 435 × 300 dp de contenu, une fois la marge de page retirée. C'est le seul
// endroit où la règle « la cellule unique va au premier distant, jamais à
// soi » est observable — et c'est donc là que vivent tous les tests de
// classement par la parole, hérités de l'ancien `pickStage`.
const ONE_CELL: Box = { width: 443, height: 308 };

// Une boîte qui en tient exactement TROIS : 435 × 520 dp de contenu. Assez
// pour observer la coupe (soi + deux distants sur quatre) sans avoir à
// fabriquer une réunion de six personnes.
const THREE_CELLS: Box = { width: 443, height: 528 };

// Une référence de piste opaque : `selectLayout` la transporte sans jamais la
// lire, il suffit donc qu'elle soit reconnaissable à l'identité.
function fakeCamera(sid: string): VideoTrackRef {
  return { publication: { trackSid: sid } } as unknown as VideoTrackRef;
}

function person(identity: string, overrides: Partial<ParticipantView> = {}): ParticipantView {
  return {
    identity,
    name: identity,
    isLocal: false,
    isSpeaking: false,
    micTrackSid: null,
    lastSpokeAt: null,
    joinedAt: null,
    camera: null,
    screen: null,
    screenSince: null,
    handRaisedAt: null,
    ...overrides,
  };
}

function view(local: ParticipantView, remotes: readonly ParticipantView[]): RoomView {
  return { local, remotes };
}

const ME = person('me', { isLocal: true, joinedAt: 0 });

// L'ancien `pickStage` a disparu ; sa RÈGLE, non. Elle décide désormais qui
// obtient une cellule quand il y a plus de monde que de cellules — et à UNE
// cellule, c'est exactement l'ancienne question, posée à l'identique. Chacun
// des tests ci-dessous est l'ancien test de scène, mot pour mot, sur une boîte
// qui ne tient qu'une tuile.
describe('selectLayout — le classement par la parole, observé à une seule cellule', () => {
  it('montre sa propre caméra quand personne d’autre n’est là', () => {
    // Sans cela, la personne qui arrive la première regarde un rectangle noir
    // et croit que la séance est cassée.
    const layout = selectLayout(view(ME, []), 'user', ONE_CELL, null);

    expect(asGrid(layout).tiles[0]?.key).toBe('me:camera');
    expect(asGrid(layout).tiles[0]?.isLocal).toBe(true);
  });

  it('laisse la scène à un distant dès qu’il y en a un, même silencieux', () => {
    // On n’a pas besoin de se regarder soi-même en grand : on tient le
    // téléphone. La grande surface va à l’autre.
    const layout = selectLayout(view(ME, [person('ada')]), 'user', ONE_CELL, null);

    expect(asGrid(layout).tiles[0]?.key).toBe('ada:camera');
  });

  it('donne la scène à la personne qui parle', () => {
    const layout = selectLayout(
      view(ME, [person('ada', { lastSpokeAt: 10 }), person('bob', { isSpeaking: true })]),
      'user',
      ONE_CELL,
      null,
    );

    expect(asGrid(layout).tiles[0]?.key).toBe('bob:camera');
  });

  it('fait passer celui qui parle devant un locuteur plus récent mais silencieux', () => {
    // La récence ne doit pas l’emporter sur la parole en cours : c’est
    // exactement le cas où l’on regarderait quelqu’un qui vient de se taire
    // pendant qu’un autre parle.
    const layout = selectLayout(
      view(ME, [
        person('ada', { isSpeaking: true, lastSpokeAt: 5 }),
        person('bob', { isSpeaking: false, lastSpokeAt: 50 }),
      ]),
      'user',
      ONE_CELL,
      null,
    );

    expect(asGrid(layout).tiles[0]?.key).toBe('ada:camera');
  });

  it('garde le dernier locuteur quand plus personne ne parle', () => {
    // Sinon la scène saute vers un inconnu — ou se vide — à chaque silence.
    const layout = selectLayout(
      view(ME, [person('ada', { lastSpokeAt: 5 }), person('bob', { lastSpokeAt: 50 })]),
      'user',
      ONE_CELL,
      null,
    );

    expect(asGrid(layout).tiles[0]?.key).toBe('bob:camera');
  });

  it('départage deux locuteurs simultanés par le plus récent', () => {
    const layout = selectLayout(
      view(ME, [
        person('ada', { isSpeaking: true, lastSpokeAt: 5 }),
        person('bob', { isSpeaking: true, lastSpokeAt: 50 }),
      ]),
      'user',
      ONE_CELL,
      null,
    );

    expect(asGrid(layout).tiles[0]?.key).toBe('bob:camera');
  });

  it('retombe sur l’ordre d’arrivée quand personne n’a jamais parlé', () => {
    const layout = selectLayout(
      view(ME, [person('zoe', { joinedAt: 1 }), person('ada', { joinedAt: 2 })]),
      'user',
      ONE_CELL,
      null,
    );

    expect(asGrid(layout).tiles[0]?.key).toBe('zoe:camera');
  });

  it('reste déterministe quand même l’heure d’arrivée manque', () => {
    // `joinedAt` est facultatif côté SDK. Sans dernier départage, l’ordre des
    // vignettes dépendrait de celui de la Map du SDK et changerait tout seul.
    const layout = selectLayout(view(ME, [person('zoe'), person('ada')]), 'user', ONE_CELL, null);

    expect(asGrid(layout).tiles[0]?.key).toBe('ada:camera');
  });

  it('ne cède pas la scène parce que la caméra du locuteur est coupée', () => {
    // La sélection porte sur la personne, pas sur la piste : celui qui parle
    // reste en grand même sans image, sinon la scène change à chaque caméra
    // qu’on coupe et l’on regarde quelqu’un qui se tait.
    const layout = selectLayout(
      view(ME, [
        person('ada', { isSpeaking: true, camera: null }),
        person('bob', { camera: fakeCamera('t-bob') }),
      ]),
      'user',
      ONE_CELL,
      null,
    );

    expect(asGrid(layout).tiles[0]?.key).toBe('ada:camera');
    expect(asGrid(layout).tiles[0]?.track).toBeNull();
  });
});

// L'ordre des cellules est l'ordre STABLE — arrivée, puis identité —, jamais
// le classement par la parole. Le motif est celui que la bande porte déjà :
// une cellule qui change de place sous le pouce est pire qu'une cellule
// absente. Tant que tout le monde tient, la grille ne bouge donc jamais.
describe('selectLayout — l’ordre des cellules de la grille', () => {
  it('ne montre que soi quand on est seul', () => {
    const layout = selectLayout(view(ME, []), 'user', PORTRAIT, null);

    expect(asGrid(layout).tiles.map((t) => t.key)).toEqual(['me:camera']);
    expect(asGrid(layout).overflow).toBe(0);
  });

  it('ouvre la grille par sa propre cellule', () => {
    // Sa propre image a une place fixe : la chercher parmi des tuiles qui
    // bougent revient à ne jamais savoir si l’on est cadré.
    const layout = selectLayout(view(ME, [person('ada'), person('bob')]), 'user', PORTRAIT, null);

    expect(asGrid(layout).tiles[0]?.key).toBe('me:camera');
    expect(asGrid(layout).tiles[0]?.isLocal).toBe(true);
  });

  it('ne se réordonne pas quand la parole change de camp', () => {
    // Copie fidèle du test de bande : trois personnes, le dernier arrivé
    // parle, l’ordre rendu reste celui de l’arrivée.
    const layout = selectLayout(
      view(ME, [
        person('ada', { joinedAt: 1, lastSpokeAt: 1 }),
        person('bob', { joinedAt: 2, lastSpokeAt: 99 }),
        person('cid', { joinedAt: 3, isSpeaking: true }),
      ]),
      'user',
      PORTRAIT,
      null,
    );

    expect(asGrid(layout).tiles.map((tile) => tile.key)).toEqual([
      'me:camera',
      'ada:camera',
      'bob:camera',
      'cid:camera',
    ]);
  });

  it('range les distants par ordre d’arrivée', () => {
    const layout = selectLayout(
      view(ME, [
        person('zoe', { joinedAt: 30 }),
        person('ada', { joinedAt: 10 }),
        person('bob', { joinedAt: 20, isSpeaking: true }),
      ]),
      'user',
      PORTRAIT,
      null,
    );

    expect(asGrid(layout).tiles.map((tile) => tile.key)).toEqual([
      'me:camera',
      'ada:camera',
      'bob:camera',
      'zoe:camera',
    ]);
  });

  it('garde la cellule de qui a coupé sa caméra', () => {
    // Quelqu’un sans image reste dans la réunion : le faire disparaître de la
    // grille, c’est le sortir de la liste des présents.
    const layout = selectLayout(
      view(ME, [person('ada', { isSpeaking: true }), person('bob')]),
      'user',
      PORTRAIT,
      null,
    );

    expect(asGrid(layout).tiles.map((tile) => tile.key)).toEqual([
      'me:camera',
      'ada:camera',
      'bob:camera',
    ]);
    expect(asGrid(layout).tiles[2]?.track).toBeNull();
  });
});

// La coupe : au-delà de la capacité, l'APPARTENANCE suit le classement par la
// parole, et `overflow` compte ce qui manque. C'est le seul endroit où la
// grille remue — et l'épinglage est la réponse offerte à qui n'en veut pas.
describe('selectLayout — la coupe au-delà de la capacité', () => {
  it('garde ceux qui parlent, pas ceux qui sont arrivés les premiers', () => {
    // Le locuteur est placé en DERNIÈRE position d'arrivée : un tri qui
    // garderait simplement les premiers arrivés l'exclurait, et ce test
    // rougirait. Trois cellules, quatre distants plus soi.
    const layout = selectLayout(
      view(ME, [
        person('ada', { joinedAt: 1 }),
        person('bob', { joinedAt: 2 }),
        person('cid', { joinedAt: 3 }),
        person('zoe', { joinedAt: 4, isSpeaking: true }),
      ]),
      'user',
      THREE_CELLS,
      null,
    );

    // Soi en tête hors classement, puis les deux mieux classés — rangés dans
    // l'ordre stable, jamais dans celui du classement.
    expect(asGrid(layout).tiles.map((t) => t.key)).toEqual([
      'me:camera',
      'ada:camera',
      'zoe:camera',
    ]);
  });

  it('compte ce que la boîte n’a pas pu montrer', () => {
    const layout = selectLayout(
      view(ME, [person('ada'), person('bob'), person('cid'), person('zoe')]),
      'user',
      THREE_CELLS,
      null,
    );

    expect(asGrid(layout).tiles).toHaveLength(3);
    expect(asGrid(layout).overflow).toBe(2);
  });

  it('ne compte aucun débordement tant que tout le monde tient', () => {
    // L'autre côté de la paire : MÊME vue, MÊME appel, seule la boîte change.
    const layout = selectLayout(
      view(ME, [person('ada'), person('bob'), person('cid'), person('zoe')]),
      'user',
      PORTRAIT,
      null,
    );

    expect(asGrid(layout).tiles).toHaveLength(5);
    expect(asGrid(layout).overflow).toBe(0);
  });

  it('garde toujours sa propre cellule dès que la capacité dépasse une tuile', () => {
    // Soi est hors classement : quatre distants qui parlent tous ne peuvent
    // pas déloger sa propre cellule de la première place.
    const layout = selectLayout(
      view(ME, [
        person('ada', { isSpeaking: true }),
        person('bob', { isSpeaking: true }),
        person('cid', { isSpeaking: true }),
        person('zoe', { isSpeaking: true }),
      ]),
      'user',
      THREE_CELLS,
      null,
    );

    expect(asGrid(layout).tiles[0]?.key).toBe('me:camera');
    expect(asGrid(layout).tiles[0]?.isLocal).toBe(true);
  });

  it('cède sa propre cellule au premier distant quand il n’y en a qu’une', () => {
    // La seule exception, et c'est mot pour mot l'ancienne règle de la scène :
    // on tient le téléphone, on n'a pas besoin de se voir en grand.
    const layout = selectLayout(view(ME, [person('ada')]), 'user', ONE_CELL, null);

    expect(asGrid(layout).tiles.map((t) => t.key)).toEqual(['ada:camera']);
    expect(asGrid(layout).overflow).toBe(1);
  });
});

// La géométrie arrive déjà calculée : la coquille ne décide ni le nombre de
// colonnes, ni la taille des cellules.
describe('selectLayout — la géométrie de la grille', () => {
  it('reste sur une colonne en portrait, et passe à deux en paysage', () => {
    // Le MÊME nombre de tuiles, la MÊME fonction, deux réponses : une
    // implémentation qui rendrait une constante passerait l'un des deux seul.
    const two = view(ME, [person('ada')]);

    expect(asGrid(selectLayout(two, 'user', PORTRAIT, null)).columns).toBe(1);
    expect(asGrid(selectLayout(two, 'user', LANDSCAPE, null)).columns).toBe(2);
  });

  it('inscrit le gabarit dans chaque cellule, et retire la marge de page', () => {
    // 443 − 2 × 4 = 435 dp de contenu ; une colonne, deux rangées, donc la
    // largeur commande : 435 × 244,7. Sans le retrait de la marge, on lirait
    // 443 — et les cellules déborderaient de la page de 8 dp.
    const layout = asGrid(selectLayout(view(ME, [person('ada')]), 'user', PORTRAIT, null));

    expect(layout.tileWidth).toBeCloseTo(435, 6);
    expect(layout.tileHeight).toBeCloseTo(244.6875, 4);
  });
});

// L'union rend la chose structurellement impossible ; ce test fixe la RÈGLE DE
// PRÉCÉDENCE qui la produit, et rougirait si quelqu'un la renversait.
describe('selectLayout — la précédence des trois règles', () => {
  it('donne le focus à l’épinglage, même contre un partage en cours', () => {
    // Le locuteur est délibérément quelqu'un d'AUTRE que la personne épinglée :
    // sans cela, une implémentation qui laisserait la parole décider passerait
    // par coïncidence.
    const ada = person('u-ada', {
      camera: fakeCamera('cam-ada'),
      screen: fakeCamera('scr-ada'),
      screenSince: 1000,
    });
    const bob = person('u-bob', { isSpeaking: true, camera: fakeCamera('cam-bob') });

    const layout = selectLayout(view(ME, [ada, bob]), 'user', PORTRAIT, 'u-ada:camera');

    expect(asFocus(layout).focus.key).toBe('u-ada:camera');
    expect(asFocus(layout).pinned).toBe(true);
  });

  it('donne le focus au partage quand rien n’est épinglé', () => {
    const ada = person('u-ada', { screen: fakeCamera('scr-ada'), screenSince: 1000 });
    const bob = person('u-bob', { isSpeaking: true, camera: fakeCamera('cam-bob') });

    const layout = selectLayout(view(ME, [ada, bob]), 'user', PORTRAIT, null);

    expect(asFocus(layout).focus.key).toBe('u-ada:screen');
    expect(asFocus(layout).pinned).toBe(false);
  });

  it('retombe sur la grille quand ni l’un ni l’autre', () => {
    const bob = person('u-bob', { isSpeaking: true, camera: fakeCamera('cam-bob') });

    expect(selectLayout(view(ME, [bob]), 'user', PORTRAIT, null).mode).toBe('grid');
  });

  it('ignore un épinglage qui ne résout pas, et retombe sur la règle suivante', () => {
    // Le fait 9 sous sa forme locale : on lit ce qui est PRÉSENT, on n'attend
    // pas qu'on nous dise ce qui est parti. Ce test mord si quelqu'un ajoute
    // une logique d'expiration au lieu de résoudre.
    const ada = person('u-ada', { screen: fakeCamera('scr-ada'), screenSince: 1000 });

    const layout = selectLayout(view(ME, [ada]), 'user', PORTRAIT, 'u-parti:camera');

    expect(asFocus(layout).focus.key).toBe('u-ada:screen');
    expect(asFocus(layout).pinned).toBe(false);
  });

  it('n’admet jamais un écran dans une cellule de grille', () => {
    // Un écran ne peut pas être rogné — « un texte coupé est un texte perdu »
    // — donc il exige une boîte à lui, donc il force le mode `focus`. L'union
    // le rend structurellement impossible ; ce test garde la règle de
    // précédence qui l'établit.
    const ada = person('u-ada', {
      camera: fakeCamera('cam-ada'),
      screen: fakeCamera('scr-ada'),
      screenSince: 1000,
    });

    expect(selectLayout(view(ME, [ada]), 'user', PORTRAIT, null).mode).toBe('focus');
  });
});

describe('selectLayout — les tuiles elles-mêmes', () => {
  it('transporte la piste sans la toucher', () => {
    const camera = fakeCamera('t-ada');

    const layout = selectLayout(view(ME, [person('ada', { camera })]), 'user', PORTRAIT, null);

    expect(asGrid(layout).tiles[1]?.track).toBe(camera);
  });

  it('met sa propre image en miroir en caméra frontale', () => {
    // C’est le reflet auquel on s’attend en se regardant : sans miroir, lever
    // la main gauche fait bouger la main droite à l’écran.
    const layout = selectLayout(
      view({ ...ME, camera: fakeCamera('t-me') }, [person('ada')]),
      'user',
      PORTRAIT,
      null,
    );

    expect(asGrid(layout).tiles[0]?.mirror).toBe(true);
  });

  it('cesse le miroir dès que la caméra passe à l’arrière', () => {
    // La caméra arrière filme le monde : le retourner rend tout texte illisible.
    const layout = selectLayout(view(ME, [person('ada')]), 'environment', PORTRAIT, null);

    expect(asGrid(layout).tiles[0]?.mirror).toBe(false);
  });

  it('ne met jamais un distant en miroir', () => {
    const layout = selectLayout(view(ME, [person('ada')]), 'user', PORTRAIT, null);

    expect(asGrid(layout).tiles[1]?.mirror).toBe(false);
  });

  it('nettoie le nom pour que la coquille n’ait qu’une absence à traiter', () => {
    const layout = selectLayout(view(ME, [person('ada', { name: '  ' })]), 'user', PORTRAIT, null);

    expect(asGrid(layout).tiles[1]?.name).toBe('');
  });

  it('reporte la parole en cours sur la vignette', () => {
    const layout = selectLayout(
      view(ME, [person('ada', { isSpeaking: true }), person('bob', { isSpeaking: true })]),
      'user',
      PORTRAIT,
      null,
    );

    expect(asGrid(layout).tiles.map((tile) => tile.isSpeaking)).toEqual([false, true, true]);
  });

  it('donne à chaque vignette une clé unique, tirée de l’identité et non du nom', () => {
    // La clé sert de clé React : deux vignettes qui la partagent remontent la
    // vidéo de l’une sur l’autre à chaque changement de liste. Deux homonymes
    // suffiraient donc à mélanger les images si la clé venait du nom.
    const layout = selectLayout(
      view(ME, [person('ada', { name: 'Ada' }), person('bob', { name: 'Ada' })]),
      'user',
      PORTRAIT,
      null,
    );

    const keys = asGrid(layout).tiles.map((tile) => tile.key);
    expect(keys).toEqual(['me:camera', 'ada:camera', 'bob:camera']);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // Le commentaire d'origine disait vrai — « deux vignettes qui partagent une clé
  // échangent leur vidéo au moindre changement de liste » — mais son hypothèse ne
  // tient plus : une personne qui partage produit DEUX tuiles.
  //
  // Passe par `selectLayout`, comme le reste de ce fichier : `pickScreen` lui
  // fait désormais emprunter la branche `'screen'` de `toTile`, donc plus besoin
  // de l'appeler directement pour observer le format de la clé. La vérification
  // porte sur l'ensemble du layout rendu (scène et bande), pas seulement sur les
  // deux tuiles d'Alice : « montre le présentateur deux fois », plus bas, prouve
  // déjà ces deux valeurs précises — celui-ci généralise à l'unicité globale.
  it('donne deux clés différentes au visage et à l’écran d’une même personne', () => {
    const alice = person('u-alice', {
      camera: fakeCamera('cam-1'),
      screen: fakeCamera('scr-1'),
      screenSince: 1000,
    });

    const layout = selectLayout(view(ME, [alice]), 'user', PORTRAIT, null);

    const keys = [asFocus(layout).focus.key, ...asFocus(layout).filmstrip.map((t) => t.key)];
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('u-alice:screen');
    expect(keys).toContain('u-alice:camera');
  });

  // Passe désormais par `selectLayout`, pour la même raison que ci-dessus : Alice
  // seule et en train de partager suffit à lui faire emprunter la branche
  // `toTile(presenter, 'screen', facing)`.
  it('ne met jamais en miroir son propre écran partagé, même en caméra frontale', () => {
    // Sans la condition `source === 'camera'`, une tuile d'écran locale
    // hériterait du miroir de sa caméra — retournant tout texte affiché dessus,
    // ce qui est précisément ce qu'on partage.
    const me = { ...ME, screen: fakeCamera('scr-me'), screenSince: 1000 };

    const layout = selectLayout(view(me, []), 'user', PORTRAIT, null);

    expect(asFocus(layout).focus.mirror).toBe(false);
  });
});

describe('un écran partagé prend la scène', () => {
  // Le locuteur est délibérément QUELQU'UN D'AUTRE que le présentateur : si les
  // deux étaient la même personne, une implémentation qui laisserait la parole
  // décider passerait par coïncidence.
  it('passe devant celui qui parle', () => {
    const alice = person('u-alice', { screen: fakeCamera('scr-1'), screenSince: 1000 });
    const bob = person('u-bob', { isSpeaking: true, camera: fakeCamera('cam-2') });

    const layout = selectLayout(view(ME, [alice, bob]), 'user', PORTRAIT, null);

    expect(asFocus(layout).focus.source).toBe('screen');
    expect(asFocus(layout).focus.key).toBe('u-alice:screen');
  });

  // L'ordre d'insertion est l'INVERSE de l'ordre attendu : `ancien` (qui doit
  // perdre) est inséré en premier, `recent` (qui doit gagner) en second. Un tri
  // qui rendrait le premier venu passerait sinon.
  it('retient le plus récent quand deux personnes partagent', () => {
    const ancien = person('u-alice', { screen: fakeCamera('scr-1'), screenSince: 1000 });
    const recent = person('u-bob', { screen: fakeCamera('scr-2'), screenSince: 2000 });

    const layout = selectLayout(view(ME, [ancien, recent]), 'user', PORTRAIT, null);

    expect(asFocus(layout).focus.key).toBe('u-bob:screen');
  });

  it('départage deux partages simultanés par l’ordre stable, jamais par l’ordre de la liste', () => {
    // Le même instant n'est pas un cas limite : c'est le cas NORMAL de la
    // jonction. `sinceFor` (src/call/participants.ts) horodate avec `Date.now()`
    // dans la même passe synchrone de lecture, donc deux partages découverts
    // ensemble reçoivent la même milliseconde. Sans départage déterministe, le
    // gagnant serait le premier de la Map du SDK — que ce fichier qualifie
    // lui-même de « stable pour personne » (ligne 92) — et la scène sauterait
    // d'un écran à l'autre entre deux rendus.
    //
    // Bob est inséré EN PREMIER alors qu'Alice doit gagner : un « premier
    // trouvé, gagnant » implicite passerait ce test si l'ordre n'était pas
    // inversé.
    const bob = person('u-bob', { screen: fakeCamera('scr-b'), screenSince: 1000 });
    const alice = person('u-alice', { screen: fakeCamera('scr-a'), screenSince: 1000 });

    const layout = selectLayout(view(ME, [bob, alice]), 'user', PORTRAIT, null);

    expect(asFocus(layout).focus.key).toBe('u-alice:screen');
  });

  it('rend tout le monde à la grille quand le partage cesse', () => {
    // L'ancien test disait « rend la scène à la parole ». Il n'y a plus de
    // scène quand personne ne partage : c'est précisément ce que la grille
    // supprime, et délibérément — la grande scène est la géométrie qui produit
    // les bandes noires mesurées. Ce que la règle garde, c'est qu'un partage
    // absent ne retient plus rien.
    const alice = person('u-alice', { screen: null });
    const bob = person('u-bob', { isSpeaking: true, camera: fakeCamera('cam-2') });

    const layout = selectLayout(view(ME, [alice, bob]), 'user', PORTRAIT, null);

    expect(layout.mode).toBe('grid');
    expect(asGrid(layout).tiles.map((t) => t.key)).toEqual([
      'me:camera',
      'u-alice:camera',
      'u-bob:camera',
    ]);
  });

  it('montre le présentateur deux fois : son écran à la scène, son visage dans la bande', () => {
    const alice = person('u-alice', {
      camera: fakeCamera('cam-1'),
      screen: fakeCamera('scr-1'),
      screenSince: 1000,
    });

    const layout = selectLayout(view(ME, [alice]), 'user', PORTRAIT, null);

    expect(asFocus(layout).focus.key).toBe('u-alice:screen');
    expect(asFocus(layout).filmstrip.map((t) => t.key)).toContain('u-alice:camera');
  });

  it('laisse les autres partages dans la bande', () => {
    const a = person('u-a', { screen: fakeCamera('scr-1'), screenSince: 1000 });
    const b = person('u-b', { screen: fakeCamera('scr-2'), screenSince: 2000 });

    const layout = selectLayout(view(ME, [a, b]), 'user', PORTRAIT, null);

    expect(asFocus(layout).focus.key).toBe('u-b:screen');
    // L'ordre entier, pas seulement la présence : les visages d'abord, l'écran restant ensuite.
    expect(asFocus(layout).filmstrip.map((t) => t.key)).toEqual([
      'me:camera',
      'u-a:camera',
      'u-b:camera',
      'u-a:screen',
    ]);
  });
});

describe('selectLayout — l’épinglage', () => {
  it('épingle la tuile demandée, même quand quelqu’un partage son écran', () => {
    // Le cas qui justifie toute la fonction : sans épinglage, l'écran prend la
    // scène et aucun visage ne peut y revenir — c'est ce qui a fait revenir
    // cette fonction après qu'on l'eut retirée.
    const ada = person('u-ada', {
      camera: fakeCamera('cam-ada'),
      screen: fakeCamera('scr-ada'),
      screenSince: 1000,
    });

    const layout = selectLayout(view(ME, [ada]), 'user', PORTRAIT, 'u-ada:camera');

    expect(asFocus(layout).focus.key).toBe('u-ada:camera');
    expect(asFocus(layout).pinned).toBe(true);
    // La tuile promue quitte la bande, et l'écran y descend.
    expect(asFocus(layout).filmstrip.map((t) => t.key)).toContain('u-ada:screen');
    expect(asFocus(layout).filmstrip.map((t) => t.key)).not.toContain('u-ada:camera');
  });

  it('sans épinglage, l’écran garde la scène', () => {
    // L'autre côté de la paire ci-dessus : MÊME vue, MÊME appel, seule la clé
    // d'épinglage change. C'est la paire qui prouve que `pin` est câblé, pas
    // l'un des deux tests pris seul.
    const ada = person('u-ada', {
      camera: fakeCamera('cam-ada'),
      screen: fakeCamera('scr-ada'),
      screenSince: 1000,
    });

    const layout = selectLayout(view(ME, [ada]), 'user', PORTRAIT, null);

    expect(asFocus(layout).focus.key).toBe('u-ada:screen');
    expect(asFocus(layout).pinned).toBe(false);
  });

  it('ignore un épinglage qui ne résout plus, sans rien casser', () => {
    // Quelqu'un est parti ; la clé reste posée côté coquille. On retombe sur la
    // règle ordinaire plutôt que de rendre une scène vide.
    const layout = selectLayout(view(ME, []), 'user', PORTRAIT, 'u-parti:camera');

    expect(layout.mode).toBe('grid');
    expect(asGrid(layout).tiles[0]?.key).toBe('me:camera');
  });
});

// Le comparatif juste est `W / H` contre `TILE_ASPECT`, jamais `width > height`.
// L'écran interne du Pixel 10 Pro Fold fait 2076 × 2152 : le prédicat binaire y
// est faux, le rapport vaut 0,965, et l'appareil tourné donne 1,037 — un seuil
// posé à 1,000 retournerait donc toute la disposition sur 3,5 % de géométrie.
// Le seuil réel, 1,778, est loin de la zone où cet appareil vit.
describe('selectLayout — l’axe de la bande', () => {
  // Il n'y a de bande qu'en mode `focus` : un partage d'écran est le fixateur
  // le plus court pour y entrer sans rien épingler.
  const SHARING = view(ME, [person('u-ada', { screen: fakeCamera('scr-ada'), screenSince: 1000 })]);

  it('range la bande sous la scène quand la boîte est plus étroite que le gabarit', () => {
    expect(asFocus(selectLayout(SHARING, 'user', PORTRAIT, null)).stripAxis).toBe('row');
  });

  it('range la bande sur le côté quand la boîte est plus large que le gabarit', () => {
    expect(asFocus(selectLayout(SHARING, 'user', LANDSCAPE, null)).stripAxis).toBe('column');
  });

  it('répond pareil dans les deux postures du pliable ouvert', () => {
    // 843,7 × 822,9 dp puis 822,9 × 843,7 : les deux sont SOUS le seuil, donc
    // la bande reste dessous des deux côtés. C'est LE test qui mord si le
    // comparatif redevient `width > height` — dans ce cas la première posture
    // rendrait `'column'`.
    const open: Box = { width: 851.7, height: 830.9 };
    const turned: Box = { width: 830.9, height: 851.7 };

    expect(asFocus(selectLayout(SHARING, 'user', open, null)).stripAxis).toBe('row');
    expect(asFocus(selectLayout(SHARING, 'user', turned, null)).stripAxis).toBe('row');
  });
});
