import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import * as accounts from 'src/auth/accounts';
import { tokens } from 'src/ui/tokens';
import * as upcoming from 'src/calendar/useUpcoming';
import { HomeScreen } from './home';

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

// L'onglet du système qu'ouvre l'icône agenda. Doublé au niveau du PAQUET :
// c'est la seule couche que l'application ne possède pas, et le doubler plus
// haut ne prouverait rien du chemin réellement emprunté.
const mockOpenBrowser = jest.fn(async (_url: string) => ({ type: 'opened' }));
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (url: string) => mockOpenBrowser(url),
}));

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

const NOW = Date.UTC(2026, 7, 3, 8, 0, 0);
const EVENT = {
  uid: 'evt-1',
  summary: 'COCO',
  startMs: NOW + 3600000,
  endMs: NOW + 7200000,
  meetUrl: 'https://meet.twake-dev.maudet.cloud/mjj-beyv-zai',
};

const ACCOUNT = {
  id: 'https://sso.linagora.com|u-1',
  instance: {
    serverUrl: 'https://meet.twake-dev.maudet.cloud',
    issuer: 'https://sso.linagora.com',
    clientId: 'twake-visio',
    livekitUrl: 'https://livekit.linagora.com',
    features: { recording: true, subtitle: true, telephony: false, calendar: false },
  },
  email: 'ada@linagora.com',
  displayName: 'Ada',
};

describe('HomeScreen', () => {
  // Le test « n'affiche aucune liste quand l'API échoue » a été RETIRÉ : il n'y
  // a plus de liste, ni d'appel à `fetchMyRooms`. Ce que l'écran doit prouver
  // désormais est plus bas, dans « les prochaines visioconférences ».

  // Les deux tests du champ de code ont été RETIRÉS, pas contournés : ce champ
  // n'existe plus. Rejoindre par code passe désormais par la feuille, et
  // `src/screens/joinSheet.spec.tsx` couvre ce parcours en entier — y compris
  // le refus d'un lien d'hôte inconnu, que l'ancien champ ne vérifiait pas.
  it('ouvre la feuille Rejoindre depuis la carte', async () => {
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);

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

    await renderHome();
    await fireEvent.press(screen.getByTestId('home-join'));

    expect(screen.queryByTestId('home-join-sheet-host')).toBe(null);
  });

  // `new URL` sur une valeur qui vient du magasin de comptes, à CHAQUE rendu
  // de l'écran principal, et pour un hôte que cet écran n'affiche même pas —
  // il ne passe pas `onHostChange`, donc la rangée de serveur ne s'y rend pas.
  // Sans garde-fou, un `serverUrl` illisible faisait tomber tout l'accueil : le
  // pire échange possible. Le dépôt garde déjà ses autres `new URL`
  // (`agendaHosts`, `toSamePath`).
  it('rend quand même l’accueil si le serveur du compte est illisible', async () => {
    jest
      .spyOn(accounts, 'getActiveAccount')
      .mockReturnValue({ ...ACCOUNT, instance: { ...ACCOUNT.instance, serverUrl: '' } } as never);

    await renderHome();

    expect(screen.getByTestId('home-join')).toBeOnTheScreen();
  });

  // La conditionnelle prend ses deux valeurs : fermée au départ.
  it('ne monte pas la feuille tant qu’on ne l’ouvre pas', async () => {
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);

    await renderHome();

    expect(screen.queryByTestId('home-join-sheet-input')).toBe(null);
  });

  it('pousse l’écran de création depuis la carte', async () => {
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);

    await renderHome();
    await fireEvent.press(screen.getByTestId('home-create'));

    expect(mockPush).toHaveBeenCalledWith('/room/create');
  });

  // Le panneau des prochaines visioconférences. Le crochet est doublé : ce que
  // cet écran doit prouver, c'est qu'il RESPECTE les trois états, pas que la
  // chaîne CalDAV fonctionne — `sideService.spec.ts` s'en charge.
  describe('les prochaines visioconférences', () => {
    it('rend le panneau quand le calendrier répond', async () => {
      jest.spyOn(upcoming, 'useUpcomingMeetings').mockReturnValue({
        status: 'ready',
        events: [EVENT],
        now: NOW,
      });
      jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);

      await renderHome();

      expect(screen.getByTestId('upcoming-panel')).toBeTruthy();
      expect(screen.getByTestId('upcoming-title-evt-1')).toHaveTextContent('COCO');
    });

    it("ne rend RIEN quand le calendrier n'est pas disponible", async () => {
      // La seconde polarité, et c'est le contrat repris du widget web : toute
      // erreur masque le panneau, pour que l'accueil n'ait jamais l'air cassé.
      // Un `401` d'audience passe par ici.
      jest
        .spyOn(upcoming, 'useUpcomingMeetings')
        .mockReturnValue({ cause: 'signed-out', status: 'unavailable', reason: 'test' });
      jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);

      await renderHome();

      expect(screen.queryByTestId('upcoming-panel')).toBe(null);
    });

    it('ne rend rien pendant le premier chargement', async () => {
      jest.spyOn(upcoming, 'useUpcomingMeetings').mockReturnValue({ status: 'loading' });
      jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);

      await renderHome();

      expect(screen.queryByTestId('upcoming-panel')).toBe(null);
    });

    it('rend le panneau VIDE quand il n’y a rien de prévu', async () => {
      // Différent d'« indisponible », et c'est tout l'intérêt : sans cette
      // distinction, qui n'a pas de réunion croit l'application cassée.
      jest.spyOn(upcoming, 'useUpcomingMeetings').mockReturnValue({
        status: 'ready',
        events: [],
        now: NOW,
      });
      jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);

      await renderHome();

      expect(screen.getByTestId('upcoming-empty')).toBeTruthy();
    });

    it('ouvre la pré-séance du bon salon depuis « Rejoindre »', async () => {
      jest.spyOn(upcoming, 'useUpcomingMeetings').mockReturnValue({
        status: 'ready',
        events: [EVENT],
        now: NOW,
      });
      jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);

      await renderHome();
      await fireEvent.press(screen.getByTestId('upcoming-join-evt-1'));

      expect(mockPush).toHaveBeenCalledWith('/room/mjj-beyv-zai/prejoin');
    });

    it("ne navigue nulle part quand l'URL ne donne aucun salon", async () => {
      // Une ligne « Rejoindre » qui ne mène nulle part est pire qu'une ligne
      // absente : `parseMeetingLink` rend `null` sur un hôte inconnu.
      jest.spyOn(upcoming, 'useUpcomingMeetings').mockReturnValue({
        status: 'ready',
        events: [{ ...EVENT, meetUrl: 'https://ailleurs.example/abc-defg-hij' }],
        now: NOW,
      });
      jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);

      await renderHome();
      await fireEvent.press(screen.getByTestId('upcoming-join-evt-1'));

      expect(mockPush).not.toHaveBeenCalled();
    });

    it("ouvre l'évènement dans l'agenda web depuis l'icône", async () => {
      jest.spyOn(upcoming, 'useUpcomingMeetings').mockReturnValue({
        status: 'ready',
        events: [EVENT],
        now: NOW,
      });
      jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);

      await renderHome();
      await fireEvent.press(screen.getByTestId('upcoming-calendar-evt-1'));

      // L'URL COMPLÈTE, pas seulement « une URL » : l'hôte est déduit de celui
      // de meet et la route a été relevée dans le bundle de l'agenda web.
      expect(mockOpenBrowser).toHaveBeenCalledWith(
        'https://calendar-ng.twake-dev.maudet.cloud/events/evt-1',
      );
      // Consulter n'est pas rejoindre : les deux commandes sont voisines.
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("n'ouvre aucun onglet sans compte actif", async () => {
      // L'autre polarité de la garde. Sans elle, `account.instance` jetterait
      // sur un `null` — et l'accueil est justement l'écran qu'on peut voir une
      // fraction de seconde avant que le compte soit lu.
      jest.spyOn(upcoming, 'useUpcomingMeetings').mockReturnValue({
        status: 'ready',
        events: [EVENT],
        now: NOW,
      });
      jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(null);

      await renderHome();
      await fireEvent.press(screen.getByTestId('upcoming-calendar-evt-1'));

      expect(mockOpenBrowser).not.toHaveBeenCalled();
    });
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

      await renderHomeWithInsets();

      expect(screen.getByTestId('home-screen')).not.toHaveStyle({ paddingBottom: 34 });
    });
  });
});

// Le bloc « filterRooms » a été RETIRÉ, pas contourné : la fonction n'existe
// plus. La liste « Mes réunions » a quitté l'accueil le 2026-08-03, décision de
// Michel-Marie, et avec elle le tri, le filtre et leurs huit tests. Ce que la
// suppression coûte est consigné dans l'en-tête de `home.tsx`.

// Le bloc « compte actif et déconnexion » a été RETIRÉ, pas contourné.
//
// L'accueil ne porte plus ni bandeau de compte ni bouton de déconnexion : le
// Lot 2 les a déplacés vers Réglages, où le mockup met l'identité. Les trois
// tests ont suivi l'information — `reglages.spec.tsx` garde la déconnexion et
// l'affichage de l'instance, et `src/instance/label.spec.ts` garde
// `instanceLabel`, qui vivait ici.
