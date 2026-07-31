import {
  selectLayout,
  type VideoTrackRef,
  type ParticipantView,
  type RoomView,
} from 'src/call/layout';

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

describe('selectLayout — la scène', () => {
  it('montre sa propre caméra quand personne d’autre n’est là', () => {
    // Sans cela, la personne qui arrive la première regarde un rectangle noir
    // et croit que la séance est cassée.
    const layout = selectLayout(view(ME, []), 'user');

    expect(layout.stage.key).toBe('me');
    expect(layout.stage.isLocal).toBe(true);
  });

  it('laisse la scène à un distant dès qu’il y en a un, même silencieux', () => {
    // On n’a pas besoin de se regarder soi-même en grand : on tient le
    // téléphone. La grande surface va à l’autre.
    const layout = selectLayout(view(ME, [person('ada')]), 'user');

    expect(layout.stage.key).toBe('ada');
  });

  it('donne la scène à la personne qui parle', () => {
    const layout = selectLayout(
      view(ME, [person('ada', { lastSpokeAt: 10 }), person('bob', { isSpeaking: true })]),
      'user',
    );

    expect(layout.stage.key).toBe('bob');
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
    );

    expect(layout.stage.key).toBe('ada');
  });

  it('garde le dernier locuteur quand plus personne ne parle', () => {
    // Sinon la scène saute vers un inconnu — ou se vide — à chaque silence.
    const layout = selectLayout(
      view(ME, [person('ada', { lastSpokeAt: 5 }), person('bob', { lastSpokeAt: 50 })]),
      'user',
    );

    expect(layout.stage.key).toBe('bob');
  });

  it('départage deux locuteurs simultanés par le plus récent', () => {
    const layout = selectLayout(
      view(ME, [
        person('ada', { isSpeaking: true, lastSpokeAt: 5 }),
        person('bob', { isSpeaking: true, lastSpokeAt: 50 }),
      ]),
      'user',
    );

    expect(layout.stage.key).toBe('bob');
  });

  it('retombe sur l’ordre d’arrivée quand personne n’a jamais parlé', () => {
    const layout = selectLayout(
      view(ME, [person('zoe', { joinedAt: 1 }), person('ada', { joinedAt: 2 })]),
      'user',
    );

    expect(layout.stage.key).toBe('zoe');
  });

  it('reste déterministe quand même l’heure d’arrivée manque', () => {
    // `joinedAt` est facultatif côté SDK. Sans dernier départage, l’ordre des
    // vignettes dépendrait de celui de la Map du SDK et changerait tout seul.
    const layout = selectLayout(view(ME, [person('zoe'), person('ada')]), 'user');

    expect(layout.stage.key).toBe('ada');
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
    );

    expect(layout.stage.key).toBe('ada');
    expect(layout.stage.camera).toBeNull();
  });
});

describe('selectLayout — la bande de vignettes', () => {
  it('reste vide quand on est seul', () => {
    const layout = selectLayout(view(ME, []), 'user');

    expect(layout.filmstrip).toEqual([]);
  });

  it('n’affiche jamais deux fois la personne qui est à la scène', () => {
    const layout = selectLayout(
      view(ME, [person('ada', { isSpeaking: true }), person('bob')]),
      'user',
    );

    expect(layout.filmstrip.map((tile) => tile.key)).not.toContain(layout.stage.key);
  });

  it('ouvre la bande par sa propre vignette', () => {
    // Sa propre image a une place fixe : la chercher parmi des vignettes qui
    // bougent revient à ne jamais savoir si l’on est cadré.
    const layout = selectLayout(view(ME, [person('ada'), person('bob')]), 'user');

    expect(layout.filmstrip[0]?.key).toBe('me');
    expect(layout.filmstrip[0]?.isLocal).toBe(true);
  });

  it('ne se réordonne pas quand la parole change de camp', () => {
    // Une bande triée par la parole se réorganise sous le pouce : on appuie sur
    // la vignette de quelqu’un d’autre que celle qu’on visait.
    const layout = selectLayout(
      view(ME, [
        person('ada', { joinedAt: 1, lastSpokeAt: 1 }),
        person('bob', { joinedAt: 2, lastSpokeAt: 99 }),
        person('cid', { joinedAt: 3, isSpeaking: true }),
      ]),
      'user',
    );

    expect(layout.stage.key).toBe('cid');
    expect(layout.filmstrip.map((tile) => tile.key)).toEqual(['me', 'ada', 'bob']);
  });

  it('range les distants par ordre d’arrivée', () => {
    const layout = selectLayout(
      view(ME, [
        person('zoe', { joinedAt: 30 }),
        person('ada', { joinedAt: 10 }),
        person('bob', { joinedAt: 20, isSpeaking: true }),
      ]),
      'user',
    );

    expect(layout.filmstrip.map((tile) => tile.key)).toEqual(['me', 'ada', 'zoe']);
  });

  it('garde la vignette de qui a coupé sa caméra', () => {
    // Quelqu’un sans image reste dans la réunion : le faire disparaître de la
    // bande, c’est le sortir de la liste des présents.
    const layout = selectLayout(
      view(ME, [person('ada', { isSpeaking: true }), person('bob')]),
      'user',
    );

    expect(layout.filmstrip.map((tile) => tile.key)).toEqual(['me', 'bob']);
    expect(layout.filmstrip[1]?.camera).toBeNull();
  });
});

describe('selectLayout — les vignettes elles-mêmes', () => {
  it('transporte la piste sans la toucher', () => {
    const camera = fakeCamera('t-ada');

    const layout = selectLayout(view(ME, [person('ada', { camera })]), 'user');

    expect(layout.stage.camera).toBe(camera);
  });

  it('met sa propre image en miroir en caméra frontale', () => {
    // C’est le reflet auquel on s’attend en se regardant : sans miroir, lever
    // la main gauche fait bouger la main droite à l’écran.
    const layout = selectLayout(
      view({ ...ME, camera: fakeCamera('t-me') }, [person('ada')]),
      'user',
    );

    expect(layout.filmstrip[0]?.mirror).toBe(true);
  });

  it('cesse le miroir dès que la caméra passe à l’arrière', () => {
    // La caméra arrière filme le monde : le retourner rend tout texte illisible.
    const layout = selectLayout(view(ME, [person('ada')]), 'environment');

    expect(layout.filmstrip[0]?.mirror).toBe(false);
  });

  it('ne met jamais un distant en miroir', () => {
    const layout = selectLayout(view(ME, [person('ada')]), 'user');

    expect(layout.stage.mirror).toBe(false);
  });

  it('nettoie le nom pour que la coquille n’ait qu’une absence à traiter', () => {
    const layout = selectLayout(view(ME, [person('ada', { name: '  ' })]), 'user');

    expect(layout.stage.name).toBe('');
  });

  it('reporte la parole en cours sur la vignette', () => {
    const layout = selectLayout(
      view(ME, [person('ada', { isSpeaking: true }), person('bob', { isSpeaking: true })]),
      'user',
    );

    expect(layout.stage.isSpeaking).toBe(true);
    expect(layout.filmstrip.map((tile) => tile.isSpeaking)).toEqual([false, true]);
  });

  it('donne à chaque vignette une clé unique, tirée de l’identité et non du nom', () => {
    // La clé sert de clé React : deux vignettes qui la partagent remontent la
    // vidéo de l’une sur l’autre à chaque changement de liste. Deux homonymes
    // suffiraient donc à mélanger les images si la clé venait du nom.
    const layout = selectLayout(
      view(ME, [person('ada', { name: 'Ada' }), person('bob', { name: 'Ada' })]),
      'user',
    );

    const keys = [layout.stage.key, ...layout.filmstrip.map((tile) => tile.key)];
    expect(keys).toEqual(['ada', 'me', 'bob']);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
