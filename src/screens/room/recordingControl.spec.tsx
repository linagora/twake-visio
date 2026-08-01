import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import type { RecordingState } from 'src/call/recording';
import { tokens } from 'src/ui/tokens';
import { RecordingControl } from './recordingControl';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const IDLE: RecordingState = { phase: 'idle', mode: null };
const STARTING: RecordingState = { phase: 'starting', mode: 'screen_recording' };
const RECORDING: RecordingState = { phase: 'recording', mode: 'transcript' };
const SAVING: RecordingState = { phase: 'saving', mode: 'screen_recording' };
const ABORTED: RecordingState = { phase: 'aborted', mode: 'screen_recording' };

describe('RecordingControl', () => {
  it('ne rend rien sans le droit d’enregistrer', async () => {
    // Le serveur refuserait : proposer un geste voué à échouer se lit comme une
    // panne de l'application. On masque, on ne grise pas.
    await render(
      <RecordingControl
        state={IDLE}
        canStart={false}
        busy={false}
        onStart={jest.fn()}
        onStop={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('recording-toggle')).toBe(null);
  });

  it('disparaît pendant un appel en vol plutôt que de se griser', async () => {
    // Paper teste `disabled` avant la couleur passée par l'appelant et rend un
    // quasi-noir qu'aucune couleur explicite ne rattrape.
    await render(
      <RecordingControl state={IDLE} canStart busy onStart={jest.fn()} onStop={jest.fn()} />,
    );

    expect(screen.queryByTestId('recording-toggle')).toBe(null);
  });

  it('démarre au repos', async () => {
    const onStart = jest.fn();
    const onStop = jest.fn();
    await render(
      <RecordingControl state={IDLE} canStart busy={false} onStart={onStart} onStop={onStop} />,
    );

    expect(screen.getByTestId('recording-toggle')).toHaveTextContent('recording.start');
    // C1 : `Menu.Item` calcule `titleColor` depuis le thème et le place avant
    // `titleStyle` dans le tableau de styles qu'il passe à son `Text` interne
    // (`testID` suffixé `-title`, jamais celui de la racine) — la couleur
    // explicite gagne, mais seulement si le composant la pose vraiment. Un
    // `titleStyle` figé sur `sheetStyles.rowTitle` (jamais basculé vers la
    // variante danger) passerait quand même le test de libellé ci-dessus :
    // c'est cette variation-là, pas le texte, que ce test protège.
    expect(screen.getByTestId('recording-toggle-title')).toHaveStyle({
      color: tokens.color.textDark,
    });
    await fireEvent.press(screen.getByTestId('recording-toggle'));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStop).not.toHaveBeenCalled();
  });

  it('arrête dès la phase de démarrage', async () => {
    // C'est la phase que §5.3 refuse de griser : rien ne distingue « deux
    // secondes se sont écoulées » de « l'egress ne démarrera jamais ».
    const onStart = jest.fn();
    const onStop = jest.fn();
    await render(
      <RecordingControl state={STARTING} canStart busy={false} onStart={onStart} onStop={onStop} />,
    );

    expect(screen.getByTestId('recording-toggle')).toHaveTextContent('recording.stop');
    // Le pendant du contrôle ci-dessus, côté arrêt : `rowTitleDanger` est la
    // seule couleur d'alerte de cette barre qui ne soit pas celle de
    // « quitter » (`controlBar.ts`), et c'est cette phase-ci que §5.3 refuse de
    // griser — la lisibilité de « ça s'arrête » compte donc particulièrement
    // ici.
    expect(screen.getByTestId('recording-toggle-title')).toHaveStyle({
      color: tokens.color.dangerDark,
    });
    await fireEvent.press(screen.getByTestId('recording-toggle'));

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('arrête aussi pendant un enregistrement, une sauvegarde ou après une interruption', async () => {
    for (const state of [RECORDING, SAVING, ABORTED]) {
      const onStart = jest.fn();
      const onStop = jest.fn();
      const view = await render(
        <RecordingControl state={state} canStart busy={false} onStart={onStart} onStop={onStop} />,
      );

      expect(screen.getByTestId('recording-toggle')).toHaveTextContent('recording.stop');
      // La couleur d'alerte suit `stopping`, pas la seule phase `starting` :
      // sans cette boucle sur les trois autres phases, un `titleStyle` codé en
      // dur sur `state.phase === 'starting' ? danger : rowTitle` afficherait
      // la bonne couleur au test précédent tout en repassant en clair ici.
      expect(screen.getByTestId('recording-toggle-title')).toHaveStyle({
        color: tokens.color.dangerDark,
      });
      await fireEvent.press(screen.getByTestId('recording-toggle'));
      expect(onStop).toHaveBeenCalledTimes(1);
      // `onStart` doit être capturé, pas passé en ligne : sans lui, rien ici ne
      // distingue un câblage correct d'un câblage qui appellerait les deux
      // callbacks pour ces trois phases précisément, tout en restant correct
      // sur `idle` et `starting` — les deux seules phases déjà couvertes dans
      // les deux sens par les tests voisins.
      expect(onStart).not.toHaveBeenCalled();

      await view.unmount();
    }
  });
});
