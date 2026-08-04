import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import * as rooms from 'src/api/rooms';
import * as accounts from 'src/auth/accounts';
import * as visitor from 'src/auth/visitor';
import { LobbyScreen } from './lobby';

// Le nom doit commencer par `mock` : babel-plugin-jest-hoist remonte
// `jest.mock` au-dessus des déclarations et n'autorise dans la fabrique que
// les identifiants correspondant à /^mock/i. Un `jest.fn()` créé dans la
// fabrique serait recréé à chaque rendu, donc inobservable.
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => ({ slug: 'reunion' }),
}));
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

beforeEach(() => {
  jest.restoreAllMocks();
  mockReplace.mockClear();
  jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
});

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

  afterEach(() => {
    jest.useRealTimers();
  });

  // Fait avancer le temps puis laisse les promesses du tick se dénouer.
  // `jest.advanceTimersByTime` seul rend la main avant que `requestEntry`
  // n'ait résolu, et l'assertion lirait un écran d'un tick de retard.
  async function tick(): Promise<void> {
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
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

  // Symétrique de « cesse de scruter une fois refusé » : une admission arrête
  // aussi la scrutation. Sans ce test, retirer le `clearInterval` de la
  // branche `accepted` ne fait rougir aucun test existant — `router.replace`
  // est un mock ici et ne démonte pas l'écran, contrairement à une vraie
  // navigation.
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

  it('cesse de scruter une fois refusé', async () => {
    const entry = jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'denied', livekitUrl: null, token: null },
    });

    await render(<LobbyScreen />);
    // L'appel initial (au montage) ne lit que `result.ok`, jamais `.status` :
    // il pose donc `waiting` même si le serveur répond déjà `denied`. C'est
    // la scrutation, un cycle plus tard, qui lit `.status` et fait basculer
    // l'écran — d'où ce tick avant de guetter `lobby-denied`.
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());
    await tick();
    await waitFor(() => expect(screen.getByTestId('lobby-denied')).toBeTruthy());
    const callsAfterDenial = entry.mock.calls.length;

    await tick();
    await tick();

    // Continuer à demander l'entrée après un refus revient à insister auprès
    // du serveur pour une décision déjà prise.
    expect(entry.mock.calls.length).toBe(callsAfterDenial);
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
    jest.useFakeTimers();
    try {
      jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
        ok: true,
        value: { participantId: 'p-1', status: 'denied', livekitUrl: null, token: null },
      });

      await render(<LobbyScreen />);
      await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());
      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => expect(screen.getByTestId('lobby-denied')).toBeTruthy());
      expect(screen.getByTestId('lobby-leave-btn')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
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
});

// Tâche 8 : `getVisitor()` remplace `getActiveAccount()` aux trois points
// d'entrée de cet écran, exactement comme la Tâche 7 l'a fait pour le
// pré-join. Pour un invité, `access === null` n'est PLUS un échec : c'est le
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

    expect(screen.getByTestId('lobby-error')).toBeOnTheScreen();
  });

  it("ramène un invité à l'accueil public", async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'waiting', livekitUrl: null, token: null },
    });
    await render(<LobbyScreen />);

    await fireEvent.press(screen.getByTestId('lobby-leave-btn'));

    expect(mockReplace).toHaveBeenCalledWith('/welcome');
  });
});
