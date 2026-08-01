import {
  appendMessage,
  CHAT_GROUPING_MS,
  CHAT_MAX_LENGTH,
  CHAT_TOPIC,
  messageKey,
  normaliseBody,
  startsGroup,
  unreadCount,
  type ChatMessage,
} from 'src/call/chat';

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 's-1',
    identity: 'u-ada',
    name: 'Ada',
    body: 'bonjour',
    sentAt: 1_000,
    editedAt: null,
    isLocal: false,
    ...overrides,
  };
}

describe('CHAT_TOPIC', () => {
  it("porte le topic de meet, qu'aucune constante du SDK ne donne", () => {
    // Écrit en dur ici et nulle part ailleurs : `@livekit/components-core`,
    // d'où il vient, n'est pas une dépendance déclarée.
    expect(CHAT_TOPIC).toBe('lk.chat');
  });
});

describe('messageKey', () => {
  it("distingue deux messages de même identifiant venus d'émetteurs différents", () => {
    // Un `TextStreamInfo.id` est unique par flux, pas par salon : deux
    // vignettes qui partageraient une clé échangeraient leur contenu.
    expect(messageKey(message({ id: 's-1', identity: 'u-ada' }))).not.toBe(
      messageKey(message({ id: 's-1', identity: 'u-bob' })),
    );
  });

  it('rend la même clé pour le même message', () => {
    expect(messageKey(message({ id: 's-1', identity: 'u-ada' }))).toBe(
      messageKey(message({ id: 's-1', identity: 'u-ada', body: 'autre corps' })),
    );
  });
});

describe('appendMessage', () => {
  it('ajoute un message inconnu à la fin', () => {
    const log = appendMessage([message({ id: 's-1' })], message({ id: 's-2', body: 'la suite' }));

    expect(log.map((entry) => entry.id)).toEqual(['s-1', 's-2']);
    expect(log.map((entry) => entry.body)).toEqual(['bonjour', 'la suite']);
  });

  it('remplace un message de même id ET de même identité, EN PLACE', () => {
    // Une correction de faute de frappe ne doit pas faire sauter le message
    // hors de la conversation qu'il commente.
    const log = appendMessage(
      [message({ id: 's-1', body: 'bonjur' }), message({ id: 's-2', body: 'la suite' })],
      message({ id: 's-1', body: 'bonjour', sentAt: 9_000 }),
    );

    expect(log).toHaveLength(2);
    expect(log.map((entry) => entry.id)).toEqual(['s-1', 's-2']);
    expect(log[0]?.body).toBe('bonjour');
  });

  it("conserve le sentAt d'origine et pose editedAt", () => {
    const log = appendMessage(
      [message({ id: 's-1', sentAt: 1_000 })],
      message({ id: 's-1', body: 'corrigé', sentAt: 9_000 }),
    );

    expect(log[0]?.sentAt).toBe(1_000);
    expect(log[0]?.editedAt).toBe(9_000);
  });

  it("n'écrase jamais le message d'un autre, même à identifiant égal", () => {
    // Le seul test qui distingue une fusion correcte d'une fusion sur le seul
    // `id` : un participant ne réécrit pas le message d'un autre en rejouant
    // son identifiant de flux.
    const log = appendMessage(
      [message({ id: 's-1', identity: 'u-ada', body: 'bonjour' })],
      message({ id: 's-1', identity: 'u-bob', body: 'la suite' }),
    );

    expect(log).toHaveLength(2);
    expect(log.map((entry) => entry.identity)).toEqual(['u-ada', 'u-bob']);
  });

  it('ne modifie pas le tableau reçu', () => {
    const before: readonly ChatMessage[] = [message({ id: 's-1' })];

    appendMessage(before, message({ id: 's-1', body: 'corrigé' }));

    expect(before[0]?.body).toBe('bonjour');
  });
});

describe('unreadCount', () => {
  const keys = (...ms: ChatMessage[]): ReadonlySet<string> => new Set(ms.map(messageKey));

  it('compte les messages distants que le point de lecture ne couvre pas', () => {
    const lu = message({ id: 's-1' });
    const log = [lu, message({ id: 's-2' }), message({ id: 's-3' })];

    expect(unreadCount(log, keys(lu))).toBe(2);
  });

  it('ne compte jamais les siens', () => {
    // On vient de les écrire : les compter ferait clignoter la pastille sur
    // son propre message.
    const log = [message({ id: 's-1', isLocal: true, identity: 'me' }), message({ id: 's-2' })];

    expect(unreadCount(log, new Set())).toBe(1);
  });

  it("ne dépend d'AUCUNE horloge : un pair en avance ne masque pas les autres", () => {
    // LE défaut que ce point de lecture corrige. `sentAt` vient de l'horloge de
    // l'ÉMETTEUR — livekit-client le prend du `Date.now()` du pair dans
    // `streamText`. Un repère TEMPOREL prenait le maximum du fil, donc un seul
    // pair en avance d'une heure le hissait au-dessus de toutes les horloges
    // honnêtes et rendait le compte définitivement nul, pour tout le monde et
    // pour le reste de la séance. Mesuré : dix messages attendus, zéro obtenu.
    //
    // DEUX émetteurs, jamais un seul : l'ancienne fixture n'en avait qu'un, et
    // c'est précisément ce qui a laissé passer le défaut.
    const now = 1_700_000_000_000;
    const enAvance = message({ id: 's-1', identity: 'u-derive', sentAt: now + 3_600_000 });
    const honnetes = Array.from({ length: 10 }, (_, i) =>
      message({ id: `h-${i}`, identity: 'u-bob', sentAt: now + i * 1_000 }),
    );

    // On a lu le message du pair en avance, et lui seul.
    expect(unreadCount([enAvance, ...honnetes], keys(enAvance))).toBe(10);
  });

  it("garde lu un message que son auteur a corrigé, l'édition ne changeant pas sa clé", () => {
    // `appendMessage` fusionne en place : `id` et `identity` survivent, donc la
    // clé aussi. C'est ce qui remplace l'ancienne borne stricte sur `sentAt`.
    const original = message({ id: 's-1', body: 'bonjur' });
    const corrige = { ...original, body: 'bonjour', editedAt: 2_000 };

    expect(unreadCount([corrige], keys(original))).toBe(0);
  });

  it('rend zéro sur un fil vide', () => {
    expect(unreadCount([], new Set())).toBe(0);
  });
});

describe('startsGroup', () => {
  it('ouvre un groupe sur le premier message', () => {
    expect(startsGroup([message({ id: 's-1' })], 0)).toBe(true);
  });

  it("ouvre un groupe quand l'émetteur change", () => {
    const log = [
      message({ id: 's-1', identity: 'u-ada', sentAt: 1_000 }),
      message({ id: 's-2', identity: 'u-bob', sentAt: 1_001 }),
    ];

    expect(startsGroup(log, 1)).toBe(true);
  });

  it('regroupe deux messages rapprochés du même émetteur', () => {
    const log = [message({ id: 's-1', sentAt: 1_000 }), message({ id: 's-2', sentAt: 1_001 })];

    expect(startsGroup(log, 1)).toBe(false);
  });

  it('ne coupe pas à exactement CHAT_GROUPING_MS, mais une milliseconde plus tard', () => {
    // La borne, aux deux côtés : sans le second appel, un `>=` passerait.
    const exact = [
      message({ id: 's-1', sentAt: 1_000 }),
      message({ id: 's-2', sentAt: 1_000 + CHAT_GROUPING_MS }),
    ];
    const beyond = [
      message({ id: 's-1', sentAt: 1_000 }),
      message({ id: 's-2', sentAt: 1_001 + CHAT_GROUPING_MS }),
    ];

    expect(startsGroup(exact, 1)).toBe(false);
    expect(startsGroup(beyond, 1)).toBe(true);
  });

  it('rend faux sur un index hors du fil', () => {
    // `noUncheckedIndexedAccess` rend ce cas typé ; il est aussi réel qu'un
    // rendu qui court après une liste qui vient de raccourcir.
    expect(startsGroup([message()], 7)).toBe(false);
  });
});

describe('normaliseBody', () => {
  it('coupe les blancs de bord', () => {
    expect(normaliseBody('  bonjour  ')).toBe('bonjour');
  });

  it('rend null sur une saisie vide ou de blancs seuls', () => {
    expect(normaliseBody('')).toBeNull();
    expect(normaliseBody('   \n\t ')).toBeNull();
  });

  it('laisse passer une saisie de longueur exactement maximale', () => {
    const body = 'a'.repeat(CHAT_MAX_LENGTH);

    expect(normaliseBody(body)).toHaveLength(CHAT_MAX_LENGTH);
  });

  it('tronque au-delà de la borne', () => {
    const body = 'a'.repeat(CHAT_MAX_LENGTH + 1);

    expect(normaliseBody(body)).toHaveLength(CHAT_MAX_LENGTH);
  });

  it('ne coupe jamais une paire de substitution en deux', () => {
    // Un demi-emoji à l'écran, et un U+FFFD sur le fil après encodage. Même
    // discipline que `splitUtf8` côté SDK, qui recule tant que l'octet de
    // coupe est une continuation.
    const body = 'a'.repeat(CHAT_MAX_LENGTH - 1) + '😀' + 'b';

    // La coupe tomberait entre les deux moitiés de l'emoji : on recule.
    expect(normaliseBody(body)).toHaveLength(CHAT_MAX_LENGTH - 1);
    expect(normaliseBody(body)).not.toContain('\ud83d');
  });
});
