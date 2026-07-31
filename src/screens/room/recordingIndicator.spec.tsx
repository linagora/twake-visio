import { render, screen } from '@testing-library/react-native';
import React from 'react';

import type { RecordingState } from 'src/call/recording';
import { tokens } from 'src/ui/tokens';
import { RecordingIndicator } from './recordingIndicator';

// Aucune des 14 clés que ce composant affiche n'interpole (contrairement à
// `waiting.knocking` ou `call.cameraNumbered`) : un mock ignorant son second
// argument ne masquerait donc aucune substitution de champ ici. Voir
// `recordingLabelKey` (src/call/recording.ts) — la table est une fonction pure
// de `state.phase`/`state.mode` vers une clé fixe, jamais une chaîne composée.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('RecordingIndicator', () => {
  it('ne rend rien au repos', async () => {
    await render(<RecordingIndicator state={{ phase: 'idle', mode: null }} />);

    expect(screen.queryByTestId('recording-indicator')).toBe(null);
  });

  it('annonce le démarrage', async () => {
    const state: RecordingState = { phase: 'starting', mode: 'screen_recording' };

    await render(<RecordingIndicator state={state} />);

    expect(screen.getByTestId('recording-indicator')).toHaveTextContent('recording.starting');
  });

  it('annonce un enregistrement en cours', async () => {
    const state: RecordingState = { phase: 'recording', mode: 'screen_recording' };

    await render(<RecordingIndicator state={state} />);

    expect(screen.getByTestId('recording-indicator')).toHaveTextContent('recording.active');
  });

  it('nomme une transcription pour ce qu’elle est', async () => {
    // Un participant web peut démarrer une transcription : répondre
    // « enregistrement » serait un mensonge sur un sujet de consentement.
    const state: RecordingState = { phase: 'recording', mode: 'transcript' };

    await render(<RecordingIndicator state={state} />);

    expect(screen.getByTestId('recording-indicator')).toHaveTextContent(
      'recording.transcriptActive',
    );
  });

  it('reste visible pendant la sauvegarde', async () => {
    const state: RecordingState = { phase: 'saving', mode: 'screen_recording' };

    await render(<RecordingIndicator state={state} />);

    expect(screen.getByTestId('recording-indicator')).toHaveTextContent('recording.saving');
  });

  it('dit l’interruption plutôt que de retomber au silence', async () => {
    // Sans ce libellé, un enregistrement mort serait indiscernable d'un
    // enregistrement jamais démarré.
    const state: RecordingState = { phase: 'aborted', mode: 'screen_recording' };

    await render(<RecordingIndicator state={state} />);

    expect(screen.getByTestId('recording-indicator')).toHaveTextContent('recording.aborted');
  });

  // C1, même famille que waitingBanner.spec.tsx et cameraMenu.spec.tsx :
  // `call.tsx` force un fond sombre dans les deux schémas alors que le thème
  // Paper suit le schéma système. Sans cette couleur explicite, le texte
  // retomberait sur `theme.colors.onSurface` (#1A1A1A en clair, quasi invisible
  // sur ce fond). RNTL ne rend pas les couleurs : ce test ne peut garder que le
  // style est bien posé, pas qu'il rend lisible.
  it('pose la couleur claire du texte sur le fond sombre hérité', async () => {
    const state: RecordingState = { phase: 'recording', mode: 'screen_recording' };

    await render(<RecordingIndicator state={state} />);

    expect(screen.getByTestId('recording-indicator')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });
});
