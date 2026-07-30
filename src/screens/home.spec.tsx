import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import * as rooms from 'src/api/rooms';
import * as accounts from 'src/auth/accounts';
import { HomeScreen } from './home';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

beforeEach(() => {
  jest.clearAllMocks();
});
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

describe('HomeScreen', () => {
  it("affiche les réunions renvoyées par l'API", async () => {
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
    jest.spyOn(rooms, 'fetchMyRooms').mockResolvedValue({
      ok: true,
      value: [{ id: 'r-1', slug: 'point-hebdo', name: 'Point hebdo', accessLevel: 'trusted' }],
    });

    await render(<HomeScreen />);

    await waitFor(() => {
      expect(screen.getByText('Point hebdo')).toBeTruthy();
    });
  });

  it("n'affiche aucune liste quand l'API échoue", async () => {
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
    jest.spyOn(rooms, 'fetchMyRooms').mockResolvedValue({ ok: false, error: { kind: 'network' } });

    await render(<HomeScreen />);

    await waitFor(() => {
      expect(screen.queryByTestId('room-item')).toBe(null);
    });
  });

  it('rejoint le code saisi, espaces retirés', async () => {
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
    jest.spyOn(rooms, 'fetchMyRooms').mockResolvedValue({ ok: true, value: [] });

    await render(<HomeScreen />);
    await fireEvent.changeText(screen.getByTestId('join-code-input'), '  point-hebdo  ');
    await fireEvent.press(screen.getByTestId('join-btn'));

    expect(mockPush).toHaveBeenCalledWith('/room/point-hebdo/prejoin');
  });

  it('ne navigue pas sur un code vide ou blanc', async () => {
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
    jest.spyOn(rooms, 'fetchMyRooms').mockResolvedValue({ ok: true, value: [] });

    await render(<HomeScreen />);
    await fireEvent.changeText(screen.getByTestId('join-code-input'), '   ');
    await fireEvent.press(screen.getByTestId('join-btn'));

    expect(mockPush).not.toHaveBeenCalled();
  });
});
