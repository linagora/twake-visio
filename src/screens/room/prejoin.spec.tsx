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

// Les deux interrupteurs partent désormais des Réglages. Sans ce double, le
// test lirait le vrai magasin MMKV — un état partagé entre fichiers de spec,
// donc un résultat qui dépendrait de l'ordre d'exécution.
jest.mock('src/settings/preferences', () => ({ readPreferences: jest.fn() }));
jest.mock('src/rooms/journal', () => ({ rememberVisit: jest.fn() }));

const preferences = jest.requireMock('src/settings/preferences') as {
  readPreferences: jest.Mock;
};
const journal = jest.requireMock('src/rooms/journal') as { rememberVisit: jest.Mock };

const DEFAULT_PREFS = {
  micOffOnJoin: true,
  cameraOffOnJoin: false,
  defaultAccessLevel: 'public' as const,
  language: null,
};

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
  journal.rememberVisit.mockClear();
  preferences.readPreferences.mockReturnValue(DEFAULT_PREFS);
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

    // `mic=0` parce que le défaut des Réglages est « micro coupé à l'entrée »,
    // posé explicitement par `DEFAULT_PREFS` ci-dessus. Ce test lisait
    // auparavant un `useState(false)` codé en dur, et c'est lui qui a signalé
    // le changement de comportement quand la préférence l'a remplacé.
    expect(mockReplace).toHaveBeenCalledWith('/room/reunion/call?camera=0&mic=0');
  });

  describe('les Réglages gouvernent l’état de départ', () => {
    // Chaque préférence dans ses DEUX états : sans le second cas, un
    // `useState(true)` codé en dur passerait.
    it.each([
      [true, 0],
      [false, 1],
    ])('part de micOffOnJoin=%s et annonce mic=%i', async (micOffOnJoin, expected) => {
      preferences.readPreferences.mockReturnValue({ ...DEFAULT_PREFS, micOffOnJoin });
      jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);

      await render(<PrejoinScreen />);
      await waitFor(() => {
        expect(screen.getByTestId('join-call-btn')).toBeTruthy();
      });
      await fireEvent.press(screen.getByTestId('join-call-btn'));

      expect(mockReplace).toHaveBeenCalledWith(
        `/room/reunion/call?camera=1&mic=${String(expected)}`,
      );
    });

    it.each([
      [true, 0],
      [false, 1],
    ])('part de cameraOffOnJoin=%s et annonce camera=%i', async (cameraOffOnJoin, expected) => {
      preferences.readPreferences.mockReturnValue({ ...DEFAULT_PREFS, cameraOffOnJoin });
      jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);

      await render(<PrejoinScreen />);
      await waitFor(() => {
        expect(screen.getByTestId('join-call-btn')).toBeTruthy();
      });
      await fireEvent.press(screen.getByTestId('join-call-btn'));

      expect(mockReplace).toHaveBeenCalledWith(
        `/room/reunion/call?camera=${String(expected)}&mic=0`,
      );
    });
  });

  describe('le journal de l’Historique', () => {
    // `handleJoin` fait DEUX choses — journaliser puis naviguer. Deux
    // instructions, deux assertions qui les nomment.
    it('enregistre la visite au moment de rejoindre', async () => {
      jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);

      await render(<PrejoinScreen />);
      await waitFor(() => {
        expect(screen.getByTestId('join-call-btn')).toBeTruthy();
      });
      await fireEvent.press(screen.getByTestId('join-call-btn'));

      expect(journal.rememberVisit).toHaveBeenCalledWith(
        'reunion',
        GRANTED.value.room.name,
        expect.any(Number),
      );
    });

    it('n’enregistre rien tant qu’on n’a pas rejoint', async () => {
      jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);

      await render(<PrejoinScreen />);
      await waitFor(() => {
        expect(screen.getByTestId('join-call-btn')).toBeTruthy();
      });

      expect(journal.rememberVisit).not.toHaveBeenCalled();
    });
  });
});
