import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import * as guest from 'src/auth/guest';
import { tokens } from 'src/ui/tokens';
import { WelcomeScreen } from './welcome';

// `mockPush`/`mockReplace` sont désormais au niveau du MODULE, pas fabriqués
// à chaque rendu : l'entrée invité s'asserte depuis l'EXTÉRIEUR du rendu
// (`expect(mockPush).toHaveBeenCalledWith(…)`), ce qu'un `jest.fn()` créé
// dans la fabrique ne permettrait pas de retrouver. Même forme que
// `home.spec.tsx`.
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// La feuille « Rejoindre » importe `expo-clipboard` pour son bouton Coller,
// jamais pressé ici : le module natif n'existe pas sous Jest et romprait le
// CHARGEMENT dès l'import sans ce double. Même préambule que
// `joinSheet.spec.tsx` et `home.spec.tsx`.
jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn(async () => '') }));

const clipboard = jest.requireMock('expo-clipboard') as { getStringAsync: jest.Mock };

// L'écran monte désormais `JoinSheet`, qui vit dans un `Portal` : sans
// `PaperProvider` ancêtre le rendu jette un `AggregateError` peu bavard, que
// la feuille soit ouverte ou non — `Portal` lui-même a besoin du manager,
// avant même que `Modal` ne décide d'afficher son contenu.
function renderWelcome(): Promise<unknown> {
  return render(
    <PaperProvider theme={{ animation: { scale: 0 } }}>
      <WelcomeScreen />
    </PaperProvider>,
  );
}

beforeEach(() => {
  // Le test de session invité espionne `src/auth/guest`, un module PARTAGÉ :
  // sans restauration, l'espion posé par un test fuirait vers le suivant, qui
  // lirait alors un compteur d'appels qui ne lui appartient pas (AGENTS.md).
  jest.restoreAllMocks();
  mockPush.mockClear();
  mockReplace.mockClear();
  // Le double vit à côté de `node_modules` et échappe à `restoreAllMocks` :
  // sans cette remise à zéro, l'hôte collé par un test fuirait vers le suivant.
  clipboard.getStringAsync.mockReset().mockResolvedValue('');
});

describe('WelcomeScreen', () => {
  it('propose les trois entrées exigées', async () => {
    await renderWelcome();

    expect(screen.queryByTestId('sign-in-btn')).not.toBeNull();
    expect(screen.queryByTestId('sign-up-btn')).not.toBeNull();
    expect(screen.queryByTestId('org-server-btn')).not.toBeNull();
  });

  it('rend la tuile de marque', async () => {
    await renderWelcome();

    expect(screen.getByTestId('welcome-tile')).toBeTruthy();
  });

  describe('le titre bicolore', () => {
    // Deux `Text`, pas un : « Twake » en texte principal et « Visio » en vert
    // de marque. Un seul nœud ne pourrait pas porter deux couleurs.
    it('pose la couleur explicite de la première moitié', async () => {
      await renderWelcome();
      expect(screen.getByTestId('welcome-title')).toHaveStyle({
        color: tokens.color.textPrimary,
      });
    });

    it('pose la couleur explicite de la seconde moitié', async () => {
      await renderWelcome();
      expect(screen.getByTestId('welcome-title-accent')).toHaveStyle({
        color: tokens.color.brandStrong,
      });
    });
  });

  it('pose la couleur explicite de la baseline', async () => {
    await renderWelcome();

    expect(screen.getByTestId('welcome-tagline')).toHaveStyle({
      color: tokens.color.textSecondary,
    });
  });

  // La HIÉRARCHIE est une décision, et rien ne la gardait : le spec d'origine
  // n'assertait que la présence des boutons. Le mockup met « S'inscrire » en
  // plein et « Se connecter » en contour — l'application vise d'abord des
  // personnes sans compte. Sans ces deux tests, un retour en arrière passerait
  // au vert.
  //
  // `Button` de Paper pose ``${testID}-text`` sur son `Text` interne
  // (`Button.tsx:405`), donc la couleur du libellé est joignable — c'est ce
  // qui distingue les deux modes de façon observable, `mode` étant une prop
  // que le composant consomme.
  it('met S’inscrire en avant, avec du blanc sur le vert', async () => {
    await renderWelcome();

    expect(screen.getByTestId('sign-up-btn-text')).toHaveStyle({ color: tokens.color.onBrand });
  });

  it('met Se connecter en retrait, en vert sur le fond', async () => {
    await renderWelcome();

    expect(screen.getByTestId('sign-in-btn-text')).toHaveStyle({
      color: tokens.color.brandStrong,
    });
  });
});

// Task 6 : l'entrée invité, DÉTACHÉE sous les trois actions de compte. Le
// bouton ouvre la feuille déjà construite pour « Rejoindre » (`JoinSheet`),
// dont la validation déclenche TROIS instructions dans `onJoinRoom` : fermer
// la feuille, démarrer une session invité sur le serveur choisi, pousser le
// pré-join. Trois instructions, donc au moins trois assertions qui les nomment.
describe("l'entrée invité", () => {
  it('ouvre la feuille de saisie', async () => {
    await renderWelcome();
    expect(screen.queryByTestId('welcome-join-sheet')).toBe(null);

    await fireEvent.press(screen.getByTestId('join-as-guest-btn'));

    expect(screen.getByTestId('welcome-join-sheet')).toBeOnTheScreen();
  });

  // DEUX instructions dans ce gestionnaire, donc deux assertions : ouvrir la
  // session, et naviguer. Le compte d'instructions est le compte d'assertions.
  it('ouvre une session invité sur le serveur choisi', async () => {
    const start = jest.spyOn(guest, 'startGuestSession');
    await renderWelcome();
    await fireEvent.press(screen.getByTestId('join-as-guest-btn'));

    await fireEvent.changeText(screen.getByTestId('welcome-join-sheet-input'), 'abcdefghij');
    await fireEvent.press(screen.getByTestId('welcome-join-sheet-submit'));

    // `host` PARLE en nom d'hôte, `startGuestSession` ATTEND une URL complète :
    // c'est la conversion à la frontière que ce test garde, pas seulement le
    // fait de l'appel.
    expect(start).toHaveBeenCalledWith('https://meet.linagora.com');
  });

  it('pousse le pré-join du salon saisi', async () => {
    await renderWelcome();
    await fireEvent.press(screen.getByTestId('join-as-guest-btn'));
    await fireEvent.changeText(screen.getByTestId('welcome-join-sheet-input'), 'abcdefghij');
    await fireEvent.press(screen.getByTestId('welcome-join-sheet-submit'));

    expect(mockPush).toHaveBeenCalledWith('/room/abc-defg-hij/prejoin');
  });

  // La QUATRIÈME chose que fait cet écran, et la seule qu'aucun test ne
  // tenait : le câblage `onHostChange={setHost}`.
  //
  // Le supprimer était une mutation VERTE — les trois tests ci-dessus passent
  // tous par l'hôte par défaut, que le collage ne fait pas bouger. Sur
  // appareil, la conséquence est entière : quelqu'un colle un lien
  // `meet.acme.com`, la feuille continue d'afficher `meet.linagora.com`, la
  // session invité s'ouvre sur l'instance par défaut, et le salon y est
  // « introuvable ». La Décision 4 du partenaire humain — « un lien collé
  // garde toujours SON hôte » — est exactement ce que ce test garde.
  //
  // L'assertion porte sur la SESSION ouverte, pas sur ce que la feuille
  // affiche : c'est elle qui décide quel serveur sera interrogé ensuite.
  it("ouvre la session sur l'hôte du lien COLLÉ, pas sur celui par défaut", async () => {
    const start = jest.spyOn(guest, 'startGuestSession');
    clipboard.getStringAsync.mockResolvedValue('https://meet.acme.com/abc-defg-hij');
    await renderWelcome();
    await fireEvent.press(screen.getByTestId('join-as-guest-btn'));

    await fireEvent.press(screen.getByTestId('welcome-join-sheet-paste'));
    // Le collage remplit les dix cases ET remonte l'hôte : attendre le premier
    // prouve que le second est arrivé, les deux venant du même gestionnaire.
    await waitFor(() =>
      expect(screen.getByTestId('welcome-join-sheet-cell-0')).toHaveTextContent('a'),
    );
    await fireEvent.press(screen.getByTestId('welcome-join-sheet-submit'));

    expect(start).toHaveBeenCalledWith('https://meet.acme.com');
  });

  // La conséquence VISIBLE du même câblage : la rangée de serveur montre
  // l'hôte adopté. Sans elle, on aurait la session juste et l'affichage
  // menteur — deux instructions, deux assertions.
  it("montre l'hôte adopté dans la rangée de serveur", async () => {
    clipboard.getStringAsync.mockResolvedValue('https://meet.acme.com/abc-defg-hij');
    await renderWelcome();
    await fireEvent.press(screen.getByTestId('join-as-guest-btn'));

    await fireEvent.press(screen.getByTestId('welcome-join-sheet-paste'));

    await waitFor(() =>
      expect(screen.getByTestId('welcome-join-sheet-host')).toHaveTextContent('meet.acme.com'),
    );
  });

  // La TROISIÈME instruction du même gestionnaire — fermer la feuille — est
  // absente du brief. Sans cette assertion, retirer `setJoinOpen(false)` ne
  // rougirait rien : c'est précisément le trou qu'AGENTS.md documente
  // (« recenser aussi les EFFETS »), cherché ici avant l'implémentation.
  //
  // `waitFor`, pas une assertion synchrone : la FERMETURE de `Modal` ne
  // remonte `visibleInternal` à `false` que dans le callback de
  // `Animated.timing(...).start(…)` (`Modal.tsx:132-141`), qui reste
  // asynchrone même à `animation.scale: 0` — à la différence de l'OUVERTURE,
  // posée en synchrone dans le même effet (`Modal.tsx:150`). Mesuré : une
  // assertion synchrone ici échoue en montrant la feuille encore montée.
  it('referme la feuille une fois la session ouverte', async () => {
    await renderWelcome();
    await fireEvent.press(screen.getByTestId('join-as-guest-btn'));
    await fireEvent.changeText(screen.getByTestId('welcome-join-sheet-input'), 'abcdefghij');
    await fireEvent.press(screen.getByTestId('welcome-join-sheet-submit'));

    await waitFor(() => expect(screen.queryByTestId('welcome-join-sheet')).toBe(null));
  });
});
