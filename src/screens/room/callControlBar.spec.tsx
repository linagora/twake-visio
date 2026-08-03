import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Room } from 'livekit-client';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import type { RaisedHand } from 'src/call/hands';
import type { ReactionKey } from 'src/call/reactions';
import { BAR_SURFACE_COLOR } from 'src/screens/room/controlBar';
import { tokens } from 'src/ui/tokens';
import { CallControlBar } from './callControlBar';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// `CameraMenu` et `MoreMenu` montent leur feuille dans un `Portal`, et `Modal`
// (react-native-paper) lit `useSafeAreaInsets()` (`Modal.tsx:118`). Même double
// que `moreMenu.spec.tsx` et `cameraMenu.spec.tsx`.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

// Bouchonné en entier plutôt qu'espionné : la barre n'appelle rien de ce module
// au montage, mais l'appui qui bascule le micro y entre, et une `Room` vide n'a
// aucune piste à publier.
jest.mock('src/call/media', () => ({
  listCameras: jest.fn(() => Promise.resolve([])),
  readActiveCameraId: jest.fn(() => null),
  selectCamera: jest.fn(() => Promise.resolve(true)),
  setCameraEnabled: jest.fn(() => Promise.resolve()),
  setMicrophoneEnabled: jest.fn(() => Promise.resolve()),
}));

// `animation.scale` à zéro ramène à zéro la durée des animations d'opacité de
// `Modal` (`Modal.tsx:117-144`).
function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

// La barre ne lit jamais la `Room` au montage : elle ne la passe qu'aux
// fonctions de `src/call/media`, bouchonnées ci-dessus.
const ROOM = {} as unknown as Room;

type Overrides = {
  defaultMicOn?: boolean;
  defaultCameraOn?: boolean;
  unread?: number;
  hands?: readonly RaisedHand[];
  handRaised?: boolean;
  handBusy?: boolean;
  onToggleHand?: () => void;
  onSendReaction?: (key: ReactionKey) => void;
};

function bar(overrides: Overrides = {}): React.ReactElement {
  return withPaper(
    <CallControlBar
      hidden={false}
      room={ROOM}
      defaultMicOn={overrides.defaultMicOn ?? true}
      defaultCameraOn={overrides.defaultCameraOn ?? true}
      onFacingChange={jest.fn()}
      onNotice={jest.fn()}
      handRaised={overrides.handRaised ?? false}
      handBusy={overrides.handBusy ?? false}
      hands={overrides.hands ?? []}
      unread={overrides.unread ?? 0}
      onToggleHand={overrides.onToggleHand ?? jest.fn()}
      onSendReaction={overrides.onSendReaction ?? jest.fn()}
      onOpenChat={jest.fn()}
      effect={null}
      onEffectSelect={jest.fn()}
      onLeave={jest.fn()}
    />,
  );
}

// `IconButton` pose son `style` sur la `Surface` qu'il rend, sous le testID
// `` `${testID}-container` `` (`IconButton.tsx:170-183`), et l'y applique EN
// DERNIER — ligne 182, après le `backgroundColor` qu'il calcule depuis le
// thème. C'est donc le seul nœud où le fond d'un bouton de barre soit
// observable : le testID nu, lui, désigne le `TouchableRipple` intérieur
// (ligne 205), qui ne porte que `styles.touchable`.
//
// Mesuré contre HEAD avant d'être écrit : les sept assertions de ce fichier
// échouent alors sur `backgroundColor: "transparent"`, la valeur que la
// `Surface` de Paper rend sans style de notre part. Le nœud existe, la
// propriété est joignable, et rien ici n'est vert des deux côtés.
function fill(testID: string): ReturnType<typeof screen.getByTestId> {
  return screen.getByTestId(`${testID}-container`);
}

describe('CallControlBar', () => {
  it('pose le voile translucide de la barre sur chaque commande neutre', async () => {
    // Les cinq, et pas seulement celles que ce fichier rend lui-même :
    // `audio-output-btn` vient d'`audioOutputControl.tsx` et `more-btn` de
    // `moreMenu.tsx`, tous deux stylés depuis `barStyles.button`. Un voile
    // posé au cas par cas dans ce fichier les laisserait nus.
    await render(bar());

    expect(fill('mic-toggle')).toHaveStyle({ backgroundColor: BAR_SURFACE_COLOR });
    expect(fill('camera-toggle')).toHaveStyle({ backgroundColor: BAR_SURFACE_COLOR });
    expect(fill('reactions-toggle')).toHaveStyle({ backgroundColor: BAR_SURFACE_COLOR });
    expect(fill('more-btn')).toHaveStyle({ backgroundColor: BAR_SURFACE_COLOR });
  });

  it('remplit le micro coupé de rouge, et lui seul', async () => {
    // La caméra dans la même passe : un `barStyles.danger` posé sans condition
    // rendrait le micro juste, et rien ne le dirait.
    await render(bar({ defaultMicOn: false }));

    expect(fill('mic-toggle')).toHaveStyle({ backgroundColor: tokens.color.danger });
    expect(fill('camera-toggle')).toHaveStyle({ backgroundColor: BAR_SURFACE_COLOR });
  });

  it('remplit la caméra coupée de rouge, et elle seule', async () => {
    await render(bar({ defaultCameraOn: false }));

    expect(fill('camera-toggle')).toHaveStyle({ backgroundColor: tokens.color.danger });
    expect(fill('mic-toggle')).toHaveStyle({ backgroundColor: BAR_SURFACE_COLOR });
  });

  it('suit la bascule, jamais la seule valeur d’entrée', async () => {
    // Sans cet appui, un style branché sur `defaultMicOn` au lieu de `micOn`
    // passerait les deux tests ci-dessus : leurs fixtures posent les deux
    // valeurs égales, par construction.
    await render(bar());

    expect(fill('mic-toggle')).toHaveStyle({ backgroundColor: BAR_SURFACE_COLOR });
    await fireEvent.press(screen.getByTestId('mic-toggle'));

    expect(fill('mic-toggle')).toHaveStyle({ backgroundColor: tokens.color.danger });
  });

  it('suit aussi la bascule de la caméra', async () => {
    await render(bar());

    expect(fill('camera-toggle')).toHaveStyle({ backgroundColor: BAR_SURFACE_COLOR });
    await fireEvent.press(screen.getByTestId('camera-toggle'));

    expect(fill('camera-toggle')).toHaveStyle({ backgroundColor: tokens.color.danger });
  });

  it('fait de « raccrocher » une pastille pleine, pas un glyphe rouge sur fond noir', async () => {
    await render(bar());

    expect(fill('leave-btn')).toHaveStyle({ backgroundColor: tokens.color.danger });
  });

  it('rend le compteur de non-lu vert à texte blanc', async () => {
    // `Badge` extrait `backgroundColor` du style aplati, puis répand le RESTE
    // de ce style APRÈS la couleur de texte qu'il calcule depuis le thème
    // (`Badge.tsx:88-120`) : les deux couleurs de `barStyles.badge` gagnent
    // donc, et les deux sont observables sur le `Text` animé qu'il rend —
    // `{...rest}` porte le testID jusqu'à lui (`Badge.tsx:122`).
    await render(bar({ unread: 3 }));

    expect(screen.getByTestId('chat-unread')).toHaveStyle({
      backgroundColor: tokens.color.brandStrong,
      color: tokens.color.onBrand,
    });
  });
  // La rangée de réactions, la forme que le propriétaire a demandée : un appui
  // l'ouvre au-dessus de la barre, un choix l'envoie et la referme aussitôt.
  // Elle vivait dans le menu « Plus », à deux gestes de là.
  describe('la rangée de réactions', () => {
    it("n'est pas rendue tant qu'on n'a pas appuyé", async () => {
      await render(bar());

      expect(screen.queryByTestId('reaction-row-thumbs-up')).toBe(null);
    });

    it("s'ouvre sur un appui", async () => {
      await render(bar());

      await fireEvent.press(screen.getByTestId('reactions-toggle'));

      expect(screen.getByTestId('reaction-row-thumbs-up')).toBeTruthy();
    });

    // Les DEUX instructions du gestionnaire, une assertion chacune. La
    // troisième réaction, jamais la première : avec `thumbs-up`, « transmet la
    // cible pressée » et « renvoie toujours la première » seraient
    // indiscernables.
    it('envoie la réaction pressée', async () => {
      const onSendReaction = jest.fn();
      await render(bar({ onSendReaction }));
      await fireEvent.press(screen.getByTestId('reactions-toggle'));

      await fireEvent.press(screen.getByTestId('reaction-row-clapping-hands'));

      expect(onSendReaction).toHaveBeenCalledWith('clapping-hands');
      expect(onSendReaction).not.toHaveBeenCalledWith('thumbs-up');
    });

    it('se referme au premier choix', async () => {
      await render(bar());
      await fireEvent.press(screen.getByTestId('reactions-toggle'));

      await fireEvent.press(screen.getByTestId('reaction-row-clapping-hands'));

      expect(screen.queryByTestId('reaction-row-clapping-hands')).toBe(null);
    });
  });

  describe('la main levée', () => {
    it('transmet la bascule', async () => {
      const onToggleHand = jest.fn();
      await render(bar({ onToggleHand }));

      await fireEvent.press(screen.getByTestId('hand-toggle'));

      expect(onToggleHand).toHaveBeenCalledTimes(1);
    });

    // L'icône d'un `IconButton` à icône-chaîne n'est JAMAIS joignable
    // (`IconButton.tsx:211` ne lui transmet aucun testID) : c'est le libellé
    // d'accessibilité qui porte l'état, et lui seul est observable.
    it('annonce une baisse quand la main est déjà levée', async () => {
      await render(bar({ handRaised: true }));

      expect(screen.getByTestId('hand-toggle').props.accessibilityLabel).toBe('call.lowerHand');
    });

    it('annonce une levée sinon', async () => {
      await render(bar({ handRaised: false }));

      expect(screen.getByTestId('hand-toggle').props.accessibilityLabel).toBe('call.raiseHand');
    });

    // RESTE rendue pendant la requête. Elle a été masquée, et le propriétaire a
    // vu le bouton disparaître puis revenir sous son doigt : dans un menu qui
    // se referme au même instant cela ne se voyait pas, dans la barre si.
    //
    // Elle n'est pas non plus grisée : Paper teste `disabled` avant toute
    // couleur explicite et rendrait un quasi-noir sur ce fond sombre.
    it('reste visible pendant que la requête est en vol', async () => {
      await render(bar({ handBusy: true }));

      expect(screen.getByTestId('hand-toggle')).toBeTruthy();
    });

    // **La COULEUR ambre n'est pas gardée, et ce n'est pas un oubli.**
    // `IconButton.tsx:211` rend `<IconComponent color={iconColor} …>` sans lui
    // transmettre de testID, et pose en plus `accessibilityElementsHidden` :
    // aucune requête n'atteint le glyphe. Aucun bouton de cette barre ne garde
    // son `iconColor` ; en fabriquer un ici demanderait de passer `icon` en
    // fonction, ce qui est un changement d'architecture et non un test.
    //
    // Ce qui EST observable, c'est l'état que la couleur accompagne — et il est
    // gardé par les deux libellés ci-dessus.
  });
});
