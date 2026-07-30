import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import * as rooms from 'src/api/rooms';
import * as accounts from 'src/auth/accounts';
import { LobbyScreen } from './lobby';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
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
  jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
});

describe('LobbyScreen', () => {
  it("annonce l'attente après une demande acceptée par le serveur", async () => {
    jest
      .spyOn(rooms, 'requestEntry')
      .mockResolvedValue({ ok: true, value: { participantId: 'p-1' } });

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

  it("ne présente pas une panne réseau comme une absence de modérateur", async () => {
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: false, error: { kind: 'network' } });

    await render(<LobbyScreen />);

    await waitFor(() => {
      expect(screen.getByText('error.network')).toBeTruthy();
    });
    expect(screen.queryByTestId('lobby-no-moderator')).toBe(null);
    expect(screen.queryByTestId('lobby-loading')).toBe(null);
  });

  it("ne présente pas un rejet du serveur comme une absence de modérateur", async () => {
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
    jest
      .spyOn(rooms, 'requestEntry')
      .mockResolvedValue({ ok: true, value: { participantId: 'p-1' } });

    await render(<LobbyScreen />);

    await waitFor(() => {
      expect(screen.getByText('error.unauthorized')).toBeTruthy();
    });
    expect(rooms.requestEntry).not.toHaveBeenCalled();
  });
});
