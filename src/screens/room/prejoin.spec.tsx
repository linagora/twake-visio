import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import * as rooms from 'src/api/rooms';
import * as accounts from 'src/auth/accounts';
import { PrejoinScreen } from './prejoin';

// babel-plugin-jest-hoist lève l'appel jest.mock au-dessus des const du module :
// seul un nom préfixé par `mock` peut être référencé depuis la factory.
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

const GRANTED = {
  ok: true,
  value: {
    room: { id: 'r-1', slug: 'reunion', name: 'Réunion', accessLevel: 'public' },
    livekitUrl: 'wss://livekit.linagora.com',
    token: 'lk',
    isAdministrable: false,
  },
} as const;

beforeEach(() => {
  jest.restoreAllMocks();
  mockReplace.mockReset();
  jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
});

describe('PrejoinScreen', () => {
  it("affiche le bouton de jonction quand l'accès est accordé", async () => {
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);

    await render(<PrejoinScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('join-call-btn')).toBeTruthy();
    });
  });

  it("redirige vers la salle d'attente quand l'API répond lobby", async () => {
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue({
      ok: false,
      error: { kind: 'lobby', participantId: '' },
    });

    await render(<PrejoinScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/room/reunion/lobby');
    });
  });

  it("dit pourquoi et laisse une sortie quand l'accès est refusé", async () => {
    // Mesuré sur appareil : une session expirée renvoyait `unauthorized`, la
    // seule branche traitée étant `lobby`. `access` restait `null`, l'écran
    // affichait un sablier NU — sans message, sans sortie, sans retour — et le
    // `.catch(() => setAccess(null))` posait `null` sur `null`, ce qui avait
    // l'apparence d'un traitement d'erreur sans en être un.
    //
    // C'est le premier écran qu'on traverse en ouvrant une réunion, et le même
    // cul-de-sac que `call.tsx` a déjà payé deux fois.
    jest
      .spyOn(rooms, 'fetchRoomAccess')
      .mockResolvedValue({ ok: false, error: { kind: 'unauthorized' } });

    await render(<PrejoinScreen />);

    await waitFor(() => expect(screen.getByTestId('prejoin-error')).toBeTruthy());
    expect(screen.getByTestId('prejoin-error')).toHaveTextContent('error.unauthorized');
    expect(screen.queryByTestId('prejoin-loading')).toBeNull();
    await fireEvent.press(screen.getByTestId('prejoin-leave-btn'));
    expect(mockReplace).toHaveBeenCalledWith('/home');
  });

  it("porte l'état des périphériques dans l'URL de l'appel", async () => {
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);

    await render(<PrejoinScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('camera-switch')).toBeTruthy();
    });

    // L'interrupteur porte l'état « caméra désactivée » : le passer à true coupe
    // la caméra, et l'URL de l'appel doit donc annoncer camera=0.
    await fireEvent(screen.getByTestId('camera-switch'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('join-call-btn'));

    expect(mockReplace).toHaveBeenCalledWith('/room/reunion/call?camera=0&mic=1');
  });
});
