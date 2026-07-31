import { handPosition, isHandRaised, raisedHands, readHandRaisedAt } from 'src/call/hands';
import type { ParticipantView, RoomView } from 'src/call/layout';

function person(
  identity: string,
  handRaisedAt: string | null,
  options: { name?: string; isLocal?: boolean } = {},
): ParticipantView {
  return {
    identity,
    name: options.name ?? identity,
    isLocal: options.isLocal ?? false,
    isSpeaking: false,
    lastSpokeAt: null,
    joinedAt: null,
    camera: null,
    screen: null,
    screenSince: null,
    handRaisedAt,
  };
}

function view(local: ParticipantView, remotes: readonly ParticipantView[]): RoomView {
  return { local, remotes };
}

describe('readHandRaisedAt', () => {
  it('lit un horodatage', () => {
    expect(readHandRaisedAt({ handRaisedAt: '2026-07-30T10:00:00Z' })).toBe('2026-07-30T10:00:00Z');
  });

  it('lit la chaîne vide comme une main baissée', () => {
    expect(readHandRaisedAt({ handRaisedAt: '' })).toBeNull();
  });

  it('lit une clé absente comme une main baissée', () => {
    expect(readHandRaisedAt({ color: '#fff' })).toBeNull();
  });

  it('tolère une carte absente', () => {
    expect(readHandRaisedAt(undefined)).toBeNull();
  });

  it('ne lit aucun autre attribut que celui de la main', () => {
    expect(readHandRaisedAt({ room_role: '2026-07-30T10:00:00Z' })).toBeNull();
  });

  it('ne modifie pas la carte d’attributs reçue', () => {
    // `Readonly<Record<string, string>>` empêche l'affectation au typage, pas
    // une assertion locale (`as Record<string, string>`) qui la
    // réintroduirait — la non-mutation vaut donc d'être vérifiée à
    // l'exécution, pas seulement supposée par le type.
    const attributes = { handRaisedAt: '2026-07-30T10:00:00Z', color: '#fff' };
    const snapshot = { ...attributes };

    readHandRaisedAt(attributes);

    expect(attributes).toEqual(snapshot);
  });
});

describe('isHandRaised', () => {
  it('suit le champ projeté', () => {
    expect(isHandRaised(person('a', '2026-07-30T10:00:00Z'))).toBe(true);
    expect(isHandRaised(person('a', null))).toBe(false);
  });
});

describe('raisedHands', () => {
  it('trie par horodatage croissant', () => {
    const hands = raisedHands(
      view(person('me', null, { isLocal: true }), [
        person('b', '2026-07-30T10:00:02Z'),
        person('a', '2026-07-30T10:00:01Z'),
      ]),
    );

    expect(hands.map((hand) => hand.identity)).toEqual(['a', 'b']);
  });

  it("inclut le participant local à sa place dans l'ordre", () => {
    const hands = raisedHands(
      view(person('me', '2026-07-30T10:00:02Z', { isLocal: true }), [
        person('a', '2026-07-30T10:00:01Z'),
        person('z', '2026-07-30T10:00:03Z'),
      ]),
    );

    expect(hands.map((hand) => hand.identity)).toEqual(['a', 'me', 'z']);
    expect(hands.map((hand) => hand.isLocal)).toEqual([false, true, false]);
  });

  it("départage deux horodatages égaux par l'identité", () => {
    const hands = raisedHands(
      view(person('me', null, { isLocal: true }), [
        person('zoe', '2026-07-30T10:00:00Z'),
        person('ada', '2026-07-30T10:00:00Z'),
      ]),
    );

    expect(hands.map((hand) => hand.identity)).toEqual(['ada', 'zoe']);
  });

  it('reporte le nom de chaque participant, pas son identité', () => {
    const hands = raisedHands(
      view(person('me', null, { isLocal: true }), [
        person('u-1', '2026-07-30T10:00:01Z', { name: 'Ada' }),
        person('u-2', '2026-07-30T10:00:02Z', { name: 'Bob' }),
      ]),
    );

    expect(hands.map((hand) => hand.name)).toEqual(['Ada', 'Bob']);
  });

  it('ignore un horodatage que Date.parse ne sait pas lire', () => {
    const hands = raisedHands(
      view(person('me', null, { isLocal: true }), [
        person('a', 'pas une date'),
        person('b', '2026-07-30T10:00:01Z'),
      ]),
    );

    expect(hands.map((hand) => hand.identity)).toEqual(['b']);
  });

  it('rend une file vide quand personne ne lève la main', () => {
    expect(raisedHands(view(person('me', null, { isLocal: true }), [person('a', null)]))).toEqual(
      [],
    );
  });

  it('convertit l’horodatage en millisecondes d’époque', () => {
    const hands = raisedHands(
      view(person('me', '2026-07-30T10:00:00.000Z', { isLocal: true }), []),
    );

    expect(hands[0]?.raisedAt).toBe(Date.parse('2026-07-30T10:00:00.000Z'));
  });

  it('ne modifie ni la vue reçue ni les participants qu’elle contient', () => {
    // `readonly` sur `RoomView.remotes` et sur chaque champ de
    // `ParticipantView` empêche l'affectation au typage, pas une assertion
    // locale (`as ParticipantView[]`) qui la réintroduirait — la file est le
    // terrain où cette fonction construit, trie, filtre : le seul de ce
    // module où une réécriture future pourrait plausiblement toucher le
    // tableau du dehors au lieu d'une copie.
    const local = person('me', null, { isLocal: true });
    const a = person('a', '2026-07-30T10:00:02Z');
    const b = person('b', '2026-07-30T10:00:01Z');
    const remotes = [a, b];
    const roomView = view(local, remotes);
    const remotesSnapshot = remotes.map((participant) => ({ ...participant }));
    const localSnapshot = { ...local };

    raisedHands(roomView);

    expect(remotes).toEqual(remotesSnapshot);
    expect(local).toEqual(localSnapshot);
  });
});

describe('handPosition', () => {
  it('rend une position 1-based', () => {
    const hands = raisedHands(
      view(person('me', '2026-07-30T10:00:03Z', { isLocal: true }), [
        person('a', '2026-07-30T10:00:01Z'),
        person('b', '2026-07-30T10:00:02Z'),
      ]),
    );

    expect(handPosition(hands, 'a')).toBe(1);
    expect(handPosition(hands, 'b')).toBe(2);
    expect(handPosition(hands, 'me')).toBe(3);
  });

  it('rend null pour une identité absente de la file', () => {
    const hands = raisedHands(view(person('me', null, { isLocal: true }), []));

    expect(handPosition(hands, 'me')).toBeNull();
  });

  it('ne modifie pas la file reçue', () => {
    // Même raisonnement que pour `raisedHands` : `readonly RaisedHand[]`
    // n'arrête qu'un contournement qui respecte le typage. `findIndex` seul
    // ne mute rien, mais rien ne garantit qu'un futur tri de confort,
    // inséré avant l'appel, ne le fasse en place sur cette même référence.
    const hands = raisedHands(
      view(person('me', '2026-07-30T10:00:03Z', { isLocal: true }), [
        person('b', '2026-07-30T10:00:02Z'),
        person('a', '2026-07-30T10:00:01Z'),
      ]),
    );
    const snapshot = hands.map((hand) => ({ ...hand }));

    handPosition(hands, 'a');

    expect(hands).toEqual(snapshot);
  });
});
