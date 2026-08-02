import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Room } from 'livekit-client';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import type { RaisedHand } from 'src/call/hands';
import type { RecordingState } from 'src/call/recording';
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

const IDLE: RecordingState = { phase: 'idle', mode: null };

// La barre ne lit jamais la `Room` au montage : elle ne la passe qu'aux
// fonctions de `src/call/media`, bouchonnées ci-dessus.
const ROOM = {} as unknown as Room;

type Overrides = {
  defaultMicOn?: boolean;
  defaultCameraOn?: boolean;
  unread?: number;
  hands?: readonly RaisedHand[];
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
      recording={IDLE}
      canRecord
      recordingBusy={false}
      handRaised={false}
      handBusy={false}
      hands={overrides.hands ?? []}
      unread={overrides.unread ?? 0}
      onShare={jest.fn()}
      onStartRecording={jest.fn()}
      onStopRecording={jest.fn()}
      onToggleHand={jest.fn()}
      onSendReaction={jest.fn()}
      onOpenChat={jest.fn()}
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
    expect(fill('audio-output-btn')).toHaveStyle({ backgroundColor: BAR_SURFACE_COLOR });
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
});
