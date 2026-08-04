import * as client from 'src/api/client';
import {
  answerEntry,
  listWaitingParticipants,
  muteParticipant,
  removeParticipant,
  updateParticipantRole,
} from 'src/api/participants';
import type { Account } from 'src/auth/accounts';

const ACCOUNT = {
  id: 'https://sso.linagora.com|u-1',
  instance: {
    serverUrl: 'https://meet.linagora.com',
    issuer: 'https://sso.linagora.com',
    clientId: 'twake-visio',
    livekitUrl: 'https://livekit.linagora.com',
    features: { recording: true, subtitle: true, telephony: false },
  },
  email: 'ada@linagora.com',
  displayName: 'Ada',
} as Account;

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('listWaitingParticipants', () => {
  it('rend les personnes en attente', async () => {
    jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: { participants: [{ id: 'p-1', username: 'Ada' }] },
    });

    const result = await listWaitingParticipants(ACCOUNT, 'r-1');

    expect(result).toEqual({ ok: true, value: [{ id: 'p-1', username: 'Ada' }] });
  });

  it('rend une liste vide plutôt que de casser sur une réponse sans participants', async () => {
    // Le serveur rend `{"participants": []}` sur un salon public, mais rien ne
    // garantit la forme si la route change.
    jest.spyOn(client, 'authedFetch').mockResolvedValue({ ok: true, value: {} });

    const result = await listWaitingParticipants(ACCOUNT, 'r-1');

    expect(result).toEqual({ ok: true, value: [] });
  });

  it('appelle la bonne route', async () => {
    const spy = jest
      .spyOn(client, 'authedFetch')
      .mockResolvedValue({ ok: true, value: { participants: [] } });

    await listWaitingParticipants(ACCOUNT, 'r-1');

    expect(spy.mock.calls[0]?.[1]).toBe('/api/v1.0/rooms/r-1/waiting-participants/');
  });

  // Contrairement aux quatre autres fonctions de ce module, celle-ci ne passe
  // pas par `toVoid` : son propre passage d'erreur n'était vérifié par aucun
  // test avant celui-ci — une traduction introduite ici serait passée
  // inaperçue.
  it("remonte l'erreur sans la traduire", async () => {
    jest
      .spyOn(client, 'authedFetch')
      .mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });

    const result = await listWaitingParticipants(ACCOUNT, 'r-1');

    expect(result).toEqual({ ok: false, error: { kind: 'forbidden' } });
  });
});

describe('answerEntry', () => {
  it('admet une personne', async () => {
    const spy = jest.spyOn(client, 'authedFetch').mockResolvedValue({ ok: true, value: {} });

    const result = await answerEntry(ACCOUNT, 'r-1', 'p-1', true);

    expect(spy.mock.calls[0]?.[1]).toBe('/api/v1.0/rooms/r-1/enter/');
    const init = spy.mock.calls[0]?.[2] as RequestInit;
    // Sans cette assertion, un `post()` qui enverrait un GET passerait ce
    // test aussi bien qu'un POST : seul le corps était vérifié, jamais la
    // méthode — alors que le serveur refuse un GET sur cette route.
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ participant_id: 'p-1', allow_entry: true });
    // `toVoid` traduit la réponse brute en `ApiResult<void>` : sans cette
    // assertion, un `toVoid` qui fabriquerait un échec sur tout succès (ou
    // qui laisserait fuiter la valeur brute au lieu de `undefined`) resterait
    // invisible ici, puisque les assertions ci-dessus ne regardent que la
    // requête envoyée, jamais ce que la fonction rend à l'appelant.
    expect(result).toEqual({ ok: true, value: undefined });
  });

  it('refuse par le même endpoint', async () => {
    // `allow_entry` est un booléen : admettre et refuser ne sont pas deux
    // routes. Se tromper de valeur laisse entrer qui on voulait écarter.
    const spy = jest.spyOn(client, 'authedFetch').mockResolvedValue({ ok: true, value: {} });

    const result = await answerEntry(ACCOUNT, 'r-1', 'p-1', false);

    const init = spy.mock.calls[0]?.[2] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ participant_id: 'p-1', allow_entry: false });
    expect(result).toEqual({ ok: true, value: undefined });
  });
});

describe('actions de modération', () => {
  // La seule des quatre qui passe par `livekitFetch`, et la seule qui envoie
  // deux champs. Mesuré sur une instance réelle : avec le porteur OIDC elle
  // rendait 403 là où une expulsion réussissait au même instant, et sans
  // `track_sid` le sérialiseur du serveur refuse la requête.
  it('coupe un micro par le jeton LiveKit, jamais par le porteur du compte', async () => {
    const livekit = jest.spyOn(client, 'livekitFetch').mockResolvedValue({ ok: true, value: {} });
    const authed = jest.spyOn(client, 'authedFetch').mockResolvedValue({ ok: true, value: {} });

    const result = await muteParticipant(
      'https://meet.example.org',
      'lk-token',
      'r-1',
      'PA_abc',
      'TR_xyz',
    );

    // Le porteur du compte n'est PAS emprunté : sans cette ligne, un appel qui
    // ferait les deux passerait le reste du test.
    expect(authed).not.toHaveBeenCalled();
    expect(livekit).toHaveBeenCalledWith(
      'https://meet.example.org',
      'lk-token',
      'r-1',
      'mute-participant',
      { participant_identity: 'PA_abc', track_sid: 'TR_xyz' },
    );
    expect(result).toEqual({ ok: true, value: undefined });
  });

  it('expulse par identité LiveKit', async () => {
    const spy = jest.spyOn(client, 'authedFetch').mockResolvedValue({ ok: true, value: {} });

    const result = await removeParticipant(ACCOUNT, 'r-1', 'PA_abc');

    expect(spy.mock.calls[0]?.[1]).toBe('/api/v1.0/rooms/r-1/remove-participant/');
    const init = spy.mock.calls[0]?.[2] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ participant_identity: 'PA_abc' });
    expect(result).toEqual({ ok: true, value: undefined });
  });

  // **Ce test a figé une route qui n'existe pas.** Il vérifiait que l'appel
  // portait sur `update-participant-role/` — le nom écrit dans le plan — et il
  // était vert, parce qu'un espion sur `authedFetch` ne peut rien savoir de ce
  // que le serveur reconnaît. « Passer administrateur » échouait depuis.
  //
  // Mesuré le 2026-08-04 sur l'instance réelle : `update-participant-role/`
  // rend la page HTML de Django, comme une route inventée pour l'occasion,
  // quand `update-participant/` rend un 401 JSON. Un test d'URL ne prouve donc
  // qu'une chose — que le code appelle ce qu'on a écrit —, et il faut mesurer
  // la route ailleurs.
  it('change un rôle', async () => {
    const spy = jest.spyOn(client, 'authedFetch').mockResolvedValue({ ok: true, value: {} });

    const result = await updateParticipantRole(ACCOUNT, 'r-1', 'PA_abc', 'administrator');

    expect(spy.mock.calls[0]?.[1]).toBe('/api/v1.0/rooms/r-1/update-participant/');
    const init = spy.mock.calls[0]?.[2] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      participant_identity: 'PA_abc',
      role: 'administrator',
    });
    expect(result).toEqual({ ok: true, value: undefined });
  });

  it("remonte l'erreur sans la traduire", async () => {
    jest
      .spyOn(client, 'authedFetch')
      .mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });

    const result = await removeParticipant(ACCOUNT, 'r-1', 'PA_abc');

    expect(result).toEqual({ ok: false, error: { kind: 'forbidden' } });
  });
});
