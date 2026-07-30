import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import * as rooms from 'src/api/rooms';
import type { Room } from 'src/call/types';
import { forgetRoomTitle, rememberRoomTitle } from 'src/rooms/titles';
import * as accounts from 'src/auth/accounts';
import { filterRooms, HomeScreen } from './home';

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

describe('filterRooms', () => {
  const room = (slug: string, name?: string): Room => ({
    id: 'r-' + slug,
    slug,
    name: name ?? slug,
    accessLevel: 'public',
  });

  it("remonte les réunions dont on connaît l'intitulé avant les codes", () => {
    // Le défaut constaté sur appareil : des dizaines de codes triés
    // alphabétiquement noyaient les réunions que la personne avait créées.
    // L'intitulé vivant sur l'appareil, c'est sa présence qui distingue les
    // deux, plus l'écart entre le nom et le slug.
    rememberRoomTitle('mno-pqrs-tuv', 'Point hebdo');

    const result = filterRooms(
      [room('zzz-aaaa-bbb'), room('mno-pqrs-tuv'), room('aaa-bbbb-ccc')],
      '',
    );

    expect(result.map((r) => r.slug)).toEqual(['mno-pqrs-tuv', 'aaa-bbbb-ccc', 'zzz-aaaa-bbb']);
    forgetRoomTitle('mno-pqrs-tuv');
  });

  it("cherche aussi dans l'intitulé local, pas seulement dans le nom rendu", () => {
    rememberRoomTitle('mno-pqrs-tuv', 'Point hebdo');

    const result = filterRooms([room('mno-pqrs-tuv'), room('aaa-bbbb-ccc')], 'hebdo');

    expect(result.map((r) => r.slug)).toEqual(['mno-pqrs-tuv']);
    forgetRoomTitle('mno-pqrs-tuv');
  });

  it('trie chaque groupe par ordre alphabétique', () => {
    const result = filterRooms([room('b', 'Revue'), room('a', 'Ateliers')], '');

    expect(result.map((r) => r.name)).toEqual(['Ateliers', 'Revue']);
  });

  it('filtre sur le nom', () => {
    const result = filterRooms([room('x', 'Point hebdo'), room('y', 'Revue')], 'hebdo');

    expect(result.map((r) => r.name)).toEqual(['Point hebdo']);
  });

  it('filtre aussi sur le code, souvent lu ailleurs', () => {
    // Le nom doit différer du slug, sinon chercher dans le nom seul trouverait
    // quand même le code et le test ne garderait rien.
    const result = filterRooms(
      [room('aet-jgqg-fpa', 'Point hebdo'), room('afk-segd-yzm', 'Revue')],
      'jgqg',
    );

    expect(result.map((r) => r.slug)).toEqual(['aet-jgqg-fpa']);
  });

  it('ignore la casse et les espaces autour de la recherche', () => {
    const result = filterRooms([room('x', 'Point hebdo')], '  HEBDO  ');

    expect(result).toHaveLength(1);
  });

  it('ne filtre rien sur une recherche vide', () => {
    const result = filterRooms([room('a'), room('b')], '   ');

    expect(result).toHaveLength(2);
  });

  it("ne modifie pas la liste qu'on lui passe", () => {
    const rooms = [room('b', 'Revue'), room('a', 'Ateliers')];

    filterRooms(rooms, '');

    // Trier sur place muterait l'état React et le rendu suivant partirait d'un
    // ordre déjà changé, sans que personne ne l'ait demandé.
    expect(rooms.map((r) => r.slug)).toEqual(['b', 'a']);
  });
});
