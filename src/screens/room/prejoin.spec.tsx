import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import { mediaDevices } from '@livekit/react-native-webrtc';

import * as rooms from 'src/api/rooms';
import type { ApiResult } from 'src/api/types';
import * as audioRoute from 'src/call/audioRoute';
import * as effectsModule from 'src/call/backgroundEffect';
import * as accounts from 'src/auth/accounts';
import * as guest from 'src/auth/guest';
import * as visitor from 'src/auth/visitor';
import * as pending from 'src/call/pendingAccess';
import { tokens } from 'src/ui/tokens';
import { PrejoinScreen } from './prejoin';

// Le pré-join héberge désormais la feuille des effets, donc un `Portal` : sans
// `PaperProvider` ancêtre, le rendu jette un `AggregateError` peu bavard. Même
// préambule que `home.spec.tsx`, qui a rencontré ceci au Lot 2.
function prejoin(): React.ReactElement {
  return (
    <PaperProvider theme={{ animation: { scale: 0 } }}>
      <PrejoinScreen />
    </PaperProvider>
  );
}

const getUserMedia = mediaDevices.getUserMedia as unknown as jest.Mock;

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

// `style` est une prop que `StatusBar` CONSOMME : elle n'atteint aucun élément
// hôte, et `toHaveProp` y serait vert dans les deux états — la borne écrite dans
// `AGENTS.md`. Le composant rend d'ailleurs `null` sur Android.
//
// On observe donc ce que l'écran DEMANDE, en doublant le module. Ce n'est pas
// assertir sur le comportement d'un double : l'unité sous test est « quel style
// cet écran réclame », et c'est exactement ce que ce relevé montre.
jest.mock('expo-status-bar', () => ({ StatusBar: jest.fn(() => null) }));

const statusBarStyles = (): unknown[] =>
  jest
    .mocked(jest.requireMock('expo-status-bar').StatusBar as jest.Mock)
    .mock.calls.map((call) => (call[0] as { style?: unknown }).style);

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
    // `calendar` a rejoint `InstanceFeatures` après l'écriture de cette
    // fixture : sans lui, `ACCOUNT` ne satisfait plus `Account` et un
    // `Visitor` construit dessus (Tâche 7) exige `as never`, ce que ce
    // fichier évite déjà pour `getActiveAccount`.
    features: { recording: true, subtitle: true, telephony: false, calendar: false },
  },
  email: 'ada@linagora.com',
  displayName: 'Ada',
};

// Le salon tel que le lit le pré-join au montage : son existence et son nom.
const ROOM = {
  ok: true,
  value: { id: 'r-1', slug: 'reunion', name: 'Réunion', accessLevel: 'public' },
} as const;

// Ce que rend `joinRoom` à qui peut entrer d'emblée. Le jeton vaut une chaîne
// qu'aucune autre fixture ne porte : c'est lui qu'on retrouve dans le magasin.
const ACCESS = {
  room: ROOM.value,
  livekitUrl: 'wss://livekit.linagora.com',
  token: 'jeton-join',
  isAdministrable: false,
} as const;

const ADMITTED = { ok: true, value: { kind: 'admitted', access: ACCESS } } as const;
const LOBBY = { ok: true, value: { kind: 'lobby' } } as const;

// Un invité DE NOM VIDE : l'état d'un premier passage, avant que rien n'ait
// été mémorisé. `readRememberedGuestName` rend '' dans ce cas, jamais
// `undefined` — voir `src/auth/guest.ts`.
const GUEST: visitor.Visitor = {
  kind: 'guest',
  serverUrl: 'https://meet.acme.com',
  displayName: '',
};

beforeEach(() => {
  jest.restoreAllMocks();
  mockReplace.mockReset();
  // `jest.restoreAllMocks()` ne touche PAS un double de module : sans cette
  // remise à zéro, `mock.calls` s'accumule sur tout le fichier et le `light`
  // d'un test précédent satisfait l'assertion du suivant. Mesuré : retirer
  // l'une des deux déclarations de `prejoin.tsx` ne rougissait alors RIEN.
  jest.mocked(jest.requireMock('expo-status-bar').StatusBar as jest.Mock).mockClear();
  journal.rememberVisit.mockClear();
  // Le double vit à côté de `node_modules` et n'est pas remis à zéro par
  // `restoreAllMocks` : sans cela, les appels s'accumulent d'un test à l'autre
  // et « n'a rien demandé » compte ceux du test précédent.
  getUserMedia.mockClear();
  preferences.readPreferences.mockReturnValue(DEFAULT_PREFS);
  jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
  // Doublée par défaut : sans cela, le premier appui sur « Rejoindre » d'un
  // test qui ne la pose pas partirait sur le vrai réseau.
  jest.spyOn(rooms, 'joinRoom').mockResolvedValue(ADMITTED);
  // Le VRAI magasin, vidé : un accès laissé par un test serait lu par le
  // suivant comme le sien.
  pending.clearPendingAccess();
});

describe('PrejoinScreen', () => {
  it('affiche le bouton de jonction une fois le salon lu', async () => {
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

    await render(prejoin());

    await waitFor(() => {
      expect(screen.getByTestId('join-call-btn')).toBeTruthy();
    });
  });

  // La lecture ne dit plus rien de l'admission : c'est « Rejoindre » qui
  // l'apprend. Un salon qui exige une attente se lit donc comme un autre, et le
  // pré-join reste là, avec ses choix de caméra, de micro et de nom.
  it('reste sur le pré-join quand le salon exige une attente', async () => {
    jest
      .spyOn(rooms, 'fetchRoom')
      .mockResolvedValue({ ok: true, value: { ...ROOM.value, accessLevel: 'restricted' } });

    await render(prejoin());

    await waitFor(() => expect(screen.getByTestId('join-call-btn')).toBeOnTheScreen());
    expect(mockReplace).not.toHaveBeenCalled();
    expect(rooms.joinRoom).not.toHaveBeenCalled();
  });

  it('dit pourquoi et laisse une sortie quand la lecture est refusée', async () => {
    // Mesuré sur appareil : une session expirée renvoyait `unauthorized`, que
    // rien ne traitait. L'écran affichait un sablier NU — sans message, sans
    // sortie, sans retour — et le `.catch(() => setAccess(null))` d'alors
    // posait `null` sur `null`, ce qui avait l'apparence d'un traitement
    // d'erreur sans en être un.
    //
    // C'est le premier écran qu'on traverse en ouvrant une réunion, et le même
    // cul-de-sac que `call.tsx` a déjà payé deux fois.
    jest
      .spyOn(rooms, 'fetchRoom')
      .mockResolvedValue({ ok: false, error: { kind: 'unauthorized' } });

    await render(prejoin());

    await waitFor(() => expect(screen.getByTestId('prejoin-error')).toBeTruthy());
    expect(screen.getByTestId('prejoin-error')).toHaveTextContent('error.unauthorized');
    expect(screen.queryByTestId('prejoin-loading')).toBeNull();
    await fireEvent.press(screen.getByTestId('prejoin-leave-btn'));
    expect(mockReplace).toHaveBeenCalledWith('/home');
  });

  it.each([
    ['gone', { kind: 'gone' } as const, 'error.roomDeleted'],
    ['missing-route', { kind: 'missing-route' } as const, 'error.serverTooOld'],
  ])('dit ce que signifie %s, jamais le repli réseau', async (_name, error, expected) => {
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue({ ok: false, error });

    await render(prejoin());

    await waitFor(() => expect(screen.getByTestId('prejoin-error')).toBeTruthy());
    expect(screen.getByTestId('prejoin-error')).toHaveTextContent(expected);
  });

  it("porte l'état des périphériques dans l'URL de l'appel", async () => {
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

    await render(prejoin());
    await waitFor(() => {
      expect(screen.getByTestId('camera-switch')).toBeTruthy();
    });

    // La commande est une PASTILLE PRESSABLE depuis le Lot 3, plus un
    // `Switch` : le mockup emploie le motif attendu sur mobile pour micro et
    // caméra. Le comportement n'a pas bougé — la presser coupe la caméra, et
    // l'URL de l'appel annonce camera=0 — seul le geste a changé, d'où
    // `press` au lieu de `valueChange`.
    //
    // La sémantique d'accessibilité est préservée : `accessibilityRole="switch"`
    // et `accessibilityState.checked`, ce qu'un lecteur d'écran annonce.
    await fireEvent.press(screen.getByTestId('camera-switch'));
    await fireEvent.press(screen.getByTestId('join-call-btn'));

    // `mic=0` parce que le défaut des Réglages est « micro coupé à l'entrée »,
    // posé explicitement par `DEFAULT_PREFS` ci-dessus. Ce test lisait
    // auparavant un `useState(false)` codé en dur, et c'est lui qui a signalé
    // le changement de comportement quand la préférence l'a remplacé.
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/room/reunion/call?camera=0&mic=0'),
    );
  });

  // « Rejoindre » enchaîne quatre instructions, et chacune a son assertion :
  // la mémorisation (voir « le journal » et « le pré-join en invité »), la
  // demande d'entrée, la mise de côté de l'accès, la navigation. Les deux
  // issues normales de `joinRoom` mènent chacune ailleurs.
  describe('« Rejoindre »', () => {
    async function ready(): Promise<void> {
      jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);
      await render(prejoin());
      await waitFor(() => expect(screen.getByTestId('join-call-btn')).toBeOnTheScreen());
    }

    // Un invité, et un nom SAISI qui diffère du nom mémorisé : passer
    // `visitorName(visitor)` au lieu de ce que montre le champ rendrait
    // « Camille », et ce test le verrait.
    it("demande l'entrée au serveur, avec le visiteur et le nom saisi", async () => {
      const remembered = { ...GUEST, displayName: 'Camille' };
      jest.spyOn(visitor, 'getVisitor').mockReturnValue(remembered);
      await ready();
      await fireEvent.changeText(screen.getByTestId('prejoin-name-input'), 'Dominique');

      await fireEvent.press(screen.getByTestId('join-call-btn'));

      await waitFor(() =>
        expect(rooms.joinRoom).toHaveBeenCalledWith(remembered, 'reunion', 'Dominique'),
      );
    });

    // Le magasin RÉEL est relu : c'est le seul chemin par lequel la séance
    // obtient son jeton, puisqu'elle ne le demande jamais elle-même.
    it("met l'accès de côté pour la séance quand le serveur admet", async () => {
      await ready();

      await fireEvent.press(screen.getByTestId('join-call-btn'));

      await waitFor(() => expect(mockReplace).toHaveBeenCalled());
      expect(pending.takeRoomAccess('reunion')).toEqual(ACCESS);
    });

    it('mène à la séance quand le serveur admet', async () => {
      await ready();

      await fireEvent.press(screen.getByTestId('join-call-btn'));

      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith('/room/reunion/call?camera=1&mic=0'),
      );
    });

    // Les choix sont pris À L'INVERSE des défauts : une adresse qui les
    // recopierait en dur passerait sinon.
    it("mène à la salle d'attente avec les mêmes choix, sans rien mettre de côté", async () => {
      jest.spyOn(rooms, 'joinRoom').mockResolvedValue(LOBBY);
      preferences.readPreferences.mockReturnValue({ ...DEFAULT_PREFS, micOffOnJoin: false });
      await ready();
      await fireEvent.press(screen.getByTestId('camera-switch'));

      await fireEvent.press(screen.getByTestId('join-call-btn'));

      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith('/room/reunion/lobby?camera=0&mic=1'),
      );
      expect(pending.takeRoomAccess('reunion')).toBe(null);
    });

    // Le second appui arrive pendant que la demande est EN VOL : seule la garde
    // peut empêcher la seconde. Même forme que le test de la main levée de
    // `call.spec.tsx`.
    it("ne lance qu'une requête sur un double appui", async () => {
      let settle: (value: ApiResult<rooms.JoinOutcome>) => void = () => undefined;
      jest.spyOn(rooms, 'joinRoom').mockReturnValue(
        new Promise<ApiResult<rooms.JoinOutcome>>((resolve) => {
          settle = resolve;
        }),
      );
      await ready();

      await fireEvent.press(screen.getByTestId('join-call-btn'));
      await fireEvent.press(screen.getByTestId('join-call-btn'));

      expect(rooms.joinRoom).toHaveBeenCalledTimes(1);
      await act(async () => {
        settle(LOBBY);
      });
    });

    // Le message s'affiche SOUS le bouton, et le pré-join reste là : l'écran
    // d'erreur n'a qu'une sortie, qui pour un invité referme la session, si
    // bien qu'un simple trou de réseau lui aurait fait tout recommencer.
    it.each([
      ['un 404 JSON', { kind: 'not-found' } as const, 'error.notFound'],
      ['un 410', { kind: 'gone' } as const, 'error.roomDeleted'],
      ['la route absente', { kind: 'missing-route' } as const, 'error.serverTooOld'],
      ['le réseau', { kind: 'network' } as const, 'error.network'],
      ['un 5xx', { kind: 'server', status: 503 } as const, 'error.serverError'],
    ])('dit sur le pré-join ce que signifie %s', async (_label, error, expected) => {
      jest.spyOn(rooms, 'joinRoom').mockResolvedValue({ ok: false, error });
      await ready();

      await fireEvent.press(screen.getByTestId('join-call-btn'));

      await waitFor(() =>
        expect(screen.getByTestId('prejoin-join-error')).toHaveTextContent(expected),
      );
      expect(screen.getByTestId('join-call-btn')).toBeOnTheScreen();
      expect(screen.queryByTestId('prejoin-error')).toBe(null);
      expect(mockReplace).not.toHaveBeenCalled();
    });

    // L'autre forme d'échec : une promesse rejetée plutôt qu'une issue. Sans
    // ce rattrapage, l'appui resterait sans effet visible — un bouton mort.
    it('dit que le réseau a lâché quand la demande rejette', async () => {
      jest.spyOn(rooms, 'joinRoom').mockRejectedValue(new Error('hors ligne'));
      await ready();

      await fireEvent.press(screen.getByTestId('join-call-btn'));

      await waitFor(() =>
        expect(screen.getByTestId('prejoin-join-error')).toHaveTextContent('error.network'),
      );
    });

    it("pose une couleur explicite sur le message d'échec", async () => {
      jest.spyOn(rooms, 'joinRoom').mockResolvedValue({ ok: false, error: { kind: 'network' } });
      await ready();

      await fireEvent.press(screen.getByTestId('join-call-btn'));

      await waitFor(() =>
        expect(screen.getByTestId('prejoin-join-error')).toHaveStyle({
          color: tokens.color.textDark,
        }),
      );
    });

    it("redemande l'entrée au second appui qui suit un échec", async () => {
      const join = jest
        .spyOn(rooms, 'joinRoom')
        .mockResolvedValueOnce({ ok: false, error: { kind: 'network' } });
      await ready();
      await fireEvent.press(screen.getByTestId('join-call-btn'));
      await waitFor(() => expect(screen.getByTestId('prejoin-join-error')).toBeOnTheScreen());

      await fireEvent.press(screen.getByTestId('join-call-btn'));

      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith('/room/reunion/call?camera=1&mic=0'),
      );
      expect(join).toHaveBeenCalledTimes(2);
    });

    it("efface l'échec dès le nouvel appui", async () => {
      jest
        .spyOn(rooms, 'joinRoom')
        .mockResolvedValueOnce({ ok: false, error: { kind: 'network' } })
        .mockReturnValueOnce(new Promise<ApiResult<rooms.JoinOutcome>>(() => undefined));
      await ready();
      await fireEvent.press(screen.getByTestId('join-call-btn'));
      await waitFor(() => expect(screen.getByTestId('prejoin-join-error')).toBeOnTheScreen());

      await fireEvent.press(screen.getByTestId('join-call-btn'));

      expect(screen.queryByTestId('prejoin-join-error')).toBe(null);
    });

    // La personne repart pendant que la demande est EN VOL. La réponse, quand
    // elle arrive, ne doit plus la faire entrer nulle part : sans garde, elle
    // serait remplacée par la séance depuis l'écran où elle est retournée.
    it("ne fait plus rien d'une admission arrivée après la sortie", async () => {
      let settle: (value: ApiResult<rooms.JoinOutcome>) => void = () => undefined;
      jest.spyOn(rooms, 'joinRoom').mockReturnValue(
        new Promise<ApiResult<rooms.JoinOutcome>>((resolve) => {
          settle = resolve;
        }),
      );
      await ready();
      await fireEvent.press(screen.getByTestId('join-call-btn'));

      await fireEvent.press(screen.getByTestId('prejoin-back-btn'));
      await act(async () => {
        settle(ADMITTED);
      });

      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/home');
      expect(pending.takeRoomAccess('reunion')).toBe(null);
    });

    // La même garde quand l'écran est démonté sans passer par ses boutons,
    // quelle qu'en soit la cause.
    it("ne fait plus rien d'une admission arrivée après le démontage", async () => {
      let settle: (value: ApiResult<rooms.JoinOutcome>) => void = () => undefined;
      jest.spyOn(rooms, 'joinRoom').mockReturnValue(
        new Promise<ApiResult<rooms.JoinOutcome>>((resolve) => {
          settle = resolve;
        }),
      );
      jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);
      const view = await render(prejoin());
      await waitFor(() => expect(screen.getByTestId('join-call-btn')).toBeOnTheScreen());
      await fireEvent.press(screen.getByTestId('join-call-btn'));

      await view.unmount();
      await act(async () => {
        settle(ADMITTED);
      });

      expect(mockReplace).not.toHaveBeenCalled();
      expect(pending.takeRoomAccess('reunion')).toBe(null);
    });

    // En développement, le mode strict de React démonte puis remonte chaque
    // effet au premier rendu. La garde de sortie doit y survivre : sans sa
    // remise à zéro au montage, ce démontage simulé la laisserait levée, et
    // « Rejoindre » ne mènerait plus nulle part.
    it('mène encore à la séance sous le mode strict de React', async () => {
      jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);
      await render(<React.StrictMode>{prejoin()}</React.StrictMode>);
      await waitFor(() => expect(screen.getByTestId('join-call-btn')).toBeOnTheScreen());

      await fireEvent.press(screen.getByTestId('join-call-btn'));

      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith('/room/reunion/call?camera=1&mic=0'),
      );
    });
  });

  describe('l’aperçu caméra', () => {
    async function ready(): Promise<void> {
      jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);
      await render(prejoin());
      await waitFor(() => {
        expect(screen.getByTestId('join-call-btn')).toBeTruthy();
      });
    }

    // Les deux états de la conditionnelle, chacun avec sa fixture.
    it('demande la caméra quand elle est active', async () => {
      preferences.readPreferences.mockReturnValue({ ...DEFAULT_PREFS, cameraOffOnJoin: false });
      await ready();

      await waitFor(() => {
        expect(getUserMedia).toHaveBeenCalled();
      });
    });

    it('ne demande rien quand la caméra part coupée', async () => {
      preferences.readPreferences.mockReturnValue({ ...DEFAULT_PREFS, cameraOffOnJoin: true });
      await ready();

      expect(getUserMedia).not.toHaveBeenCalled();
    });

    // Trois raisons de n'avoir pas d'image, une seule chose à montrer : qui
    // l'on est. Un rectangle noir se lirait comme une panne.
    it('montre l’avatar tant qu’il n’y a pas d’image', async () => {
      preferences.readPreferences.mockReturnValue({ ...DEFAULT_PREFS, cameraOffOnJoin: true });
      await ready();

      expect(screen.getByTestId('prejoin-avatar')).toBeTruthy();
    });
  });

  describe('les deux commandes', () => {
    async function ready(): Promise<void> {
      jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);
      await render(prejoin());
      await waitFor(() => {
        expect(screen.getByTestId('join-call-btn')).toBeTruthy();
      });
    }

    // La coupure doit se VOIR : sans le fond rouge, rien ne distingue un micro
    // coupé d'un micro actif, le glyphe étant de la même couleur.
    it('marque le micro coupé par le fond de danger', async () => {
      preferences.readPreferences.mockReturnValue({ ...DEFAULT_PREFS, micOffOnJoin: true });
      await ready();

      expect(screen.getByTestId('mic-switch')).toHaveStyle({
        backgroundColor: tokens.color.danger,
      });
    });

    it('ne marque pas un micro actif', async () => {
      preferences.readPreferences.mockReturnValue({ ...DEFAULT_PREFS, micOffOnJoin: false });
      await ready();

      expect(screen.getByTestId('mic-switch')).not.toHaveStyle({
        backgroundColor: tokens.color.danger,
      });
    });

    it('bascule le micro à l’appui', async () => {
      preferences.readPreferences.mockReturnValue({ ...DEFAULT_PREFS, micOffOnJoin: true });
      await ready();
      await fireEvent.press(screen.getByTestId('mic-switch'));

      expect(screen.getByTestId('mic-switch')).not.toHaveStyle({
        backgroundColor: tokens.color.danger,
      });
    });

    it('bascule la caméra à l’appui', async () => {
      preferences.readPreferences.mockReturnValue({ ...DEFAULT_PREFS, cameraOffOnJoin: false });
      await ready();
      await fireEvent.press(screen.getByTestId('camera-switch'));

      expect(screen.getByTestId('camera-switch')).toHaveStyle({
        backgroundColor: tokens.color.danger,
      });
    });
  });

  // L'écran est SOMBRE et le thème est CLAIR : sans couleur explicite, Paper
  // rend ces textes en quasi-noir sur du quasi-noir.
  describe('les couleurs explicites', () => {
    async function ready(): Promise<void> {
      jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);
      await render(prejoin());
      await waitFor(() => {
        expect(screen.getByTestId('join-call-btn')).toBeTruthy();
      });
    }

    it('pose la couleur du nom de la réunion', async () => {
      await ready();
      expect(screen.getByTestId('prejoin-room-name')).toHaveStyle({
        color: tokens.color.textDark,
      });
    });

    it('pose la couleur du nom de la personne', async () => {
      await ready();
      expect(screen.getByTestId('prejoin-name')).toHaveStyle({ color: tokens.color.textDark });
    });

    // Le libellé n'existe QUE sans image : caméra active, c'est `RTCView` qui
    // occupe la place.
    it('pose la couleur du libellé de l’aperçu', async () => {
      preferences.readPreferences.mockReturnValue({ ...DEFAULT_PREFS, cameraOffOnJoin: true });
      await ready();
      expect(screen.getByTestId('prejoin-camera-label')).toHaveStyle({
        color: tokens.color.muted,
      });
    });

    // PAS `ready()` : un invité de nom vide ne rend JAMAIS `join-call-btn`,
    // que ce garde-fou attendrait indéfiniment. `prejoin-name-input` suffit à
    // dire l'écran monté.
    it('pose la couleur explicite du champ de nom de l’invité', async () => {
      jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
      jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);
      await render(prejoin());
      await waitFor(() => expect(screen.getByTestId('prejoin-name-input')).toBeOnTheScreen());

      expect(screen.getByTestId('prejoin-name-input')).toHaveStyle({
        color: tokens.color.textDark,
      });
    });

    // Le texte indicatif ne suit PAS `color` : RN le prend sur
    // `placeholderTextColor`, une prop distincte du style — précédent
    // `searchField.spec.tsx`. Sans elle, il retomberait sur un gris système
    // hors de notre contrôle.
    it('pose la couleur explicite du texte indicatif de l’invité', async () => {
      jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
      jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);
      await render(prejoin());
      await waitFor(() => expect(screen.getByTestId('prejoin-name-input')).toBeOnTheScreen());

      expect(screen.getByTestId('prejoin-name-input')).toHaveProp(
        'placeholderTextColor',
        tokens.color.muted,
      );
    });
  });

  describe('les Réglages gouvernent l’état de départ', () => {
    // Chaque préférence dans ses DEUX états : sans le second cas, un
    // `useState(true)` codé en dur passerait.
    it.each([
      [true, 0],
      [false, 1],
    ])('part de micOffOnJoin=%s et annonce mic=%i', async (micOffOnJoin, expected) => {
      preferences.readPreferences.mockReturnValue({ ...DEFAULT_PREFS, micOffOnJoin });
      jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

      await render(prejoin());
      await waitFor(() => {
        expect(screen.getByTestId('join-call-btn')).toBeTruthy();
      });
      await fireEvent.press(screen.getByTestId('join-call-btn'));

      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith(
          `/room/reunion/call?camera=1&mic=${String(expected)}`,
        ),
      );
    });

    it.each([
      [true, 0],
      [false, 1],
    ])('part de cameraOffOnJoin=%s et annonce camera=%i', async (cameraOffOnJoin, expected) => {
      preferences.readPreferences.mockReturnValue({ ...DEFAULT_PREFS, cameraOffOnJoin });
      jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

      await render(prejoin());
      await waitFor(() => {
        expect(screen.getByTestId('join-call-btn')).toBeTruthy();
      });
      await fireEvent.press(screen.getByTestId('join-call-btn'));

      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith(
          `/room/reunion/call?camera=${String(expected)}&mic=0`,
        ),
      );
    });
  });

  describe('le journal de l’Historique', () => {
    // La première des instructions de `handleJoin` ; les suivantes sont
    // gardées par le bloc « Rejoindre », plus haut.
    it('enregistre la visite au moment de rejoindre', async () => {
      jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

      await render(prejoin());
      await waitFor(() => {
        expect(screen.getByTestId('join-call-btn')).toBeTruthy();
      });
      await fireEvent.press(screen.getByTestId('join-call-btn'));

      expect(journal.rememberVisit).toHaveBeenCalledWith(
        'reunion',
        ROOM.value.name,
        expect.any(Number),
      );
    });

    it('n’enregistre rien tant qu’on n’a pas rejoint', async () => {
      jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

      await render(prejoin());
      await waitFor(() => {
        expect(screen.getByTestId('join-call-btn')).toBeTruthy();
      });

      expect(journal.rememberVisit).not.toHaveBeenCalled();
    });
  });
});

describe("PrejoinScreen — barre d'état", () => {
  it('réclame des icônes claires sur le fond sombre de la pré-séance', async () => {
    // MESURÉ sur appareil avant ce correctif : le thème Android généré est
    // `Theme.AppCompat.DayNight.NoActionBar` avec une barre transparente et
    // AUCUN `windowLightStatusBar`. `dumpsys window` lisait
    // `mLastAppearance=LIGHT_NAVIGATION_BARS`, sans `LIGHT_STATUS_BARS` : icônes
    // blanches. Invisibles sur les écrans clairs, correctes ici.
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

    // `prejoin()` et non `<PrejoinScreen />` nu : ce test vient de `main`, écrit
    // AVANT que le pré-join n'héberge la feuille des effets, donc un `Portal`.
    // Sans `PaperProvider` ancêtre le rendu jette un `AggregateError` peu
    // bavard — un conflit sémantique que git ne pouvait pas voir, les deux
    // côtés ayant modifié des lignes différentes.
    await render(prejoin());
    await waitFor(() => expect(screen.getByTestId('prejoin-root')).toBeTruthy());

    expect(statusBarStyles()).toContain('light');
  });

  it('réclame aussi des icônes claires quand la lecture est refusée', async () => {
    // La branche d'échec peint `errorRoot`, sombre elle aussi. Elle a sa propre
    // déclaration : l'oublier laisserait des icônes sombres sur du noir, et
    // aucun test de la branche nominale ne l'aurait vu.
    jest
      .spyOn(rooms, 'fetchRoom')
      .mockResolvedValue({ ok: false, error: { kind: 'unauthorized' } });

    await render(<PrejoinScreen />);
    await waitFor(() => expect(screen.getByTestId('prejoin-error')).toBeTruthy());

    expect(statusBarStyles()).toContain('light');
  });
});

// Le propriétaire a branché son casque Bluetooth SUR CET ÉCRAN et n'avait aucun
// moyen d'y choisir la destination du son. Le réglage n'existait qu'une fois la
// séance ouverte — trop tard pour la seule personne qui voulait le vérifier
// avant d'entrer.
describe('PrejoinScreen — sortie audio', () => {
  it('offre le réglage avant même d’être entré', async () => {
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

    await render(prejoin());

    await waitFor(() => expect(screen.getByTestId('prejoin-audio-btn')).toBeTruthy());
  });

  it('ouvre la feuille sur un appui, là où il y a une feuille', async () => {
    // `audioRouteControl` est espionné parce que le préréglage Jest fixe
    // `Platform.OS` à `'ios'`, où le mode vaut `'system'` : il n'y a alors
    // AUCUNE feuille à ouvrir, seulement le sélecteur de la plateforme. Sans
    // cet espion, le test attendrait une surface qui n'existe pas sur la
    // plateforme qu'il simule — et son échec se lirait comme un bouton mal
    // câblé.
    jest.spyOn(audioRoute, 'audioRouteControl').mockReturnValue('devices');
    jest.spyOn(audioRoute, 'listAudioDevices').mockResolvedValue([]);
    jest.spyOn(audioRoute, 'readCurrentAudioDeviceId').mockResolvedValue(null);
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

    await render(prejoin());
    await waitFor(() => expect(screen.getByTestId('prejoin-audio-btn')).toBeTruthy());
    // « Rendu ou pas rendu » plutôt qu'une prop : une prop consommée par un
    // composant n'atteint jamais l'élément hôte, et l'assertion serait verte
    // dans les deux états.
    expect(screen.queryByTestId('audio-output-note')).toBe(null);

    await fireEvent.press(screen.getByTestId('prejoin-audio-btn'));

    await waitFor(() => expect(screen.getByTestId('audio-output-note')).toBeTruthy());
  });

  // L'autre chemin, celui d'iOS : aucune feuille, le sélecteur de la
  // plateforme. Sans ce test, un composant qui n'ouvrirait JAMAIS rien
  // passerait celui du dessus dès qu'on retire l'espion.
  it('ouvre le sélecteur de la plateforme là où il n’y a pas de feuille', async () => {
    jest.spyOn(audioRoute, 'audioRouteControl').mockReturnValue('system');
    const picker = jest.spyOn(audioRoute, 'openSystemRoutePicker').mockResolvedValue();
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

    await render(prejoin());
    await waitFor(() => expect(screen.getByTestId('prejoin-audio-btn')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('prejoin-audio-btn'));

    expect(picker).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('audio-output-note')).toBe(null);
  });
});

// Cette garde a SAUTÉ en regroupant les boutons par sens, et rien ne l'a dit :
// aucun test ne la couvrait. Sur iOS, le bouton se serait affiché et n'aurait
// rien fait — le pendant Vision n'existe pas.
describe("PrejoinScreen — bouton d'effets", () => {
  it('ne le rend pas là où le module natif manque', async () => {
    jest.spyOn(effectsModule, 'areEffectsSupported').mockReturnValue(false);
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

    await render(prejoin());

    await waitFor(() => expect(screen.getByTestId('camera-switch')).toBeTruthy());
    expect(screen.queryByTestId('prejoin-effects-btn')).toBe(null);
  });

  it('le rend là où il existe', async () => {
    // L'autre borne : sans elle, un composant qui ne rendrait JAMAIS le bouton
    // passerait le test ci-dessus.
    jest.spyOn(effectsModule, 'areEffectsSupported').mockReturnValue(true);
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

    await render(prejoin());

    await waitFor(() => expect(screen.getByTestId('prejoin-effects-btn')).toBeTruthy());
  });
});

// Tâche 7 : `getVisitor()` remplace `getActiveAccount()` aux deux points
// d'entrée de l'écran (montage, effet) — c'est LUI qui distingue les deux
// familles de tests ci-dessous, pas un double de `accounts`.
//
// `prejoin()`, jamais `<PrejoinScreen />` nu : l'accès accordé monte
// `AudioOutputSheet` et `EffectsSheet`, deux feuilles sous `Portal`, qui
// jettent un `AggregateError` sans `PaperProvider` ancêtre — même raison que
// le commentaire en tête de fichier.
describe('le pré-join en invité', () => {
  it('rend un champ de nom à la place du texte figé', async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

    await render(prejoin());

    await waitFor(() => expect(screen.getByTestId('prejoin-name-input')).toBeOnTheScreen());
  });

  // La lecture du salon partait autrefois avec un wrapper
  // `{ kind: 'account', account }` codé en dur, temporaire et délibéré. La
  // lecture étant doublée, rien d'autre ne prouverait qu'elle reçoit VRAIMENT
  // le visiteur invité et non ce wrapper.
  it('interroge le serveur avec le visiteur invité, pas un compte', async () => {
    const read = jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);

    await render(prejoin());

    await waitFor(() => expect(read).toHaveBeenCalledWith(GUEST, 'reunion'));
  });

  it('borne le nom à 50 caractères, comme le client web', async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

    await render(prejoin());

    await waitFor(() =>
      expect(screen.getByTestId('prejoin-name-input')).toHaveProp('maxLength', 50),
    );
  });

  // Masquer, jamais griser : AGENTS.md interdit `disabled` sur cet écran sombre.
  it('ne rend PAS « Rejoindre » tant que le nom est vide', async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

    await render(prejoin());
    await waitFor(() => expect(screen.getByTestId('prejoin-name-input')).toBeOnTheScreen());

    expect(screen.queryByTestId('join-call-btn')).toBe(null);
  });

  it('rend « Rejoindre » dès que le nom est saisi', async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

    await render(prejoin());
    await waitFor(() => expect(screen.getByTestId('prejoin-name-input')).toBeOnTheScreen());
    await fireEvent.changeText(screen.getByTestId('prejoin-name-input'), 'Camille');

    expect(screen.getByTestId('join-call-btn')).toBeOnTheScreen();
  });

  it('mémorise le nom au moment de rejoindre', async () => {
    const remember = jest.spyOn(guest, 'rememberGuestName');
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

    await render(prejoin());
    await waitFor(() => expect(screen.getByTestId('prejoin-name-input')).toBeOnTheScreen());
    await fireEvent.changeText(screen.getByTestId('prejoin-name-input'), 'Camille');
    await fireEvent.press(screen.getByTestId('join-call-btn'));

    expect(remember).toHaveBeenCalledWith('Camille');
  });

  // Le bouton se rend sur `name.trim()`, mais c'est `name` BRUT qui partait
  // dans le magasin — d'où la salle d'attente le relit pour l'envoyer avec sa
  // demande d'entrée, et le pré-join suivant pour se pré-remplir.
  it('détoure le nom avant de le mémoriser', async () => {
    const remember = jest.spyOn(guest, 'rememberGuestName');
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

    await render(prejoin());
    await waitFor(() => expect(screen.getByTestId('prejoin-name-input')).toBeOnTheScreen());
    await fireEvent.changeText(screen.getByTestId('prejoin-name-input'), '  Camille  ');
    await fireEvent.press(screen.getByTestId('join-call-btn'));

    expect(remember).toHaveBeenCalledWith('Camille');
  });

  // La salle d'attente relit ce nom pour l'envoyer avec sa demande d'entrée :
  // il doit donc être mémorisé AUSSI quand le serveur fait attendre, pas
  // seulement quand il admet.
  it('mémorise le nom aussi quand le serveur fait attendre', async () => {
    const remember = jest.spyOn(guest, 'rememberGuestName');
    jest.spyOn(rooms, 'joinRoom').mockResolvedValue(LOBBY);
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

    await render(prejoin());
    await waitFor(() => expect(screen.getByTestId('prejoin-name-input')).toBeOnTheScreen());
    await fireEvent.changeText(screen.getByTestId('prejoin-name-input'), 'Camille');
    await fireEvent.press(screen.getByTestId('join-call-btn'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(remember).toHaveBeenCalledWith('Camille');
  });

  it("n'écrit RIEN dans l'historique pour un invité", async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

    await render(prejoin());
    await waitFor(() => expect(screen.getByTestId('prejoin-name-input')).toBeOnTheScreen());
    await fireEvent.changeText(screen.getByTestId('prejoin-name-input'), 'Camille');
    await fireEvent.press(screen.getByTestId('join-call-btn'));

    expect(journal.rememberVisit).not.toHaveBeenCalled();
  });

  it('pré-remplit le champ du nom mémorisé', async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue({ ...GUEST, displayName: 'Camille' });
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

    await render(prejoin());

    await waitFor(() =>
      expect(screen.getByTestId('prejoin-name-input')).toHaveProp('value', 'Camille'),
    );
  });
});

describe('le pré-join avec un compte', () => {
  it('garde le nom en texte figé, sans champ', async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue({ kind: 'account', account: ACCOUNT });
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

    await render(prejoin());

    await waitFor(() => expect(screen.getByTestId('prejoin-name')).toBeOnTheScreen());
    expect(screen.queryByTestId('prejoin-name-input')).toBe(null);
  });

  // L'autre borne du test symétrique de « le pré-join en invité » : sans
  // elle, un écran qui enverrait TOUJOURS un visiteur invité — ou l'inverse —
  // passerait les deux à la fois, la lecture étant doublée dans les deux cas.
  it('interroge le serveur avec le compte, pas un visiteur invité', async () => {
    const read = jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);
    jest.spyOn(visitor, 'getVisitor').mockReturnValue({ kind: 'account', account: ACCOUNT });

    await render(prejoin());

    await waitFor(() =>
      expect(read).toHaveBeenCalledWith({ kind: 'account', account: ACCOUNT }, 'reunion'),
    );
  });

  // LA régression que la garde de nom vide avait introduite sur le chemin
  // authentifié. Elle a été écrite pour un invité — lui seul dispose du champ
  // qui le sortirait de là —, mais elle s'appliquait à TOUT visiteur.
  //
  // Un compte peut porter un nom vide : `users.ts:22` calcule
  // `full_name ?? short_name ?? email`, et `??` ne rattrape pas `""` — or un
  // utilisateur Django sans prénom ni nom a précisément un `full_name` vide.
  // Un tel compte obtenait un pré-join SANS bouton « Rejoindre » et SANS champ
  // pour se nommer : un cul-de-sac sur l'unique route qui mène à une réunion.
  it('rend « Rejoindre » à un COMPTE dont le nom est vide', async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue({
      kind: 'account',
      account: { ...ACCOUNT, displayName: '' },
    });
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

    await render(prejoin());

    await waitFor(() => expect(screen.getByTestId('join-call-btn')).toBeOnTheScreen());
  });

  it("écrit BIEN dans l'historique pour un compte", async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue({ kind: 'account', account: ACCOUNT });
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

    await render(prejoin());
    await waitFor(() => expect(screen.getByTestId('join-call-btn')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('join-call-btn'));

    expect(journal.rememberVisit).toHaveBeenCalled();
  });

  // La borne manquante du couple géré par `handleJoin` : un compte NE DOIT
  // PAS écrire dans le magasin de noms invité. `getVisitor()` peut rendre un
  // compte alors qu'une session invité traîne encore (voir son commentaire de
  // tête) — un régression ici écraserait le nom mémorisé d'un AUTRE invité sur
  // le même appareil, la même classe de fuite que le journal ci-dessus.
  it("n'appelle PAS rememberGuestName pour un compte", async () => {
    const remember = jest.spyOn(guest, 'rememberGuestName');
    jest.spyOn(visitor, 'getVisitor').mockReturnValue({ kind: 'account', account: ACCOUNT });
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

    await render(prejoin());
    await waitFor(() => expect(screen.getByTestId('join-call-btn')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('join-call-btn'));

    expect(remember).not.toHaveBeenCalled();
  });
});

// Les DEUX sorties de cet écran, chacune pour les DEUX familles de visiteurs.
//
// C'est le trou le plus cher du lot : le pré-join est le PREMIER écran qu'un
// invité atteint, et le seul qu'il atteigne quand le code est faux. Les deux
// sorties poussaient `/home` sans condition — l'accueil AUTHENTIFIÉ, avec un
// nom vide, une carte « Nouvelle réunion » qui rendra 401, un Historique qui
// n'est pas le sien et un onglet Réglages qui propose de se déconnecter —
// pendant que la session invité restait ouverte dans MMKV. `call.tsx` et
// `lobby.tsx` branchaient déjà, le pré-join non.
// LE sablier éternel, sur l'écran même que ce lot dit en débarrasser.
//
// `lobby.tsx` et `call.tsx` posent tous deux `error.unauthorized` comme état
// de DÉPART quand `getVisitor()` rend `null` ; le pré-join ne le faisait pas.
// Son effet sortait alors sans rien poser, son état restait nul, et le rendu
// tombait sur l'`ActivityIndicator` — sans message, sans sortie, sans retour.
describe('le pré-join sans aucun visiteur', () => {
  it('dit pourquoi, au lieu de tourner à jamais', async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(null);
    const read = jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);

    await render(prejoin());

    expect(screen.getByTestId('prejoin-error')).toHaveTextContent('error.unauthorized');
    expect(screen.queryByTestId('prejoin-loading')).toBe(null);
    // Et rien n'est parti sur le réseau : il n'y avait personne à annoncer.
    expect(read).not.toHaveBeenCalled();
  });

  it('laisse une sortie, comme les autres états terminaux', async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(null);
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);
    await render(prejoin());

    await fireEvent.press(screen.getByTestId('prejoin-leave-btn'));

    expect(mockReplace).toHaveBeenCalledWith('/home');
  });
});

describe('les sorties du pré-join', () => {
  // `endGuestSession` est espionné SANS bouchon : le vrai écrit dans le faux
  // MMKV du dépôt, donc l'appel est sûr. Motif hérité de `lobby.spec.tsx`.
  async function reachError(): Promise<void> {
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue({ ok: false, error: { kind: 'not-found' } });
    await render(prejoin());
    await waitFor(() => expect(screen.getByTestId('prejoin-error')).toBeOnTheScreen());
  }

  async function reachScreen(): Promise<void> {
    jest.spyOn(rooms, 'fetchRoom').mockResolvedValue(ROOM);
    await render(prejoin());
    await waitFor(() => expect(screen.getByTestId('prejoin-back-btn')).toBeOnTheScreen());
  }

  describe("le bouton de l'écran d'erreur — le code mal tapé", () => {
    it("ramène un INVITÉ à l'accueil public", async () => {
      jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
      await reachError();

      await fireEvent.press(screen.getByTestId('prejoin-leave-btn'));

      expect(mockReplace).toHaveBeenCalledWith('/welcome');
    });

    it("referme la session invité avant de s'en aller", async () => {
      const end = jest.spyOn(guest, 'endGuestSession');
      jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
      await reachError();

      await fireEvent.press(screen.getByTestId('prejoin-leave-btn'));

      expect(end).toHaveBeenCalled();
    });

    it("ramène un COMPTE à l'accueil, sans toucher à aucune session", async () => {
      const end = jest.spyOn(guest, 'endGuestSession');
      jest.spyOn(visitor, 'getVisitor').mockReturnValue({ kind: 'account', account: ACCOUNT });
      await reachError();

      await fireEvent.press(screen.getByTestId('prejoin-leave-btn'));

      expect(mockReplace).toHaveBeenCalledWith('/home');
      expect(end).not.toHaveBeenCalled();
    });
  });

  // Le chevron de l'en-tête. Ce n'est pas le même site d'appel que le bouton
  // ci-dessus, et rien ne les tient d'accord : chacun veut ses deux polarités.
  describe("le chevron de l'en-tête", () => {
    it("ramène un INVITÉ à l'accueil public, et referme sa session", async () => {
      const end = jest.spyOn(guest, 'endGuestSession');
      jest.spyOn(visitor, 'getVisitor').mockReturnValue({ ...GUEST, displayName: 'Camille' });
      await reachScreen();

      await fireEvent.press(screen.getByTestId('prejoin-back-btn'));

      expect(mockReplace).toHaveBeenCalledWith('/welcome');
      expect(end).toHaveBeenCalled();
    });

    it("ramène un COMPTE à l'accueil, sans toucher à aucune session", async () => {
      const end = jest.spyOn(guest, 'endGuestSession');
      jest.spyOn(visitor, 'getVisitor').mockReturnValue({ kind: 'account', account: ACCOUNT });
      await reachScreen();

      await fireEvent.press(screen.getByTestId('prejoin-back-btn'));

      expect(mockReplace).toHaveBeenCalledWith('/home');
      expect(end).not.toHaveBeenCalled();
    });
  });
});
