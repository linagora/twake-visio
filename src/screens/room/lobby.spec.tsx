import { act, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import * as rooms from 'src/api/rooms';
import * as accounts from 'src/auth/accounts';
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
    expect(rooms.requestEntry).toHaveBeenCalledWith(ACCOUNT, 'reunion', 'Ada');
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
  const ACCESS = {
    room: { id: 'r-1', slug: 'reunion', name: 'Réunion', accessLevel: 'trusted' },
    livekitUrl: 'wss://livekit.linagora.com',
    token: 'lk',
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Fait avancer le temps puis laisse les promesses du tick se dénouer.
  // `jest.advanceTimersByTime` seul rend la main avant que `fetchRoomAccess`
  // n'ait résolu, et l'assertion lirait un écran d'un tick de retard.
  async function tick(): Promise<void> {
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
  }

  it('entre en séance dès que le salon délivre un jeton', async () => {
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'waiting', livekitUrl: null, token: null },
    });
    const access = jest
      .spyOn(rooms, 'fetchRoomAccess')
      .mockResolvedValue({ ok: false, error: { kind: 'lobby', participantId: '' } });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());

    await tick();
    expect(mockReplace).not.toHaveBeenCalled();

    access.mockResolvedValue({ ok: true, value: ACCESS as never });
    await tick();

    expect(mockReplace).toHaveBeenCalledWith('/room/reunion/call');
  });

  it("scrute aussi tant qu'aucun modérateur n'est là", async () => {
    // L'absence de modérateur est une attente, pas une fin de course :
    // quelqu'un qui peut ouvrir peut arriver plus tard, et l'écran doit
    // basculer tout seul. Sans scrutation dans cet état, la personne reste
    // devant « aucun modérateur » pour toujours.
    jest
      .spyOn(rooms, 'requestEntry')
      .mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });
    const access = jest
      .spyOn(rooms, 'fetchRoomAccess')
      .mockResolvedValue({ ok: false, error: { kind: 'lobby', participantId: '' } });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-no-moderator')).toBeTruthy());

    access.mockResolvedValue({ ok: true, value: ACCESS as never });
    await tick();

    expect(mockReplace).toHaveBeenCalledWith('/room/reunion/call');
  });

  it("ne sort pas de la file d'attente sur une coupure passagère", async () => {
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'waiting', livekitUrl: null, token: null },
    });
    const access = jest
      .spyOn(rooms, 'fetchRoomAccess')
      .mockResolvedValue({ ok: false, error: { kind: 'network' } });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());

    await tick();
    await tick();

    expect(screen.getByTestId('lobby-waiting')).toBeTruthy();
    expect(screen.queryByTestId('lobby-error')).toBe(null);

    // La reprise se fait toute seule : la scrutation ne s'est pas arrêtée.
    access.mockResolvedValue({ ok: true, value: ACCESS as never });
    await tick();
    expect(mockReplace).toHaveBeenCalledWith('/room/reunion/call');
  });

  it("invite à se reconnecter si la session expire pendant l'attente", async () => {
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'waiting', livekitUrl: null, token: null },
    });
    jest
      .spyOn(rooms, 'fetchRoomAccess')
      .mockResolvedValue({ ok: false, error: { kind: 'unauthorized' } });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());

    await tick();

    expect(screen.getByText('error.unauthorized')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("arrête de scruter une fois l'écran démonté", async () => {
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'waiting', livekitUrl: null, token: null },
    });
    const access = jest
      .spyOn(rooms, 'fetchRoomAccess')
      .mockResolvedValue({ ok: false, error: { kind: 'lobby', participantId: '' } });

    const view = await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());

    await tick();
    const callsBeforeUnmount = access.mock.calls.length;
    expect(callsBeforeUnmount).toBeGreaterThan(0);

    await view.unmount();
    await tick();
    await tick();

    // Un intervalle non nettoyé continue d'interroger le serveur pour un
    // écran que plus personne ne regarde, et fait fuir un timer par visite.
    expect(access.mock.calls.length).toBe(callsBeforeUnmount);
  });
});
