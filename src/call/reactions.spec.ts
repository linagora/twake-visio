import {
  admitSend,
  appendReaction,
  encodeReaction,
  parseReaction,
  pruneReactions,
  reactionGlyph,
  REACTION_BURST,
  REACTION_KEYS,
  REACTION_LIFETIME_MS,
  REACTION_MAX_VISIBLE,
  REACTION_WINDOW_MS,
  type Reaction,
} from 'src/call/reactions';

function reaction(id: string, at: number, overrides: Partial<Reaction> = {}): Reaction {
  return {
    id,
    key: 'thumbs-up',
    identity: id,
    name: id,
    isLocal: false,
    at,
    ...overrides,
  };
}

describe('REACTION_KEYS', () => {
  it('porte exactement les huit valeurs de meet, dans leur ordre déclaré', () => {
    // L'ordre compte : c'est celui dans lequel `ReactionPicker` (tâche 4) les
    // pose en grille.
    expect([...REACTION_KEYS]).toEqual([
      'thumbs-up',
      'thumbs-down',
      'clapping-hands',
      'red-heart',
      'face-with-tears-of-joy',
      'face-with-open-mouth',
      'party-popper',
      'folded-hands',
    ]);
  });
});

describe('reactionGlyph', () => {
  it('rend le glyphe Unicode de chaque valeur', () => {
    expect(reactionGlyph('thumbs-up')).toBe('👍');
    expect(reactionGlyph('folded-hands')).toBe('🙏');
    // Une troisième, au milieu de la table : sans elle, une fonction qui ne
    // mapperait correctement que les deux bornes de la liste passerait.
    expect(reactionGlyph('red-heart')).toBe('❤️');
  });
});

describe('encodeReaction', () => {
  it('produit le JSON exact que meet attend', () => {
    expect(encodeReaction('thumbs-up')).toBe(
      '{"type":"reactionReceived","data":{"emoji":"thumbs-up"}}',
    );
    // Une seconde valeur, distincte : sans elle, une fonction qui rendrait
    // toujours la même chaîne littérale passerait le premier cas.
    expect(encodeReaction('party-popper')).toBe(
      '{"type":"reactionReceived","data":{"emoji":"party-popper"}}',
    );
  });
});

describe('parseReaction', () => {
  it('accepte les huit valeurs, aller-retour avec encodeReaction', () => {
    for (const key of REACTION_KEYS) {
      expect(parseReaction(encodeReaction(key))).toBe(key);
    }
  });

  it('rejette un JSON invalide, sans jeter', () => {
    expect(() => parseReaction('{not json')).not.toThrow();
    expect(parseReaction('{not json')).toBeNull();
  });

  it('rejette une chaîne vide', () => {
    expect(parseReaction('')).toBeNull();
  });

  it('rejette un type autre que reactionReceived', () => {
    // Le canal sans topic porte une douzaine d'autres types : les ignorer est
    // le fonctionnement normal, pas une erreur.
    expect(parseReaction('{"type":"participantMuted","data":{"emoji":"thumbs-up"}}')).toBeNull();
  });

  it('rejette un objet sans `data`', () => {
    expect(parseReaction('{"type":"reactionReceived"}')).toBeNull();
  });

  it('rejette un emoji hors liste', () => {
    expect(
      parseReaction('{"type":"reactionReceived","data":{"emoji":"thumbs-sideways"}}'),
    ).toBeNull();
  });

  it("rejette une valeur JSON qui n'est pas un objet", () => {
    expect(parseReaction('42')).toBeNull();
    expect(parseReaction('"thumbs-up"')).toBeNull();
    expect(parseReaction('null')).toBeNull();
    expect(parseReaction('[1,2,3]')).toBeNull();
  });
});

describe('admitSend', () => {
  it('autorise les dix premiers appels dans la fenêtre', () => {
    let recent: readonly number[] = [];
    for (let i = 0; i < REACTION_BURST; i += 1) {
      const result = admitSend(recent, 0);
      expect(result.allowed).toBe(true);
      recent = result.recent;
    }
    expect(recent).toHaveLength(REACTION_BURST);
  });

  it('refuse le onzième appel dans la même fenêtre, sans grossir la liste', () => {
    let recent: readonly number[] = [];
    for (let i = 0; i < REACTION_BURST; i += 1) recent = admitSend(recent, 0).recent;

    const eleventh = admitSend(recent, 0);

    expect(eleventh.allowed).toBe(false);
    expect(eleventh.recent).toHaveLength(REACTION_BURST);
  });

  it('autorise de nouveau une fois la fenêtre entièrement écoulée', () => {
    let recent: readonly number[] = [];
    for (let i = 0; i < REACTION_BURST; i += 1) recent = admitSend(recent, 0).recent;

    // À la borne exacte : la fenêtre est déjà entièrement écoulée à
    // `now === REACTION_WINDOW_MS`, pas seulement au-delà.
    expect(admitSend(recent, REACTION_WINDOW_MS).allowed).toBe(true);
    expect(admitSend(recent, REACTION_WINDOW_MS + 1).allowed).toBe(true);
  });
});

describe('appendReaction', () => {
  it('ajoute à la fin', () => {
    const list = appendReaction([reaction('a', 0)], reaction('b', 1));
    expect(list.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('plafonne à REACTION_MAX_VISIBLE en retirant la plus ancienne, la seconde comprise', () => {
    let list: readonly Reaction[] = [];
    for (let i = 0; i < REACTION_MAX_VISIBLE; i += 1) {
      list = appendReaction(list, reaction(`r${i}`, i));
    }
    expect(list).toHaveLength(REACTION_MAX_VISIBLE);

    const withOneMore = appendReaction(list, reaction('r-new', 99));

    expect(withOneMore).toHaveLength(REACTION_MAX_VISIBLE);
    const ids = withOneMore.map((r) => r.id);
    expect(ids).not.toContain('r0');
    // La DEUXIÈME plus ancienne reste : sans cette assertion, une fonction
    // qui viderait toute la liste avant d'ajouter passerait aussi.
    expect(ids).toContain('r1');
    expect(ids).toContain('r-new');
  });
});

describe('pruneReactions', () => {
  it('garde une réaction juste avant sa durée de vie', () => {
    expect(pruneReactions([reaction('a', 0)], REACTION_LIFETIME_MS - 1)).toHaveLength(1);
  });

  it('efface une réaction à exactement sa durée de vie', () => {
    expect(pruneReactions([reaction('a', 0)], REACTION_LIFETIME_MS)).toHaveLength(0);
  });

  it('ne touche pas aux réactions encore fraîches, la seconde comprise', () => {
    const list = [reaction('old', 0), reaction('fresh', 2000)];
    expect(pruneReactions(list, 3000).map((r) => r.id)).toEqual(['fresh']);
  });
});
