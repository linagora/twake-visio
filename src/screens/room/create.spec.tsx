import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import * as rooms from 'src/api/rooms';
import * as users from 'src/api/users';
import * as accounts from 'src/auth/accounts';
import { findRoomTitle, forgetRoomTitle } from 'src/rooms/titles';
import type { Account } from 'src/auth/accounts';
import { CreateRoomScreen } from './create';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const ACCOUNT: Account = {
  id: 'https://sso.linagora.com|u-1',
  instance: {
    serverUrl: 'https://meet.linagora.com',
    issuer: 'https://sso.linagora.com',
    clientId: 'twake-visio',
    livekitUrl: 'https://livekit.linagora.com',
    features: { recording: true, subtitle: true, telephony: false, calendar: false },
  },
  email: 'ada@linagora.com',
  displayName: 'Ada',
};

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT);
});

describe('CreateRoomScreen', () => {
  it('propose public par défaut, pour que la réunion démarre sans le créateur', async () => {
    await render(<CreateRoomScreen />);

    expect(screen.getByTestId('access-public')).toBeTruthy();
    expect(screen.getByText('room.accessPublic')).toBeTruthy();
    expect(screen.getByTestId('access-public')).toBeChecked();
    expect(screen.getByTestId('access-restricted')).not.toBeChecked();
    expect(screen.queryByTestId('moderator-warning')).toBe(null);
  });

  it('avertit que restricted exige un modérateur présent', async () => {
    await render(<CreateRoomScreen />);
    await fireEvent.press(screen.getByTestId('access-restricted'));

    expect(screen.getByTestId('moderator-warning')).toBeTruthy();
  });

  it("crée le salon avec le niveau d'accès sélectionné", async () => {
    const create = jest.spyOn(rooms, 'createRoom').mockResolvedValue({
      ok: true,
      value: { id: 'r-9', slug: 'revue', name: 'Revue', accessLevel: 'public' },
    });

    await render(<CreateRoomScreen />);
    await fireEvent.changeText(screen.getByTestId('room-name-input'), 'Revue');
    await fireEvent.press(screen.getByTestId('submit-btn'));

    expect(create).toHaveBeenCalledWith(expect.anything(), {
      name: 'Revue',
      accessLevel: 'public',
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/room/revue/prejoin');
    });
  });

  it('accorde le rôle owner aux co-organisateurs sélectionnés', async () => {
    jest.spyOn(users, 'searchUsers').mockResolvedValue({
      ok: true,
      value: [{ id: 'u-2', email: 'boss@linagora.com', displayName: 'Boss' }],
    });
    jest.spyOn(rooms, 'createRoom').mockResolvedValue({
      ok: true,
      value: { id: 'r-9', slug: 'revue', name: 'Revue', accessLevel: 'public' },
    });
    const grant = jest
      .spyOn(rooms, 'grantRoomAccess')
      .mockResolvedValue({ ok: true, value: undefined });

    await render(<CreateRoomScreen />);
    await fireEvent.changeText(screen.getByTestId('room-name-input'), 'Revue');
    await fireEvent.changeText(screen.getByTestId('co-owner-input'), 'boss@linagora.com');
    await fireEvent(screen.getByTestId('co-owner-input'), 'submitEditing');

    await waitFor(() => {
      expect(screen.getByTestId('co-owner-candidate')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('co-owner-candidate'));
    await fireEvent.press(screen.getByTestId('submit-btn'));

    await waitFor(() => {
      expect(grant).toHaveBeenCalledWith(expect.anything(), 'r-9', 'u-2', 'owner');
    });
  });
});

describe('CreateRoomScreen, échecs visibles', () => {
  it('dit pourquoi la création a échoué plutôt que de ne rien faire', async () => {
    // Un bouton dont l'appui ne produit rien se lit comme un bouton mort, et
    // l'utilisateur réessaie sans savoir quoi changer. Constaté sur appareil :
    // « rien ne se passe quand je clique ».
    jest
      .spyOn(rooms, 'createRoom')
      .mockResolvedValue({ ok: false, error: { kind: 'server', status: 500 } });

    await render(<CreateRoomScreen />);
    await fireEvent.changeText(screen.getByTestId('room-name-input'), 'Revue');
    await fireEvent.press(screen.getByTestId('submit-btn'));

    await waitFor(() => {
      expect(screen.getByText('room.createFailed')).toBeTruthy();
    });
  });

  it("dit que le nom est déjà pris, au lieu d'un échec à réessayer", async () => {
    // L'API dérive le slug du nom et refuse les doublons. C'est la seule erreur
    // de création que la personne peut lever elle-même : la présenter comme un
    // échec générique l'invite à réessayer le même nom.
    jest.spyOn(rooms, 'createRoom').mockResolvedValue({
      ok: false,
      error: { kind: 'validation', fields: { slug: ['Room with this Slug already exists.'] } },
    });

    await render(<CreateRoomScreen />);
    await fireEvent.changeText(screen.getByTestId('room-name-input'), 'test');
    await fireEvent.press(screen.getByTestId('submit-btn'));

    await waitFor(() => {
      expect(screen.getByText('room.nameTaken')).toBeTruthy();
    });
    expect(screen.queryByText('room.createFailed')).toBe(null);
  });

  it("garde l'échec générique pour un refus qui ne porte pas sur le nom", async () => {
    jest.spyOn(rooms, 'createRoom').mockResolvedValue({
      ok: false,
      error: { kind: 'validation', fields: { name: ['trop long'] } },
    });

    await render(<CreateRoomScreen />);
    await fireEvent.changeText(screen.getByTestId('room-name-input'), 'test');
    await fireEvent.press(screen.getByTestId('submit-btn'));

    await waitFor(() => {
      expect(screen.getByText('room.createFailed')).toBeTruthy();
    });
  });

  it('invite à se reconnecter quand la session a expiré', async () => {
    jest
      .spyOn(rooms, 'createRoom')
      .mockResolvedValue({ ok: false, error: { kind: 'unauthorized' } });

    await render(<CreateRoomScreen />);
    await fireEvent.changeText(screen.getByTestId('room-name-input'), 'Revue');
    await fireEvent.press(screen.getByTestId('submit-btn'));

    // Ne pas confondre les deux : dire « reconnectez-vous » sur un 500 envoie la
    // personne refaire une authentification qui n'y changera rien.
    await waitFor(() => {
      expect(screen.getByText('error.unauthorized')).toBeTruthy();
    });
    expect(screen.queryByText('room.createFailed')).toBe(null);
  });

  it('ne reste pas muet quand le fetch rejette', async () => {
    jest.spyOn(rooms, 'createRoom').mockRejectedValue(new Error('boom'));

    await render(<CreateRoomScreen />);
    await fireEvent.changeText(screen.getByTestId('room-name-input'), 'Revue');
    await fireEvent.press(screen.getByTestId('submit-btn'));

    await waitFor(() => {
      expect(screen.getByText('error.network')).toBeTruthy();
    });
  });

  it('réclame un nom au lieu de ne rien faire sur un champ vide', async () => {
    const create = jest.spyOn(rooms, 'createRoom');

    await render(<CreateRoomScreen />);
    await fireEvent.press(screen.getByTestId('submit-btn'));

    await waitFor(() => {
      expect(screen.getByText('room.nameRequired')).toBeTruthy();
    });
    expect(create).not.toHaveBeenCalled();
  });
});

describe('CreateRoomScreen, intitulé lisible', () => {
  afterEach(() => {
    forgetRoomTitle('abc-defg-hij');
  });

  it("retient l'intitulé saisi sous le code rendu par le serveur", async () => {
    // Le nom envoyé au serveur est un code : sans cette mémorisation, la
    // réunion que la personne vient de nommer réapparaîtrait dans la liste
    // sous la forme `abc-defg-hij`, et son intitulé serait perdu à l'instant
    // même où elle le tape.
    jest.spyOn(rooms, 'createRoom').mockResolvedValue({
      ok: true,
      value: { id: 'r-9', slug: 'abc-defg-hij', name: 'abc-defg-hij', accessLevel: 'public' },
    });

    await render(<CreateRoomScreen />);
    await fireEvent.changeText(screen.getByTestId('room-name-input'), 'Point hebdo');
    await fireEvent.press(screen.getByTestId('submit-btn'));

    await waitFor(() => {
      expect(findRoomTitle('abc-defg-hij')).toBe('Point hebdo');
    });
  });

  it('ne retient rien quand la création échoue', async () => {
    jest.spyOn(rooms, 'createRoom').mockResolvedValue({ ok: false, error: { kind: 'network' } });

    await render(<CreateRoomScreen />);
    await fireEvent.changeText(screen.getByTestId('room-name-input'), 'Point hebdo');
    await fireEvent.press(screen.getByTestId('submit-btn'));

    await waitFor(() => expect(screen.getByText('error.network')).toBeTruthy());
    // Retenir un intitulé pour un salon qui n'existe pas laisserait une entrée
    // que rien ne viendrait jamais nettoyer.
    expect(findRoomTitle('abc-defg-hij')).toBe(null);
  });

  // `app/_layout.tsx` masque l'en-tête du Stack : sans cette flèche, l'écran
  // est un cul-de-sac. Signalé sur appareil, et vrai depuis l'origine.
  it("offre une sortie vers l'accueil", async () => {
    await render(<CreateRoomScreen />);

    await fireEvent.press(screen.getByTestId('create-header-back'));

    expect(mockReplace).toHaveBeenCalledWith('/home');
  });
});
