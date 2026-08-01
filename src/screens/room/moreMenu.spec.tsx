import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import type { RaisedHand } from 'src/call/hands';
import type { RecordingState } from 'src/call/recording';
import { tokens } from 'src/ui/tokens';
import { MoreMenu } from './moreMenu';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// `BottomSheet` monte sa feuille dans un `Portal`, et `Modal` (react-native-paper)
// lit `useSafeAreaInsets()` (`Modal.tsx:118`). Pas strictement requis ici —
// `SafeAreaProviderCompat`, que `PaperProvider` pose toujours, retombe déjà sur
// des insets à zéro quand aucun fournisseur natif n'a répondu, ce qui couvre les
// environnements de test. Gardé pour documenter l'intention plutôt que de
// compter sur ce repli interne d'une bibliothèque tierce, comme dans
// `cameraMenu.spec.tsx` et `audioOutputControl.spec.tsx`.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

// `animation.scale` à zéro ramène à zéro la durée des deux animations
// d'opacité que `Modal` lance avec `Animated.timing` — à l'ouverture et à la
// fermeture (`Modal.tsx:117-144`, `duration: scale * DEFAULT_DURATION`, sans
// quoi chacune prendrait 220 ms).
function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

const IDLE: RecordingState = { phase: 'idle', mode: null };
const RECORDING: RecordingState = { phase: 'recording', mode: 'screen_recording' };
const STARTING: RecordingState = { phase: 'starting', mode: 'screen_recording' };

const ADA: RaisedHand = {
  identity: 'u-ada',
  name: 'Ada',
  raisedAt: Date.parse('2026-07-30T10:00:01Z'),
  isLocal: false,
};

type Overrides = {
  recording?: RecordingState;
  canRecord?: boolean;
  recordingBusy?: boolean;
  handRaised?: boolean;
  handBusy?: boolean;
  hands?: readonly RaisedHand[];
  onShare?: () => void;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  onToggleHand?: () => void;
};

function menu(overrides: Overrides = {}): React.ReactElement {
  return withPaper(
    <MoreMenu
      recording={overrides.recording ?? IDLE}
      canRecord={overrides.canRecord ?? true}
      recordingBusy={overrides.recordingBusy ?? false}
      handRaised={overrides.handRaised ?? false}
      handBusy={overrides.handBusy ?? false}
      hands={overrides.hands ?? []}
      onShare={overrides.onShare ?? jest.fn()}
      onStartRecording={overrides.onStartRecording ?? jest.fn()}
      onStopRecording={overrides.onStopRecording ?? jest.fn()}
      onToggleHand={overrides.onToggleHand ?? jest.fn()}
    />,
  );
}

async function open(): Promise<void> {
  await fireEvent.press(screen.getByTestId('more-btn'));
}

describe('MoreMenu', () => {
  it('ne montre rien avant l’ouverture', async () => {
    await render(menu());

    expect(screen.queryByTestId('recording-toggle')).toBe(null);
    expect(screen.queryByTestId('share-btn')).toBe(null);
    expect(screen.queryByTestId('hand-toggle')).toBe(null);
  });

  it('offre le partage et le démarrage au repos', async () => {
    await render(menu());

    await open();

    await waitFor(() => expect(screen.getByTestId('share-btn')).toBeTruthy());
    expect(screen.getByTestId('recording-toggle')).toHaveTextContent('recording.start');
    // Surfaces de couleur propres à cette feuille (voir `controlBar.ts` et le
    // C1 de `recordingControl.spec.tsx` pour le même principe) : la surface de
    // la feuille et le libellé de partage portent tous deux une couleur
    // explicite issue des tokens, jamais celle que Paper calculerait depuis le
    // thème — cette scène est sombre dans les deux schémas alors que le thème
    // suit le schéma système. `BottomSheet` passe `testID="more-sheet"` à
    // `Modal`, qui expose sa `Surface` sous `` `${testID}-surface` ``
    // (`Modal.tsx:219-220`) : la feuille porte donc le nôtre, jamais le testID
    // par défaut de la bibliothèque. `SheetRow` suffixe le sien de `-title`
    // pour son `Text` interne, exactement comme `Menu.Item`.
    expect(screen.getByTestId('more-sheet-surface')).toHaveStyle({
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

  it('lève la main et referme le menu, comme ses deux voisines', async () => {
    // Rien ne garantit qu'une entrée referme le menu parce que ses voisines le
    // font : le `setVisible(false)` est écrit une fois par entrée.
    const onToggleHand = jest.fn();
    const onShare = jest.fn();
    await render(menu({ onToggleHand, onShare }));

    await open();
    await waitFor(() => expect(screen.getByTestId('hand-toggle')).toBeTruthy());
    expect(screen.getByTestId('hand-toggle')).toHaveTextContent('call.raiseHand');
    await fireEvent.press(screen.getByTestId('hand-toggle'));

    expect(onToggleHand).toHaveBeenCalledTimes(1);
    expect(onShare).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('hand-toggle')).toBe(null));
  });

  it('devient une baisse quand la main est levée', async () => {
    await render(menu({ handRaised: true }));

    await open();

    await waitFor(() => expect(screen.getByTestId('hand-toggle')).toBeTruthy());
    expect(screen.getByTestId('hand-toggle')).toHaveTextContent('call.lowerHand');
  });

  it('retire la commande pendant un appel en vol, sans toucher au reste', async () => {
    await render(menu({ handBusy: true, hands: [ADA] }));

    await open();

    await waitFor(() => expect(screen.getByTestId('share-btn')).toBeTruthy());
    expect(screen.queryByTestId('hand-toggle')).toBe(null);
    expect(screen.getByTestId('hand-queue')).toBeTruthy();
  });

  it('montre la file entière, la seconde entrée comprise', async () => {
    const bob: RaisedHand = {
      identity: 'u-bob',
      name: 'Bob',
      raisedAt: Date.parse('2026-07-30T10:00:02Z'),
      isLocal: true,
    };
    await render(menu({ hands: [ADA, bob] }));

    await open();

    await waitFor(() => expect(screen.getByTestId('hand-queue')).toBeTruthy());
    expect(screen.getByTestId('hand-queue-title')).toHaveTextContent('call.handQueue');
    // Deux entrées, et c'est la SECONDE qu'on vise : avec une seule, une liste
    // tronquée à son premier élément passerait. La numérotation elle-même est
    // gardée un étage plus bas, dans `handControl.spec.tsx` — le mock de `t`
    // de CE fichier ne rend pas les valeurs interpolées.
    expect(screen.getByTestId('hand-queue-row-u-bob')).toBeTruthy();
    expect(screen.getByTestId('hand-queue-row-u-ada')).toBeTruthy();
  });

  it('ne montre aucune file quand personne ne lève la main', async () => {
    await render(menu({ hands: [] }));

    await open();

    await waitFor(() => expect(screen.getByTestId('share-btn')).toBeTruthy());
    expect(screen.queryByTestId('hand-queue')).toBe(null);
  });
});
