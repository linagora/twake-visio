import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { AppState, Share, type AppStateStatus } from 'react-native';

import * as rooms from 'src/api/rooms';
import type { ApiResult } from 'src/api/types';
import * as pending from 'src/call/pendingAccess';
import * as accounts from 'src/auth/accounts';
import * as guest from 'src/auth/guest';
import * as visitor from 'src/auth/visitor';
import { LobbyScreen } from './lobby';

// Le nom doit commencer par `mock` : babel-plugin-jest-hoist remonte
// `jest.mock` au-dessus des déclarations et n'autorise dans la fabrique que
// les identifiants correspondant à /^mock/i. Un `jest.fn()` créé dans la
// fabrique serait recréé à chaque rendu, donc inobservable.
const mockReplace = jest.fn();
// Un routeur STABLE, comme le vrai : `useRouter` d'expo-router rend le même
// objet à chaque rendu (`hooks/useRouter.js` rend le `router` du module). La
// boucle de la salle d'attente en dépend ; un double recréé à chaque rendu la
// relancerait à chaque rendu, et chaque relance enverrait une demande.
const mockRouter = { replace: mockReplace };
let mockParams: { slug: string; camera?: string; mic?: string } = { slug: 'reunion' };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
const clipboard = jest.requireMock('expo-clipboard') as { setStringAsync: jest.Mock };

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

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
};

// Le nom mémorisé d'un précédent passage : c'est celui que `requestEntry` doit
// porter, exactement comme `account.displayName` le fait pour un compte.
const GUEST: visitor.Visitor = {
  kind: 'guest',
  serverUrl: 'https://meet.acme.com',
  displayName: 'Camille',
};

const ACCEPTED = {
  participantId: 'p-1',
  status: 'accepted' as const,
  livekitUrl: 'wss://livekit.linagora.com',
  token: 'lk',
};

beforeEach(() => {
  jest.restoreAllMocks();
  mockReplace.mockClear();
  mockParams = { slug: 'reunion' };
  jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
});

// `AppState` est ici le double du préréglage (`@react-native/jest-preset`,
// `jest/mocks/AppState.js`), un objet que l'écran partage : le modifier
// l'atteint. Mais sa méthode y est déjà un `jest.fn`, que `jest.spyOn` rend tel
// quel sans rien inscrire à restaurer. Une `mockImplementation` survivrait donc
// à `jest.restoreAllMocks()` et fuirait vers les tests suivants ; `Once` ne vaut
// que pour l'abonnement de l'écran que ce test monte.
function captureListener(): { emit: (status: AppStateStatus) => void; remove: jest.Mock } {
  const remove = jest.fn();
  let listener: ((status: AppStateStatus) => void) | null = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementationOnce((_type, handler) => {
    listener = handler as (status: AppStateStatus) => void;
    return { remove } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  return {
    emit: (status: AppStateStatus): void => listener?.(status),
    remove,
  };
}

// Une demande qui ne répond qu'à la main, pour tenir l'écran entre l'envoi et
// la réponse.
function pendingAnswer(): {
  promise: Promise<ApiResult<rooms.EntryOutcome>>;
  answer: (result: ApiResult<rooms.EntryOutcome>) => void;
} {
  let answer: (result: ApiResult<rooms.EntryOutcome>) => void = () => undefined;
  const promise = new Promise<ApiResult<rooms.EntryOutcome>>((resolve) => {
    answer = resolve;
  });
  return { promise, answer };
}

describe('LobbyScreen', () => {
  it("annonce l'attente après une demande acceptée par le serveur", async () => {
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'waiting', livekitUrl: null, token: null },
    });

    await render(<LobbyScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('lobby-waiting')).toBeTruthy();
    });
    expect(rooms.requestEntry).toHaveBeenCalledWith(
      { kind: 'account', account: ACCOUNT },
      'reunion',
      'Ada',
      null,
    );
  });

  it("signale explicitement l'absence de modérateur", async () => {
    jest
      .spyOn(rooms, 'requestEntry')
      .mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });

    await render(<LobbyScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('lobby-no-moderator')).toBeTruthy();
    });
  });

  it("cesse d'afficher un indicateur de chargement une fois l'état connu", async () => {
    // C'est l'exigence produit : quelqu'un qui frappe à la porte d'un salon que
    // personne ne peut ouvrir doit le lire, pas regarder tourner un indicateur
    // indéfiniment. Le test précédent vérifie que le message apparaît ; celui-ci
    // vérifie que l'indicateur disparaît, ce qui n'est pas la même chose.
    jest
      .spyOn(rooms, 'requestEntry')
      .mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });

    await render(<LobbyScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('lobby-no-moderator')).toBeTruthy();
    });
    expect(screen.queryByTestId('lobby-loading')).toBe(null);
  });

  it('ne présente pas une panne réseau comme une absence de modérateur', async () => {
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: false, error: { kind: 'network' } });

    await render(<LobbyScreen />);

    await waitFor(() => {
      expect(screen.getByText('error.network')).toBeTruthy();
    });
    expect(screen.queryByTestId('lobby-no-moderator')).toBe(null);
    expect(screen.queryByTestId('lobby-loading')).toBe(null);
  });

  it('ne présente pas un rejet du serveur comme une absence de modérateur', async () => {
    jest
      .spyOn(rooms, 'requestEntry')
      .mockResolvedValue({ ok: false, error: { kind: 'server', status: 502 } });

    await render(<LobbyScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('lobby-error')).toBeTruthy();
    });
    expect(screen.queryByTestId('lobby-no-moderator')).toBe(null);
    // Seul un 400 se dit « requête refusée » : un 502 n'en est pas un.
    expect(screen.queryByText('error.badRequest')).toBe(null);
  });

  it('invite à se reconnecter quand la session a expiré', async () => {
    jest
      .spyOn(rooms, 'requestEntry')
      .mockResolvedValue({ ok: false, error: { kind: 'unauthorized' } });

    await render(<LobbyScreen />);

    await waitFor(() => {
      expect(screen.getByText('error.unauthorized')).toBeTruthy();
    });
  });

  it("sort de l'attente même si la demande rejette", async () => {
    jest.spyOn(rooms, 'requestEntry').mockRejectedValue(new Error('boom'));

    await render(<LobbyScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('lobby-error')).toBeTruthy();
    });
    expect(screen.queryByTestId('lobby-loading')).toBe(null);
  });

  it("sort de l'attente si l'entrée en séance jette après l'admission", async () => {
    jest.spyOn(pending, 'stashRoomAccess').mockImplementation(() => {
      throw new Error('boom');
    });
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: true, value: ACCEPTED });

    await render(<LobbyScreen />);

    await waitFor(() => expect(screen.getByText('error.network')).toBeTruthy());
  });

  it("n'interroge pas le serveur sans compte actif et le dit", async () => {
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(null);
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'waiting', livekitUrl: null, token: null },
    });

    await render(<LobbyScreen />);

    await waitFor(() => {
      expect(screen.getByText('error.unauthorized')).toBeTruthy();
    });
    expect(rooms.requestEntry).not.toHaveBeenCalled();
  });
});

describe("LobbyScreen, chemin d'admission", () => {
  const WAITING = {
    participantId: 'p-1',
    status: 'waiting' as const,
    livekitUrl: null,
    token: null,
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  // Les espions AVANT les vraies minuteries. Un espion posé sur `setInterval`
  // enveloppe la FAUSSE, et `jest.restoreAllMocks()` la reposerait sur
  // `globalThis` au `beforeEach` suivant ; la prochaine installation de fausses
  // minuteries la prendrait alors pour la vraie. Mesuré sur une sonde : un
  // `setInterval` à minuteries réelles ne se déclenche plus, dans tous les
  // tests qui suivent. Aucun test de ce fichier n'en dépend encore.
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  // Fait avancer le temps puis laisse les promesses du tick se dénouer.
  // `jest.advanceTimersByTime` seul rend la main avant que `requestEntry`
  // n'ait résolu, et l'assertion lirait un écran d'un tick de retard.
  async function advance(ms: number): Promise<void> {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  }

  // Un tour de scrutation : trois secondes, la cadence de l'écran.
  async function tick(): Promise<void> {
    await advance(3000);
  }

  it('entre en séance dès que le salon délivre un jeton', async () => {
    const entry = jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: true, value: WAITING });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());

    await tick();
    expect(mockReplace).not.toHaveBeenCalled();

    entry.mockResolvedValue({
      ok: true,
      value: {
        participantId: 'p-1',
        status: 'accepted',
        livekitUrl: 'wss://livekit.linagora.com',
        token: 'lk',
      },
    });
    await tick();

    expect(mockReplace).toHaveBeenCalledWith('/room/reunion/call');
  });

  /**
   * `request-entry` rend le jeton LiveKit AU MOMENT de l'admission, et c'est
   * le seul que la personne obtiendra : la séance ne demande pas d'accès, et
   * `join/` ne tient aucun compte d'une admission. Jeté ici, il renverrait la
   * personne admise au pré-join, puis à cette salle, en boucle.
   */
  it("MET DE CÔTÉ le jeton de l'admission avant de naviguer", async () => {
    const stash = jest.spyOn(pending, 'stashRoomAccess');
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: {
        participantId: 'p-1',
        status: 'accepted',
        livekitUrl: 'wss://livekit.linagora.com',
        token: 'lk',
      },
    });

    await render(<LobbyScreen />);
    await tick();

    // La forme entière : le jeton reçu, et le droit de modérer à faux.
    expect(stash).toHaveBeenCalledWith('reunion', {
      room: { id: null, slug: 'reunion', name: 'reunion', accessLevel: 'trusted' },
      livekitUrl: 'wss://livekit.linagora.com',
      token: 'lk',
      isAdministrable: false,
    });
    // AVANT : la séance lit l'accès mis de côté dès son montage.
    expect(stash.mock.invocationCallOrder[0]).toBeLessThan(
      mockReplace.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it.each([
    [{ camera: '0', mic: '1' }, '/room/reunion/call?camera=0&mic=1'],
    [{ camera: '1', mic: '0' }, '/room/reunion/call?camera=1&mic=0'],
  ])('entre en séance avec les choix du pré-join %j', async (choices, path) => {
    mockParams = { slug: 'reunion', ...choices };
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: true, value: ACCEPTED });

    await render(<LobbyScreen />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(path));
  });

  it('demande au montage, puis toutes les trois secondes', async () => {
    const entry = jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: true, value: WAITING });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());
    expect(entry).toHaveBeenCalledTimes(1);

    await advance(2999);
    expect(entry).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(entry).toHaveBeenCalledTimes(2);
    await advance(3000);
    expect(entry).toHaveBeenCalledTimes(3);
  });

  // Le client web abandonne au bout de dix minutes (`WAIT_TIMEOUT_MS`,
  // `useLobby.ts`). Pas cet écran : la personne attend tant qu'elle le veut.
  it('attend au-delà des dix minutes où le client web abandonne', async () => {
    const entry = jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: true, value: WAITING });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());
    // Tour par tour : une seule avance de onze minutes ferait partir toutes les
    // demandes d'un coup, et la garde d'une demande à la fois les avalerait.
    for (let elapsed = 0; elapsed < 11 * 60_000; elapsed += 3000) {
      await tick();
    }
    const callsAfterElevenMinutes = entry.mock.calls.length;

    await tick();

    expect(entry).toHaveBeenCalledTimes(callsAfterElevenMinutes + 1);
    expect(screen.getByTestId('lobby-waiting')).toBeTruthy();
  });

  it("renvoie l'identifiant de chaque réponse à la demande suivante", async () => {
    const entry = jest
      .spyOn(rooms, 'requestEntry')
      .mockResolvedValueOnce({ ok: true, value: { ...WAITING, participantId: 'signé-1' } })
      .mockResolvedValueOnce({ ok: true, value: { ...WAITING, participantId: 'signé-2' } })
      .mockResolvedValue({ ok: true, value: { ...WAITING, participantId: 'signé-3' } });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());
    await tick();
    await tick();

    expect(entry.mock.calls.map((call) => call[3])).toEqual([null, 'signé-1', 'signé-2']);
  });

  it('demande tout de suite au retour au premier plan', async () => {
    const appState = captureListener();
    const entry = jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: true, value: WAITING });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());
    expect(entry).toHaveBeenCalledTimes(1);

    await act(async () => appState.emit('active'));

    expect(entry).toHaveBeenCalledTimes(2);
  });

  // `inactive` n'est émis que par iOS, pour une interaction passagère qui ne
  // retire rien ; `background` n'est pas un retour.
  it.each(['background', 'inactive'] as const)(
    'ne demande rien au passage à %s',
    async (status) => {
      const appState = captureListener();
      const entry = jest
        .spyOn(rooms, 'requestEntry')
        .mockResolvedValue({ ok: true, value: WAITING });

      await render(<LobbyScreen />);
      await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());

      await act(async () => appState.emit(status));

      expect(entry).toHaveBeenCalledTimes(1);
    },
  );

  it("n'envoie pas une demande tant que la précédente n'a pas répondu", async () => {
    const appState = captureListener();
    const first = pendingAnswer();
    const entry = jest
      .spyOn(rooms, 'requestEntry')
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ ok: true, value: WAITING });

    await render(<LobbyScreen />);
    await tick();
    await act(async () => appState.emit('active'));
    // Ni le tour suivant ni le retour au premier plan : sans identifiant encore,
    // une seconde demande inscrirait la personne une seconde fois.
    expect(entry).toHaveBeenCalledTimes(1);

    await act(async () => first.answer({ ok: true, value: WAITING }));
    await tick();

    expect(entry).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      'un 400 lisible',
      { kind: 'validation', fields: { participant_id: ['Invalid participant credential.'] } },
    ],
    ['un 400 illisible', { kind: 'server', status: 400 }],
  ] as const)("abandonne l'identifiant sur %s, sans rien afficher", async (_label, error) => {
    const entry = jest
      .spyOn(rooms, 'requestEntry')
      .mockResolvedValueOnce({ ok: true, value: { ...WAITING, participantId: 'signé-1' } })
      .mockResolvedValueOnce({ ok: false, error })
      .mockResolvedValue({ ok: true, value: { ...WAITING, participantId: 'signé-2' } });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());
    await tick();

    expect(screen.getByTestId('lobby-waiting')).toBeTruthy();
    expect(screen.queryByTestId('lobby-error')).toBe(null);

    await tick();

    expect(entry.mock.calls.map((call) => call[3])).toEqual([null, 'signé-1', null]);
  });

  it.each([
    ['un 400 lisible', { kind: 'validation', fields: { username: ['This field is required.'] } }],
    ['un 400 illisible', { kind: 'server', status: 400 }],
  ] as const)(
    "affiche %s reçu sans identifiant, autrement qu'une panne réseau",
    async (_label, error) => {
      const appState = captureListener();
      const entry = jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: false, error });

      await render(<LobbyScreen />);

      await waitFor(() => expect(screen.getByText('error.badRequest')).toBeTruthy());
      expect(screen.queryByText('error.network')).toBe(null);

      // La même demande rendrait le même 400 : l'écran ne la répète pas.
      await tick();
      await act(async () => appState.emit('active'));
      expect(entry).toHaveBeenCalledTimes(1);
    },
  );

  it("s'arrête sur un 400 sans identifiant, même une fois en file", async () => {
    const entry = jest
      .spyOn(rooms, 'requestEntry')
      .mockResolvedValueOnce({ ok: true, value: { ...WAITING, participantId: 'signé-1' } })
      .mockResolvedValue({ ok: false, error: { kind: 'server', status: 400 } });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());
    // Le premier 400 suit l'envoi d'un identifiant, qui est abandonné. Le
    // second part sans : il ne peut plus venir de l'identifiant, il est final.
    await tick();
    await tick();

    expect(screen.getByText('error.badRequest')).toBeTruthy();
    await tick();
    expect(entry).toHaveBeenCalledTimes(3);
  });

  // La polarité fausse : une admission SANS jeton ne met rien de côté. Le
  // serveur ne devrait pas produire ce cas, mais `EntryOutcome` type les deux
  // champs en `string | null` — les ignorer laisserait passer un accès dont le
  // jeton serait `null`, que la séance prendrait pour un accès valide.
  it("ne met RIEN de côté quand l'admission ne porte pas de jeton", async () => {
    const stash = jest.spyOn(pending, 'stashRoomAccess');
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'accepted', livekitUrl: null, token: null },
    });

    await render(<LobbyScreen />);
    await tick();

    expect(stash).not.toHaveBeenCalled();
    // Mais on navigue quand même : sans accès mis de côté, la séance renvoie
    // au pré-join, qui sait redemander l'entrée.
    expect(mockReplace).toHaveBeenCalledWith('/room/reunion/call');
  });

  // Un invité admis au fil des demandes, et non dès la première. La boucle lit
  // le visiteur une fois, au montage, et chacune de ses demandes part sous
  // cette identité : c'est le seul test en invité qui suive la personne
  // au-delà de la première réponse.
  //
  // `getActiveAccount` posée à `null`, et pas seulement `getVisitor` posé à
  // l'invité : un VRAI invité n'a PAS de compte. Sans ce `null` explicite, la
  // fixture par défaut du fichier (`ACCOUNT`, posée par le `beforeEach` de
  // tête) reste en place, et un site resté sur `getActiveAccount()` continue
  // de scruter — avec la mauvaise identité, mais sans jamais rendre ce test
  // rouge. Mesuré : sans cette ligne, muter ce site en revenant à
  // `getActiveAccount()` laisse ce test VERT.
  it('entre en séance dès que le salon délivre un jeton, pour un invité aussi', async () => {
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(null);
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    const entry = jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: true, value: WAITING });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());

    await tick();
    expect(mockReplace).not.toHaveBeenCalled();

    entry.mockResolvedValue({
      ok: true,
      value: {
        participantId: 'p-1',
        status: 'accepted',
        livekitUrl: 'wss://livekit.linagora.com',
        token: 'lk',
      },
    });
    await tick();

    expect(mockReplace).toHaveBeenCalledWith('/room/reunion/call');
  });

  // Symétrique de « cesse de demander une fois refusé » : une admission arrête
  // aussi les demandes. Sans ce test, retirer le `stop()` de la branche
  // `accepted` ne fait rougir aucun autre test — `router.replace` est un mock
  // ici et ne démonte pas l'écran, contrairement à une vraie navigation.
  it('cesse de scruter une fois accepté', async () => {
    const entry = jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: true, value: WAITING });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());

    entry.mockResolvedValue({
      ok: true,
      value: {
        participantId: 'p-1',
        status: 'accepted',
        livekitUrl: 'wss://livekit.linagora.com',
        token: 'lk',
      },
    });
    await tick();
    expect(mockReplace).toHaveBeenCalledWith('/room/reunion/call');
    const callsAfterAcceptance = entry.mock.calls.length;

    await tick();
    await tick();

    expect(entry.mock.calls.length).toBe(callsAfterAcceptance);
  });

  it("scrute aussi tant qu'aucun modérateur n'est là", async () => {
    // L'absence de modérateur est une attente, pas une fin de course :
    // quelqu'un qui peut ouvrir peut arriver plus tard, et l'écran doit
    // basculer tout seul. Sans scrutation dans cet état, la personne reste
    // devant « aucun modérateur » pour toujours.
    const entry = jest
      .spyOn(rooms, 'requestEntry')
      .mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-no-moderator')).toBeTruthy());

    entry.mockResolvedValue({
      ok: true,
      value: {
        participantId: 'p-1',
        status: 'accepted',
        livekitUrl: 'wss://livekit.linagora.com',
        token: 'lk',
      },
    });
    await tick();

    expect(mockReplace).toHaveBeenCalledWith('/room/reunion/call');
  });

  it("ne sort pas non plus de l'attente sans modérateur sur une coupure passagère", async () => {
    const entry = jest
      .spyOn(rooms, 'requestEntry')
      .mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-no-moderator')).toBeTruthy());

    entry.mockResolvedValue({ ok: false, error: { kind: 'network' } });
    await tick();

    expect(screen.getByTestId('lobby-no-moderator')).toBeTruthy();
    expect(screen.queryByTestId('lobby-error')).toBe(null);
  });

  it("ne sort pas de la file d'attente sur une coupure passagère", async () => {
    const entry = jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: true, value: WAITING });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());

    entry.mockResolvedValue({ ok: false, error: { kind: 'network' } });
    await tick();
    await tick();

    expect(screen.getByTestId('lobby-waiting')).toBeTruthy();
    expect(screen.queryByTestId('lobby-error')).toBe(null);

    // La reprise se fait toute seule : la scrutation ne s'est pas arrêtée.
    entry.mockResolvedValue({
      ok: true,
      value: {
        participantId: 'p-1',
        status: 'accepted',
        livekitUrl: 'wss://livekit.linagora.com',
        token: 'lk',
      },
    });
    await tick();
    expect(mockReplace).toHaveBeenCalledWith('/room/reunion/call');
  });

  it("invite à se reconnecter si la session expire pendant l'attente", async () => {
    const entry = jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: true, value: WAITING });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());

    entry.mockResolvedValue({ ok: false, error: { kind: 'unauthorized' } });
    await tick();

    expect(screen.getByText('error.unauthorized')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("arrête de scruter une fois l'écran démonté", async () => {
    const entry = jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: true, value: WAITING });

    const view = await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());

    await tick();
    const callsBeforeUnmount = entry.mock.calls.length;
    expect(callsBeforeUnmount).toBeGreaterThan(0);

    await view.unmount();
    await tick();
    await tick();

    // Un intervalle non nettoyé continue d'interroger le serveur pour un
    // écran que plus personne ne regarde, et fait fuir un timer par visite.
    expect(entry.mock.calls.length).toBe(callsBeforeUnmount);
  });

  it('annonce un refus au lieu de faire attendre indéfiniment', async () => {
    const entry = jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: true, value: WAITING });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());

    entry.mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'denied', livekitUrl: null, token: null },
    });
    await tick();

    expect(screen.getByTestId('lobby-denied')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('cesse de demander une fois refusé, retour au premier plan compris', async () => {
    const appState = captureListener();
    const entry = jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'denied', livekitUrl: null, token: null },
    });

    await render(<LobbyScreen />);
    // Un refus dès la première réponse, par commodité : meet ne refuse qu'une
    // personne déjà en file (`LobbyService.request_entry` ne crée qu'une attente
    // ou une admission), mais l'écran lit toutes ses réponses de la même façon.
    await waitFor(() => expect(screen.getByTestId('lobby-denied')).toBeTruthy());

    await tick();
    await tick();
    await act(async () => appState.emit('active'));

    // Continuer à demander l'entrée après un refus revient à insister auprès
    // du serveur pour une décision déjà prise.
    expect(entry).toHaveBeenCalledTimes(1);
  });

  it("relâche l'horloge et l'écoute du premier plan au démontage", async () => {
    const appState = captureListener();
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: true, value: WAITING });
    // Par les fonctions de minuterie elles-mêmes, et non `jest.getTimerCount()` :
    // il compte toutes les minuteries simulées, y compris celles que l'écran ne
    // pose pas — mesuré, 45 au démontage, et une encore soixante-dix secondes
    // plus tard. Et rien d'autre ne le voit : une demande partie d'une horloge
    // oubliée s'arrête net sur `stopped`.
    const started = jest.spyOn(globalThis, 'setInterval');
    const cleared = jest.spyOn(globalThis, 'clearInterval');

    const view = await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());
    const poll = started.mock.results[started.mock.calls.findIndex((call) => call[1] === 3000)];
    expect(poll).toBeDefined();

    await view.unmount();

    expect(cleared).toHaveBeenCalledWith(poll?.value);
    expect(appState.remove).toHaveBeenCalled();
  });

  it("n'entre pas en séance pour un écran déjà quitté", async () => {
    const stash = jest.spyOn(pending, 'stashRoomAccess');
    const first = pendingAnswer();
    jest.spyOn(rooms, 'requestEntry').mockReturnValue(first.promise);

    const view = await render(<LobbyScreen />);
    await view.unmount();
    // L'admission arrive après la sortie : elle ne doit ramener personne dans
    // une séance qu'on vient de quitter.
    await act(async () => first.answer({ ok: true, value: ACCEPTED }));

    expect(stash).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

// `app/_layout.tsx` masque l'en-tête du Stack, et on arrive ici par un
// `replace` depuis le pré-join : sans commande à l'écran, aucun geste ne sort
// du salon d'attente. Trois de ces cinq états sont TERMINAUX — refusé, aucun
// modérateur, échec — donc on y restait jusqu'à tuer l'application.
//
// Un test par état, et non un seul : le bouton est aujourd'hui posé une fois
// pour tous, mais c'est justement ce que ces tests doivent garder. Les rendre
// à nouveau état par état ferait rougir quatre lignes, pas zéro.
describe('LobbyScreen, la sortie', () => {
  it("offre une sortie pendant l'attente", async () => {
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'waiting', livekitUrl: null, token: null },
    });

    await render(<LobbyScreen />);

    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());
    expect(screen.getByTestId('lobby-leave-btn')).toBeTruthy();
  });

  it("offre une sortie tant que la demande n'a pas abouti", async () => {
    // L'état `requesting` se tient en laissant la promesse pendante : c'est le
    // seul moyen d'observer l'écran avant sa première résolution.
    jest.spyOn(rooms, 'requestEntry').mockReturnValue(new Promise(() => undefined));

    await render(<LobbyScreen />);

    expect(screen.getByTestId('lobby-loading')).toBeTruthy();
    expect(screen.getByTestId('lobby-leave-btn')).toBeTruthy();
  });

  it('offre une sortie quand aucun modérateur ne peut ouvrir', async () => {
    jest
      .spyOn(rooms, 'requestEntry')
      .mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });

    await render(<LobbyScreen />);

    await waitFor(() => expect(screen.getByTestId('lobby-no-moderator')).toBeTruthy());
    expect(screen.getByTestId('lobby-leave-btn')).toBeTruthy();
  });

  it('offre une sortie après un échec', async () => {
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: false, error: { kind: 'network' } });

    await render(<LobbyScreen />);

    await waitFor(() => expect(screen.getByTestId('lobby-error')).toBeTruthy());
    expect(screen.getByTestId('lobby-leave-btn')).toBeTruthy();
  });

  it('offre une sortie après un refus — le pire des cinq', async () => {
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'denied', livekitUrl: null, token: null },
    });

    await render(<LobbyScreen />);

    await waitFor(() => expect(screen.getByTestId('lobby-denied')).toBeTruthy());
    expect(screen.getByTestId('lobby-leave-btn')).toBeTruthy();
  });

  it("ramène à l'accueil quand on presse la sortie", async () => {
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'waiting', livekitUrl: null, token: null },
    });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('lobby-leave-btn'));

    expect(mockReplace).toHaveBeenCalledWith('/home');
  });

  // L'autre polarité de la fermeture de session invitée par la Revue de la
  // Tâche 8 : un COMPTE n'en a aucune à fermer, et `endGuestSession()` ne doit
  // JAMAIS être appelée pour lui — sans ce test, retirer la garde
  // `current?.kind === 'guest'` passerait toute la suite.
  it("n'appelle PAS endGuestSession pour un compte", async () => {
    const end = jest.spyOn(guest, 'endGuestSession');
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'waiting', livekitUrl: null, token: null },
    });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('lobby-leave-btn'));

    expect(end).not.toHaveBeenCalled();
  });
});

// Tâche 8 : `getVisitor()` remplace `getActiveAccount()` partout où cet écran
// lit le visiteur, exactement comme la Tâche 7 l'a fait pour le pré-join. Pour un invité, `access === null` n'est PLUS un échec : c'est le
// cas nominal, la personne n'a simplement encore reçu aucune réponse.
describe("la salle d'attente en invité", () => {
  it('demande son entrée sous le nom mémorisé', async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    const entry = jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'waiting', livekitUrl: null, token: null },
    });

    await render(<LobbyScreen />);

    await waitFor(() =>
      expect(entry).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'guest' }),
        'reunion',
        'Camille',
        null,
      ),
    );
  });

  it("n'annonce PLUS « session expirée » faute de compte", async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'waiting', livekitUrl: null, token: null },
    });

    await render(<LobbyScreen />);

    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeOnTheScreen());
    expect(screen.queryByTestId('lobby-error')).toBe(null);
  });

  // La branche qui reste : NI compte NI session invité.
  it("annonce toujours l'échec quand il n'y a aucun visiteur", async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(null);

    await render(<LobbyScreen />);

    await waitFor(() => expect(screen.getByTestId('lobby-error')).toBeOnTheScreen());
  });

  it("ramène un invité à l'accueil public", async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'waiting', livekitUrl: null, token: null },
    });
    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('lobby-leave-btn'));

    expect(mockReplace).toHaveBeenCalledWith('/welcome');
  });

  // REVUE Tâche 8, Important 1 : sans `endGuestSession()`, MMKV garde le
  // serveur de CETTE réunion après qu'on l'a quittée depuis la salle
  // d'attente — le même mécanisme que `call.tsx` corrige déjà à sa propre
  // sortie, laissé ouvert sur ce chemin jumeau.
  it('referme la session invité en sortant', async () => {
    const end = jest.spyOn(guest, 'endGuestSession');
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'waiting', livekitUrl: null, token: null },
    });
    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('lobby-leave-btn'));

    expect(end).toHaveBeenCalled();
  });
});

describe('le lien de la réunion, depuis la salle d’attente', () => {
  // Fixture locale : celle du bloc d'admission vit dans un `describe`
  // imbriqué, donc hors de portée ici.
  const EN_ATTENTE = {
    participantId: 'p-1',
    status: 'waiting' as const,
    livekitUrl: null,
    token: null,
  };
  /**
   * Demandé par Michel-Marie le 2026-08-05, en voyant l'écran sur son Pixel :
   * les deux icônes de l'en-tête de séance manquaient ici. Quelqu'un qui
   * attend d'être admis peut vouloir transmettre le lien — c'est même le
   * moment où il en a le plus besoin, puisqu'il n'est pas encore entré.
   *
   * L'URL vient du VISITEUR, jamais d'une constante : un invité admis sur une
   * autre instance partagerait sinon un lien vers la nôtre, qui ne mène pas à
   * sa réunion. Même règle que `handleShare` de `call.tsx`.
   */
  it('copie le lien avec le serveur du visiteur', async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: true, value: EN_ATTENTE });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-copy')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('lobby-copy'));

    expect(clipboard.setStringAsync).toHaveBeenCalledWith('https://meet.acme.com/reunion');
  });

  // Deuxième INSTRUCTION du même gestionnaire. Le commentaire de `call.tsx` le
  // dit : une copie silencieuse est indiscernable d'un appui manqué, rien ne
  // bouge à l'écran et le presse-papiers n'est visible nulle part.
  it('annonce la copie', async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: true, value: EN_ATTENTE });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-copy')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('lobby-copy'));

    await waitFor(() => expect(screen.getByText('call.linkCopied')).toBeOnTheScreen());
  });

  it('partage le lien avec le serveur du visiteur', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'dismissedAction' });
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: true, value: EN_ATTENTE });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-share')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('lobby-share'));

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://meet.acme.com/reunion' }),
    );
  });

  // La polarité fausse : un COMPTE partage l'URL de SON instance, pas celle de
  // l'invité ni une constante.
  it("porte le serveur du COMPTE quand c'en est un", async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'dismissedAction' });
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: true, value: EN_ATTENTE });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-share')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('lobby-share'));

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://meet.linagora.com/reunion' }),
    );
  });

  it('affiche le salon que l’on attend', async () => {
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: true, value: EN_ATTENTE });

    await render(<LobbyScreen />);

    await waitFor(() => expect(screen.getByTestId('lobby-room')).toHaveTextContent('reunion'));
  });
});
