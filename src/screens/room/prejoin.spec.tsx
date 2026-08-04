import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import { mediaDevices } from '@livekit/react-native-webrtc';

import * as rooms from 'src/api/rooms';
import * as audioRoute from 'src/call/audioRoute';
import * as effectsModule from 'src/call/backgroundEffect';
import * as accounts from 'src/auth/accounts';
import * as guest from 'src/auth/guest';
import * as visitor from 'src/auth/visitor';
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

const GRANTED = {
  ok: true,
  value: {
    room: { id: 'r-1', slug: 'reunion', name: 'Réunion', accessLevel: 'public' },
    livekitUrl: 'wss://livekit.linagora.com',
    token: 'lk',
    isAdministrable: false,
  },
} as const;

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
});

describe('PrejoinScreen', () => {
  it("affiche le bouton de jonction quand l'accès est accordé", async () => {
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);

    await render(prejoin());

    await waitFor(() => {
      expect(screen.getByTestId('join-call-btn')).toBeTruthy();
    });
  });

  it("redirige vers la salle d'attente quand l'API répond lobby", async () => {
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue({
      ok: false,
      error: { kind: 'lobby', participantId: '' },
    });

    await render(prejoin());

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

    await render(prejoin());

    await waitFor(() => expect(screen.getByTestId('prejoin-error')).toBeTruthy());
    expect(screen.getByTestId('prejoin-error')).toHaveTextContent('error.unauthorized');
    expect(screen.queryByTestId('prejoin-loading')).toBeNull();
    await fireEvent.press(screen.getByTestId('prejoin-leave-btn'));
    expect(mockReplace).toHaveBeenCalledWith('/home');
  });

  it("porte l'état des périphériques dans l'URL de l'appel", async () => {
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);

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
    expect(mockReplace).toHaveBeenCalledWith('/room/reunion/call?camera=0&mic=0');
  });

  describe('l’aperçu caméra', () => {
    async function ready(): Promise<void> {
      jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);
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
      jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);
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
      jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);
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
      jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);
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
      jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);
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
      jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);

      await render(prejoin());
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

      await render(prejoin());
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

      await render(prejoin());
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
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);

    // `prejoin()` et non `<PrejoinScreen />` nu : ce test vient de `main`, écrit
    // AVANT que le pré-join n'héberge la feuille des effets, donc un `Portal`.
    // Sans `PaperProvider` ancêtre le rendu jette un `AggregateError` peu
    // bavard — un conflit sémantique que git ne pouvait pas voir, les deux
    // côtés ayant modifié des lignes différentes.
    await render(prejoin());
    await waitFor(() => expect(screen.getByTestId('prejoin-root')).toBeTruthy());

    expect(statusBarStyles()).toContain('light');
  });

  it("réclame aussi des icônes claires quand l'accès est refusé", async () => {
    // La branche d'échec peint `errorRoot`, sombre elle aussi. Elle a sa propre
    // déclaration : l'oublier laisserait des icônes sombres sur du noir, et
    // aucun test de la branche nominale ne l'aurait vu.
    jest
      .spyOn(rooms, 'fetchRoomAccess')
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
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);

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
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);

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
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);

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
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);

    await render(prejoin());

    await waitFor(() => expect(screen.getByTestId('camera-switch')).toBeTruthy());
    expect(screen.queryByTestId('prejoin-effects-btn')).toBe(null);
  });

  it('le rend là où il existe', async () => {
    // L'autre borne : sans elle, un composant qui ne rendrait JAMAIS le bouton
    // passerait le test ci-dessus.
    jest.spyOn(effectsModule, 'areEffectsSupported').mockReturnValue(true);
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);

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
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);

    await render(prejoin());

    await waitFor(() => expect(screen.getByTestId('prejoin-name-input')).toBeOnTheScreen());
  });

  // Ce que la Tâche 7 remplace : `prejoin.tsx` appelait `fetchRoomAccess`
  // avec un wrapper `{ kind: 'account', account }` codé en dur, temporaire et
  // délibéré (Tâche 4). `fetchRoomAccess` étant doublé, rien d'autre ne
  // prouverait qu'il reçoit VRAIMENT le visiteur invité et non ce wrapper.
  it('interroge le serveur avec le visiteur invité, pas un compte', async () => {
    const fetchAccess = jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);

    await render(prejoin());

    await waitFor(() => expect(fetchAccess).toHaveBeenCalledWith(GUEST, 'reunion'));
  });

  // Masquer, jamais griser : AGENTS.md interdit `disabled` sur cet écran sombre.
  it('ne rend PAS « Rejoindre » tant que le nom est vide', async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);

    await render(prejoin());
    await waitFor(() => expect(screen.getByTestId('prejoin-name-input')).toBeOnTheScreen());

    expect(screen.queryByTestId('join-call-btn')).toBe(null);
  });

  it('rend « Rejoindre » dès que le nom est saisi', async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);

    await render(prejoin());
    await waitFor(() => expect(screen.getByTestId('prejoin-name-input')).toBeOnTheScreen());
    await fireEvent.changeText(screen.getByTestId('prejoin-name-input'), 'Camille');

    expect(screen.getByTestId('join-call-btn')).toBeOnTheScreen();
  });

  it('mémorise le nom au moment de rejoindre', async () => {
    const remember = jest.spyOn(guest, 'rememberGuestName');
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);

    await render(prejoin());
    await waitFor(() => expect(screen.getByTestId('prejoin-name-input')).toBeOnTheScreen());
    await fireEvent.changeText(screen.getByTestId('prejoin-name-input'), 'Camille');
    await fireEvent.press(screen.getByTestId('join-call-btn'));

    expect(remember).toHaveBeenCalledWith('Camille');
  });

  it("n'écrit RIEN dans l'historique pour un invité", async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);

    await render(prejoin());
    await waitFor(() => expect(screen.getByTestId('prejoin-name-input')).toBeOnTheScreen());
    await fireEvent.changeText(screen.getByTestId('prejoin-name-input'), 'Camille');
    await fireEvent.press(screen.getByTestId('join-call-btn'));

    expect(journal.rememberVisit).not.toHaveBeenCalled();
  });

  it('pré-remplit le champ du nom mémorisé', async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue({ ...GUEST, displayName: 'Camille' });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);

    await render(prejoin());

    await waitFor(() =>
      expect(screen.getByTestId('prejoin-name-input')).toHaveProp('value', 'Camille'),
    );
  });
});

describe('le pré-join avec un compte', () => {
  it('garde le nom en texte figé, sans champ', async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue({ kind: 'account', account: ACCOUNT });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);

    await render(prejoin());

    await waitFor(() => expect(screen.getByTestId('prejoin-name')).toBeOnTheScreen());
    expect(screen.queryByTestId('prejoin-name-input')).toBe(null);
  });

  // L'autre borne du test symétrique de « le pré-join en invité » : sans
  // elle, un écran qui enverrait TOUJOURS un visiteur invité — ou l'inverse —
  // passerait les deux à la fois, `fetchRoomAccess` étant doublé dans les deux
  // cas.
  it('interroge le serveur avec le compte, pas un visiteur invité', async () => {
    const fetchAccess = jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);
    jest.spyOn(visitor, 'getVisitor').mockReturnValue({ kind: 'account', account: ACCOUNT });

    await render(prejoin());

    await waitFor(() =>
      expect(fetchAccess).toHaveBeenCalledWith({ kind: 'account', account: ACCOUNT }, 'reunion'),
    );
  });

  it("écrit BIEN dans l'historique pour un compte", async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue({ kind: 'account', account: ACCOUNT });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);

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
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);

    await render(prejoin());
    await waitFor(() => expect(screen.getByTestId('join-call-btn')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('join-call-btn'));

    expect(remember).not.toHaveBeenCalled();
  });
});
