import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { Share } from 'react-native';

import * as rooms from 'src/api/rooms';
import * as pending from 'src/call/pendingAccess';
import * as accounts from 'src/auth/accounts';
import * as guest from 'src/auth/guest';
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
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
const clipboard = jest.requireMock('expo-clipboard') as { setStringAsync: jest.Mock };

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

  /**
   * LE défaut que ce lot corrige, et il rendait le mode invité inutilisable
   * sur tout salon non public.
   *
   * `request-entry` rend le jeton LiveKit AU MOMENT de l'admission. Cet écran
   * le jetait et naviguait ; `call.tsx` redemandait l'accès par
   * `fetchRoomAccess`. Or meet n'inclut le bloc `livekit` pour un anonyme que
   * sur un salon `public` — son `should_access_room` exige `is_public`, un
   * rôle, ou un compte authentifié sur un `trusted`. Le second appel ne
   * rendait donc jamais de jeton : la personne était admise, puis renvoyée à
   * la salle d'attente. Une boucle dont rien ne sortait.
   */
  it("MET DE CÔTÉ le jeton de l'admission avant de naviguer", async () => {
    const stash = jest.spyOn(pending, 'stashRoomAccess');
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: {
        participantId: 'p-1',
        status: 'accepted',
        livekitUrl: 'wss://livekit.linagora.com',
        token: 'lk',
      },
    });

    await render(<LobbyScreen />);
    await tick();

    expect(stash).toHaveBeenCalledWith(
      'reunion',
      expect.objectContaining({ livekitUrl: 'wss://livekit.linagora.com', token: 'lk' }),
    );
  });

  // La polarité fausse : une admission SANS jeton ne met rien de côté. Le
  // serveur ne devrait pas produire ce cas, mais `EntryOutcome` type les deux
  // champs en `string | null` — les ignorer laisserait passer un accès dont le
  // jeton serait `null`, que la séance prendrait pour un accès valide.
  it("ne met RIEN de côté quand l'admission ne porte pas de jeton", async () => {
    const stash = jest.spyOn(pending, 'stashRoomAccess');
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'accepted', livekitUrl: null, token: null },
    });

    await render(<LobbyScreen />);
    await tick();

    expect(stash).not.toHaveBeenCalled();
    // Mais on navigue quand même : `call.tsx` retombera sur `fetchRoomAccess`,
    // qui est le chemin d'avant et reste juste pour un salon public.
    expect(mockReplace).toHaveBeenCalledWith('/room/reunion/call');
  });

  // Le troisième `getVisitor()` de cet écran — celui de LA SCRUTATION — n'avait
  // aucun test sous la fixture invité. C'est le plus facile des trois à
  // manquer : le premier `requestEntry` (l'effet du dessus) réussit déjà pour
  // un invité et affiche « en attente », donc rien ne trahit un troisième site
  // resté sur `getActiveAccount()` — ni au montage, ni à l'oeil. Seul un tick
  // le prouve. Sans ce site migré, un invité resterait bloqué sur cet écran
  // pour toujours : jamais admis, jamais refusé, jamais prévenu d'une panne.
  //
  // `getActiveAccount` posée à `null`, et pas seulement `getVisitor` posé à
  // l'invité : un VRAI invité n'a PAS de compte. Sans ce `null` explicite, la
  // fixture par défaut du fichier (`ACCOUNT`, posée par le `beforeEach` de
  // tête) reste en place, et un site resté sur `getActiveAccount()` continue
  // de scruter — avec la mauvaise identité, mais sans jamais rendre ce test
  // rouge. Mesuré : sans cette ligne, muter ce site en revenant à
  // `getActiveAccount()` laisse ce test VERT.
  it('entre en séance dès que le salon délivre un jeton, pour un invité aussi', async () => {
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(null);
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
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

  // L'autre polarité de la fermeture de session invitée par la Revue de la
  // Tâche 8 : un COMPTE n'en a aucune à fermer, et `endGuestSession()` ne doit
  // JAMAIS être appelée pour lui — sans ce test, retirer la garde
  // `current?.kind === 'guest'` passerait toute la suite.
  it("n'appelle PAS endGuestSession pour un compte", async () => {
    const end = jest.spyOn(guest, 'endGuestSession');
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'waiting', livekitUrl: null, token: null },
    });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('lobby-leave-btn'));

    expect(end).not.toHaveBeenCalled();
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

    await waitFor(() => expect(screen.getByTestId('lobby-error')).toBeOnTheScreen());
  });

  it("ramène un invité à l'accueil public", async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'waiting', livekitUrl: null, token: null },
    });
    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('lobby-leave-btn'));

    expect(mockReplace).toHaveBeenCalledWith('/welcome');
  });

  // REVUE Tâche 8, Important 1 : sans `endGuestSession()`, MMKV garde le
  // serveur de CETTE réunion après qu'on l'a quittée depuis la salle
  // d'attente — le même mécanisme que `call.tsx` corrige déjà à sa propre
  // sortie, laissé ouvert sur ce chemin jumeau.
  it('referme la session invité en sortant', async () => {
    const end = jest.spyOn(guest, 'endGuestSession');
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'waiting', livekitUrl: null, token: null },
    });
    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('lobby-leave-btn'));

    expect(end).toHaveBeenCalled();
  });
});

describe('le lien de la réunion, depuis la salle d’attente', () => {
  // Fixture locale : celle du bloc d'admission vit dans un `describe`
  // imbriqué, donc hors de portée ici.
  const EN_ATTENTE = {
    participantId: 'p-1',
    status: 'waiting' as const,
    livekitUrl: null,
    token: null,
  };
  /**
   * Demandé par Michel-Marie le 2026-08-05, en voyant l'écran sur son Pixel :
   * les deux icônes de l'en-tête de séance manquaient ici. Quelqu'un qui
   * attend d'être admis peut vouloir transmettre le lien — c'est même le
   * moment où il en a le plus besoin, puisqu'il n'est pas encore entré.
   *
   * L'URL vient du VISITEUR, jamais d'une constante : un invité admis sur une
   * autre instance partagerait sinon un lien vers la nôtre, qui ne mène pas à
   * sa réunion. Même règle que `handleShare` de `call.tsx`.
   */
  it('copie le lien avec le serveur du visiteur', async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: true, value: EN_ATTENTE });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-copy')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('lobby-copy'));

    expect(clipboard.setStringAsync).toHaveBeenCalledWith('https://meet.acme.com/reunion');
  });

  // Deuxième INSTRUCTION du même gestionnaire. Le commentaire de `call.tsx` le
  // dit : une copie silencieuse est indiscernable d'un appui manqué, rien ne
  // bouge à l'écran et le presse-papiers n'est visible nulle part.
  it('annonce la copie', async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: true, value: EN_ATTENTE });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-copy')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('lobby-copy'));

    await waitFor(() => expect(screen.getByText('call.linkCopied')).toBeOnTheScreen());
  });

  it('partage le lien avec le serveur du visiteur', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'dismissedAction' });
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: true, value: EN_ATTENTE });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-share')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('lobby-share'));

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://meet.acme.com/reunion' }),
    );
  });

  // La polarité fausse : un COMPTE partage l'URL de SON instance, pas celle de
  // l'invité ni une constante.
  it("porte le serveur du COMPTE quand c'en est un", async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'dismissedAction' });
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: true, value: EN_ATTENTE });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-share')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('lobby-share'));

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://meet.linagora.com/reunion' }),
    );
  });

  it('affiche le salon que l’on attend', async () => {
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({ ok: true, value: EN_ATTENTE });

    await render(<LobbyScreen />);

    await waitFor(() => expect(screen.getByTestId('lobby-room')).toHaveTextContent('reunion'));
  });
});
