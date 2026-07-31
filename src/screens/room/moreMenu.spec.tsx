import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import type { RecordingState } from 'src/call/recording';
import { tokens } from 'src/ui/tokens';
import { MoreMenu } from './moreMenu';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

// `Menu` monte son contenu dans un `Portal`, qui jette sans `Provider` ancêtre.
// `animation.scale` à zéro ramène à zéro la durée de l'animation de fermeture
// que `Menu` lance au montage.
function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

// Même à durée nulle, ce rappel part sur un `requestAnimationFrame` : un appui
// qui arrive avant lui voit son ouverture annulée, définitivement.
async function settleMenus(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 32));
  });
}

const IDLE: RecordingState = { phase: 'idle', mode: null };
const RECORDING: RecordingState = { phase: 'recording', mode: 'screen_recording' };
const STARTING: RecordingState = { phase: 'starting', mode: 'screen_recording' };

type Overrides = {
  recording?: RecordingState;
  canRecord?: boolean;
  recordingBusy?: boolean;
  onShare?: () => void;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
};

function menu(overrides: Overrides = {}): React.ReactElement {
  return withPaper(
    <MoreMenu
      recording={overrides.recording ?? IDLE}
      canRecord={overrides.canRecord ?? true}
      recordingBusy={overrides.recordingBusy ?? false}
      onShare={overrides.onShare ?? jest.fn()}
      onStartRecording={overrides.onStartRecording ?? jest.fn()}
      onStopRecording={overrides.onStopRecording ?? jest.fn()}
    />,
  );
}

async function open(): Promise<void> {
  await settleMenus();
  await fireEvent.press(screen.getByTestId('more-btn'));
}

describe('MoreMenu', () => {
  it('ne montre rien avant l’ouverture', async () => {
    await render(menu());

    expect(screen.queryByTestId('recording-toggle')).toBe(null);
    expect(screen.queryByTestId('share-btn')).toBe(null);
  });

  it('offre le partage et le démarrage au repos', async () => {
    await render(menu());

    await open();

    await waitFor(() => expect(screen.getByTestId('share-btn')).toBeTruthy());
    expect(screen.getByTestId('recording-toggle')).toHaveTextContent('recording.start');
    // Surfaces de couleur propres à ce menu (voir `controlBar.ts` et le C1 de
    // `recordingControl.spec.tsx` pour le même principe) : la surface du menu
    // et le libellé de partage portent tous deux une couleur explicite issue
    // des tokens, jamais celle que Paper calculerait depuis le thème — cette
    // scène est sombre dans les deux schémas alors que le thème suit le
    // schéma système. `Menu` par défaut n'a pas de `testID` propre ici (comme
    // `audioOutputControl.tsx` et `cameraMenu.tsx`), donc sa surface porte le
    // testID par défaut de la bibliothèque, `menu-surface` ; `Menu.Item`
    // suffixe le sien de `-title` pour son `Text` interne.
    expect(screen.getByTestId('menu-surface')).toHaveStyle({
      backgroundColor: tokens.color.surfaceDark,
    });
    expect(screen.getByTestId('share-btn-title')).toHaveStyle({ color: tokens.color.textDark });
  });

  it('démarre l’enregistrement', async () => {
    const onStartRecording = jest.fn();
    const onStopRecording = jest.fn();
    await render(menu({ onStartRecording, onStopRecording }));

    await open();
    await waitFor(() => expect(screen.getByTestId('recording-toggle')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('recording-toggle'));

    expect(onStartRecording).toHaveBeenCalledTimes(1);
    expect(onStopRecording).not.toHaveBeenCalled();
  });

  it('devient un arrêt dès le démarrage en cours', async () => {
    const onStartRecording = jest.fn();
    const onStopRecording = jest.fn();
    await render(menu({ recording: STARTING, onStartRecording, onStopRecording }));

    await open();
    await waitFor(() => expect(screen.getByTestId('recording-toggle')).toBeTruthy());
    expect(screen.getByTestId('recording-toggle')).toHaveTextContent('recording.stop');
    await fireEvent.press(screen.getByTestId('recording-toggle'));

    expect(onStopRecording).toHaveBeenCalledTimes(1);
    expect(onStartRecording).not.toHaveBeenCalled();
  });

  it('arrête un enregistrement en cours', async () => {
    const onStopRecording = jest.fn();
    await render(menu({ recording: RECORDING, onStopRecording }));

    await open();
    await waitFor(() => expect(screen.getByTestId('recording-toggle')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('recording-toggle'));

    expect(onStopRecording).toHaveBeenCalledTimes(1);
  });

  it('partage sans toucher à l’enregistrement', async () => {
    // Les deux entrées du menu partent vers deux rappels distincts : les
    // intervertir enverrait un appui sur « partager » démarrer un
    // enregistrement.
    const onShare = jest.fn();
    const onStartRecording = jest.fn();
    await render(menu({ onShare, onStartRecording }));

    await open();
    await waitFor(() => expect(screen.getByTestId('share-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('share-btn'));

    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onStartRecording).not.toHaveBeenCalled();
  });

  it('ne propose aucune commande d’enregistrement sans le droit, mais garde le partage', async () => {
    await render(menu({ canRecord: false }));

    await open();

    await waitFor(() => expect(screen.getByTestId('share-btn')).toBeTruthy());
    expect(screen.queryByTestId('recording-toggle')).toBe(null);
  });

  it('retire la commande pendant un appel en vol plutôt que de la griser', async () => {
    await render(menu({ recordingBusy: true }));

    await open();

    await waitFor(() => expect(screen.getByTestId('share-btn')).toBeTruthy());
    expect(screen.queryByTestId('recording-toggle')).toBe(null);
  });

  it('referme le menu après un appui', async () => {
    // Un menu qui reste ouvert masque la scène et invite au second appui, donc
    // au 409.
    await render(menu());

    await open();
    await waitFor(() => expect(screen.getByTestId('recording-toggle')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('recording-toggle'));

    await waitFor(() => expect(screen.queryByTestId('recording-toggle')).toBe(null));
  });

  // Le pendant du test ci-dessus, côté partage : rien ne garantit qu'une seule
  // des deux entrées referme le menu avant d'appeler son rappel. Sans ce test,
  // retirer le `setVisible(false)` du seul bouton de partage passerait la
  // suite entière — aucun des tests ci-dessus n'observe l'état du menu après
  // un appui sur `share-btn`, seulement l'appel de `onShare`.
  it('referme aussi le menu après un partage', async () => {
    await render(menu());

    await open();
    await waitFor(() => expect(screen.getByTestId('share-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('share-btn'));

    await waitFor(() => expect(screen.queryByTestId('share-btn')).toBe(null));
  });
});
