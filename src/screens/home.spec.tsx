import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import * as rooms from 'src/api/rooms';
import type { Room } from 'src/call/types';
import { forgetRoomTitle, rememberRoomTitle } from 'src/rooms/titles';
import * as accounts from 'src/auth/accounts';
import { tokens } from 'src/ui/tokens';
import { filterRooms, HomeScreen } from './home';

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// L'accueil héberge désormais la feuille « Rejoindre », donc un `Portal` :
// sans `PaperProvider` ancêtre le rendu jette un `AggregateError` peu bavard.
// Même préambule que `bottomSheet.spec.tsx` et `joinSheet.spec.tsx`.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn(async () => '') }));

function renderHome(): Promise<unknown> {
  return render(
    <PaperProvider theme={{ animation: { scale: 0 } }}>
      <HomeScreen />
    </PaperProvider>,
  );
}

// Des encoches NON NULLES, injectées : le double de `jest.setup.ts` rend zéro
// par défaut, et un rembourrage de zéro passerait aussi bien avec le crochet
// qu'avec une constante. Le fournisseur du double lit `initialMetrics`
// (`jest/mock.tsx:45-58`), donc ces valeurs atteignent bien l'écran.
const IPHONE_INSETS = { bottom: 34, left: 0, right: 0, top: 59 };

function renderHomeWithInsets(): Promise<unknown> {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 874, width: 402, x: 0, y: 0 },
        insets: IPHONE_INSETS,
      }}
    >
      <PaperProvider theme={{ animation: { scale: 0 } }}>
        <HomeScreen />
      </PaperProvider>
    </SafeAreaProvider>,
  );
}

const ACCOUNT = {
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

function manyRooms(count: number): readonly Room[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `r-${index}`,
    slug: `salon-${index}`,
    name: `Salon ${index}`,
    accessLevel: 'public' as const,
  }));
}

describe('HomeScreen', () => {
  it("affiche les réunions renvoyées par l'API", async () => {
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
    jest.spyOn(rooms, 'fetchMyRooms').mockResolvedValue({
      ok: true,
      value: [{ id: 'r-1', slug: 'point-hebdo', name: 'Point hebdo', accessLevel: 'trusted' }],
    });

    await renderHome();

    await waitFor(() => {
      expect(screen.getByText('Point hebdo')).toBeTruthy();
    });
  });

  it("n'affiche aucune liste quand l'API échoue", async () => {
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
    jest.spyOn(rooms, 'fetchMyRooms').mockResolvedValue({ ok: false, error: { kind: 'network' } });

    await renderHome();

    await waitFor(() => {
      expect(screen.queryByTestId('room-item')).toBe(null);
    });
  });

  // Les deux tests du champ de code ont été RETIRÉS, pas contournés : ce champ
  // n'existe plus. Rejoindre par code passe désormais par la feuille, et
  // `src/screens/joinSheet.spec.tsx` couvre ce parcours en entier — y compris
  // le refus d'un lien d'hôte inconnu, que l'ancien champ ne vérifiait pas.
  it('ouvre la feuille Rejoindre depuis la carte', async () => {
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
    jest.spyOn(rooms, 'fetchMyRooms').mockResolvedValue({ ok: true, value: [] });

    await renderHome();
    await fireEvent.press(screen.getByTestId('home-join'));

    expect(screen.getByTestId('home-join-sheet-input')).toBeTruthy();
  });

  // Décision 2 du partenaire humain : la rangée de serveur est réservée au
  // mode invité. `JoinSheet` ne la rend que si `onHostChange` lui est fourni
  // (`joinSheet.spec.tsx` le garde à sa source) ; ce test garde le SITE
  // D'APPEL — qu'une personne connectée ne passe jamais ce rappel.
  it("ne rend pas la rangée de serveur : une personne connectée n'a pas de serveur à choisir", async () => {
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
    jest.spyOn(rooms, 'fetchMyRooms').mockResolvedValue({ ok: true, value: [] });

    await renderHome();
    await fireEvent.press(screen.getByTestId('home-join'));

    expect(screen.queryByTestId('home-join-sheet-host')).toBe(null);
  });

  // La conditionnelle prend ses deux valeurs : fermée au départ.
  it('ne monte pas la feuille tant qu’on ne l’ouvre pas', async () => {
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
    jest.spyOn(rooms, 'fetchMyRooms').mockResolvedValue({ ok: true, value: [] });

    await renderHome();

    expect(screen.queryByTestId('home-join-sheet-input')).toBe(null);
  });

  // Le filtre n'apparaît que s'il sert. La conditionnelle `rooms.length > 5`
  // n'était gardée par RIEN — trouvé par mutation en refondant l'écran : la
  // figer à `true` ne rougissait aucun test. Les deux états, chacun avec sa
  // fixture, et la borne franchie des deux côtés.
  it('ne rend pas le filtre sur une liste courte', async () => {
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
    jest.spyOn(rooms, 'fetchMyRooms').mockResolvedValue({ ok: true, value: manyRooms(5) });

    await renderHome();
    await waitFor(() => expect(screen.getAllByTestId('room-item')).toHaveLength(5));

    expect(screen.queryByTestId('room-filter-input')).toBe(null);
  });

  it('rend le filtre dès que la liste dépasse cinq réunions', async () => {
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
    jest.spyOn(rooms, 'fetchMyRooms').mockResolvedValue({ ok: true, value: manyRooms(6) });

    await renderHome();

    await waitFor(() => expect(screen.getByTestId('room-filter-input')).toBeTruthy());
  });

  it('pousse l’écran de création depuis la carte', async () => {
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
    jest.spyOn(rooms, 'fetchMyRooms').mockResolvedValue({ ok: true, value: [] });

    await renderHome();
    await fireEvent.press(screen.getByTestId('home-create'));

    expect(mockPush).toHaveBeenCalledWith('/room/create');
  });

  // La coque n'applique plus les encoches — sa `SafeAreaView` les transformait
  // en rembourrage SANS fond, d'où une bande blanche que l'écran d'appel ne
  // pouvait pas peindre. Chaque racine les porte donc elle-même, ET la peint :
  // les deux assertions vont ensemble, un rembourrage sans fond ne peint rien.
  describe('les encoches', () => {
    // Sur l'EN-TÊTE et non sur la racine : les deux peignent, mais pas la même
    // couleur. Posé sur la racine, le bandeau d'état prenait `appBackground`
    // sous un en-tête `cardSurface` — une couture visible, constatée sur
    // appareil. `+ 8` est le rembourrage propre de l'en-tête.
    it('applique l’encart HAUT sur l’en-tête, qui borde ce bord', async () => {
      jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
      jest.spyOn(rooms, 'fetchMyRooms').mockResolvedValue({ ok: true, value: [] });

      await renderHomeWithInsets();

      expect(screen.getByTestId('home-header')).toHaveStyle({
        backgroundColor: tokens.color.cardSurface,
        paddingTop: 67,
      });
      expect(screen.getByTestId('home-screen')).not.toHaveStyle({ paddingTop: 59 });
    });

    // LA garde de cet écran, et elle vaut plus que la précédente : l'encart bas
    // appartient à la barre d'onglets, qui applique le sien et le peint de son
    // fond. Les deux ensemble empilaient ~34 pt de vide sous les libellés —
    // signalé sur appareil, corrigé une fois, et rien n'empêchait le retour.
    it('laisse l’encart BAS à la barre d’onglets', async () => {
      jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
      jest.spyOn(rooms, 'fetchMyRooms').mockResolvedValue({ ok: true, value: [] });

      await renderHomeWithInsets();

      expect(screen.getByTestId('home-screen')).not.toHaveStyle({ paddingBottom: 34 });
    });
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

// Le bloc « compte actif et déconnexion » a été RETIRÉ, pas contourné.
//
// L'accueil ne porte plus ni bandeau de compte ni bouton de déconnexion : le
// Lot 2 les a déplacés vers Réglages, où le mockup met l'identité. Les trois
// tests ont suivi l'information — `reglages.spec.tsx` garde la déconnexion et
// l'affichage de l'instance, et `src/instance/label.spec.ts` garde
// `instanceLabel`, qui vivait ici.
